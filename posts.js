import { BaseService } from './common/baseService.js';

export class Posts extends BaseService {
    constructor() {
        super();
        this.tableName = 'posts';
    }

    async init(gl) {
        this.gl = gl;
    }

    extractTags(content) {
        if (!content || typeof content !== 'object') return [];
        const text = content.text || '';
        // Match hashtags: # followed by alphanumeric or CJK characters
        const matches = text.match(/#[\w\u4e00-\u9fa5]+/g);
        if (!matches) return [];
        // Remove # and deduplicate
        return [...new Set(matches.map(tag => tag.substring(1)))];
    }

    async createPost({ uid, content, media = [] }) {
        const { db, util, queue } = this.gl;
        const post_id = util.generateId();
        const created_at = new Date();

        const tags = this.extractTags(content);

        const postData = {
            post_id,
            user_id: uid,
            created_at,
            content: JSON.stringify(content),
            stats: JSON.stringify({ likes: 0, comments: 0, shares: 0 }),
            tags: JSON.stringify(tags),
            media: JSON.stringify(media)
        };

        await db.insert('posts', postData);

        // Cache the new post
        await this.setPostCache([postData]);

        if (queue) {
            await queue.addFanoutTask({ post_id, user_id: uid });
        }

        return { post_id, created_at };
    }

    async createSystemPost({ uid, content, media = [] }) {
        const { db, util, redis } = this.gl;
        const post_id = util.generateId();
        const created_at = new Date();

        const tags = this.extractTags(content);

        const postData = {
            post_id,
            user_id: uid,
            created_at,
            content: JSON.stringify(content),
            stats: JSON.stringify({ likes: 0, comments: 0, shares: 0 }),
            tags: JSON.stringify(tags),
            media: JSON.stringify(media),
            is_system: true
        };

        // Reuse posts table, maybe add a flag in content or separate column?
        // For now, just insert. The user_id will be the admin's ID.
        await db.insert('posts', postData);

        await this.setPostCache([postData]);

        // Write to Global Feed ZSET
        // Score = timestamp (ms)
        await redis.$r.zadd('global:system:feed', created_at.getTime(), post_id);

        return { post_id, created_at };
    }

    async getPostCache(postIds) {
        const { redis } = this.gl;
        if (!postIds || postIds.length === 0) return [];

        const pipeline = redis.$r.pipeline();

        // 1. Get Content (String)
        postIds.forEach(id => pipeline.get(`post:${id}`));

        // 2. Get Stats (Hash)
        postIds.forEach(id => pipeline.hgetall(`post:stats:${id}`));

        const results = await pipeline.exec();

        // Results are interleaved: [err, content], [err, stats], [err, content]... if we did it that way
        // But we pushed all gets then all hgetalls.
        // So first N are contents, next N are stats.

        const contentResults = results.slice(0, postIds.length);
        const statsResults = results.slice(postIds.length);

        return contentResults.map((res, index) => {
            const contentStr = res[1];
            if (!contentStr) return null;

            const post = JSON.parse(contentStr);
            const stats = statsResults[index][1]; // Redis returns object for hgetall

            // Merge stats if available
            if (stats && Object.keys(stats).length > 0) {
                // Redis returns strings for values in Hash, need to parse to int
                post.stats = {
                    likes: parseInt(stats.likes || 0),
                    comments: parseInt(stats.comments || 0),
                    shares: parseInt(stats.shares || 0)
                };
            }
            // If no stats in Redis yet (e.g. new post or expired), use what's in post (from DB/Cache)
            // But actually, we should trust Redis stats if they exist.
            // If they don't exist, maybe we should init them?
            // For now, if stats is empty, we fallback to post.stats (which might be stale but better than 0)

            return post;
        });
    }

    async setPostCache(posts) {
        const { redis } = this.gl;
        if (!posts || posts.length === 0) return;

        const pipeline = redis.$r.pipeline();
        for (const post of posts) {
            // Cache Content
            pipeline.set(`post:${post.post_id}`, JSON.stringify(post), 'EX', 3600 * 24);

            // Cache Stats (Init if not exists, or overwrite? Overwrite is safer for sync)
            // But wait, if we overwrite, we lose pending increments?
            // No, setPostCache is usually called on creation or cache miss (fetch from DB).
            // If fetching from DB, DB has "persisted" stats.
            // Redis might have "dirty" stats that are newer.
            // We should NOT overwrite Redis stats with DB stats if Redis stats exist.
            // So we use HSETNX or just don't set if exists?
            // Actually, if we are here, it means cache miss on content.
            // Stats might still be there?
            // Let's check if stats key exists before setting?
            // Or just set content. Stats are separate key.
            // If we are populating cache from DB, we should populate stats too IF they are missing.

            // For simplicity: We only set content here.
            // Stats should be managed by updatePostStats and sync.
            // But if stats expire, we need to reload them.
            // Let's add a check: if stats key doesn't exist, set it from DB stats.

            let stats = post.stats;
            if (typeof stats === 'string') stats = JSON.parse(stats);

            // We can use HSET which overwrites fields.
            // But we only want to set if NOT exists to avoid overwriting dirty stats.
            // Redis doesn't have HSETNX for whole hash.
            // We can use NX option for SET but not HSET?
            // Actually, we can just set it. The sync worker flushes to DB.
            // If we reload from DB, it means DB is source of truth?
            // If Redis expired, then DB IS the source of truth.
            // So it is safe to set.

            if (stats) {
                pipeline.hset(`post:stats:${post.post_id}`, {
                    likes: stats.likes || 0,
                    comments: stats.comments || 0,
                    shares: stats.shares || 0
                });
                // Set TTL for stats too?
                pipeline.expire(`post:stats:${post.post_id}`, 3600 * 24);
            }
        }
        await pipeline.exec();
    }

    async commentPost({ uid, postId, content, parentId = 0 }) {
        const { db, util } = this.gl;
        const comment_id = util.generateId();
        const created_at = new Date();

        // 1. Insert into comments table
        await db.insert('comments', {
            comment_id,
            post_id: postId,
            user_id: uid,
            parent_id: parentId,
            content: JSON.stringify(content),
            created_at
        });

        // 2. Increment stats
        await this.updatePostStats(postId, 'comments', 1);

        return { comment_id, created_at };
    }

    async getComments(postId, limit = 50, offset = 0) {
        const { db } = this.gl;
        const query = `
            SELECT comment_id, post_id, user_id, parent_id, content, created_at
            FROM comments
            WHERE post_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
        `;
        const result = await db.query(query, [postId, limit, offset]);
        return { comments: result.rows };
    }

    /**
     * Search posts using Full-Text Search
     * @param {string} q - Search query
     * @param {number} limit - Limit results
     * @param {number} offset - Offset results
     */
    async searchPosts(q, limit = 20, offset = 0) {
        const { db } = this.gl;
        if (!q) return { posts: [] };

        // Detect if query contains CJK characters
        const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(q);

        let query, params;

        if (hasCJK) {
            // For CJK languages, use LIKE pattern matching
            query = `
                SELECT post_id, 
                       CASE 
                           WHEN content->>'text' ILIKE $1 THEN 1.0
                           ELSE 0.5
                       END as rank
                FROM posts
                WHERE content->>'text' ILIKE $1
                ORDER BY rank DESC, created_at DESC
                LIMIT $2 OFFSET $3
            `;
            params = [`%${q}%`, limit, offset];
        } else {
            // For Latin languages, use full-text search
            query = `
                SELECT post_id, ts_rank(search_vector, websearch_to_tsquery('simple', $1)) as rank
                FROM posts
                WHERE search_vector @@ websearch_to_tsquery('simple', $1)
                ORDER BY rank DESC, created_at DESC
                LIMIT $2 OFFSET $3
            `;
            params = [q, limit, offset];
        }

        const result = await db.query(query, params);
        const postIds = result.rows.map(row => row.post_id);

        if (postIds.length === 0) return { posts: [] };

        // Reuse getPostsByIds to fetch content and merge stats
        const posts = await this.getPostsByIds(postIds);

        // Maintain the order from search results (ranking)
        const postsMap = new Map(posts.map(p => [p.post_id, p]));
        const orderedPosts = postIds.map(id => postsMap.get(id)).filter(p => p);

        return { posts: orderedPosts };
    }

    async getPostsByIds(postIds) {
        const { db } = this.gl;
        if (!postIds || postIds.length === 0) return [];

        const result = await db.query('SELECT * FROM posts WHERE post_id IN ($1:csv)', [postIds]);
        return result.rows;
    }

    async getRecommendedPosts(interests, excludeIds = [], limit = 20) {
        const { db } = this.gl;
        if (!interests || interests.length === 0) return [];

        // Ensure excludeIds is not empty for NOT IN clause, or handle it
        let excludeClause = '';
        const params = [JSON.stringify(interests), limit];

        if (excludeIds.length > 0) {
            excludeClause = `AND post_id NOT IN ($3:csv)`;
            params.push(excludeIds);
        }

        // Use JSONB containment operator @> for tags? 
        // Or overlap operator ?| (exists any)
        // User wants "match interests list". Usually means ANY of the interests match ANY of the tags.
        // Postgres JSONB: tags ?| array['a', 'b'] -> true if tags has 'a' OR 'b'.

        const query = `
            SELECT post_id, created_at 
            FROM posts 
            WHERE tags ?| $1::text[]
            ${excludeClause}
            ORDER BY created_at DESC 
            LIMIT $2
        `;

        // Note: pg-promise might not handle $1::text[] with JSON array input correctly if we pass JSON string.
        // We should pass array of strings.

        const result = await db.query(query, [interests, limit, excludeIds]);
        return result.rows.map(row => ({
            id: row.post_id,
            score: new Date(row.created_at).getTime(), // Convert to timestamp for merging
            is_recommend: true
        }));
    }

    async getFeed({ uid, cursor, limit = 20 }) {
        const { redis, db } = this.gl;
        const personalKey = `timeline:feed:${uid}`;
        const globalKey = 'global:system:feed';

        // Cursor handling: if provided, use `(${cursor}` to exclude it, else '+inf'
        const max = cursor ? `(${cursor}` : '+inf';
        const min = '-inf';

        // Fetch from both feeds
        // We need scores to merge correctly
        const [personalRes, globalRes] = await Promise.all([
            redis.$r.zrevrangebyscore(personalKey, max, min, 'WITHSCORES', 'LIMIT', 0, limit),
            redis.$r.zrevrangebyscore(globalKey, max, min, 'WITHSCORES', 'LIMIT', 0, limit)
        ]);

        // Helper to parse [id, score, id, score...]
        const parseZset = (arr) => {
            const items = [];
            for (let i = 0; i < arr.length; i += 2) {
                items.push({ id: arr[i], score: parseFloat(arr[i + 1]) });
            }
            return items;
        };

        const personalItems = parseZset(personalRes);
        const globalItems = parseZset(globalRes);

        // 3. Get User Interests for Recommendation
        // We need to fetch user interests first.
        // Since we don't have direct access to User service instance here easily unless we inject it or use DB.
        // We can query DB directly for speed.
        const userRes = await db.findOne('SELECT interests FROM users WHERE uid = $1', [uid]);
        const interests = userRes ? userRes.interests : [];

        // 4. Get Recommended Posts
        // Exclude IDs from personal and global feeds to avoid duplicates
        const existingIds = new Set([...personalItems, ...globalItems].map(i => i.id));

        // Also exclude liked/commented posts? (Optional per requirement 8.7b)
        // For now, let's stick to 8.7a (exclude feed items).

        let recommendedItems = [];
        if (interests && interests.length > 0) {
            // We need to fetch enough to fill the gap if personal/global are few?
            // Or just fetch top X and merge?
            // Requirement says "Merge... return Top 20".
            // So we should fetch some recommendations.
            recommendedItems = await this.getRecommendedPosts(interests, Array.from(existingIds), limit);
        }

        // 5. Merge and Sort
        const allItems = [...personalItems, ...globalItems, ...recommendedItems];

        // Deduplicate by ID (in case global and personal overlap, or recommendation logic failed to exclude)
        const uniqueItemsMap = new Map();
        allItems.forEach(item => {
            if (!uniqueItemsMap.has(item.id)) {
                uniqueItemsMap.set(item.id, item);
            } else {
                // If exists, maybe update score or flags?
                // Prioritize personal/global over recommendation flag?
                // If it was in personal, it's not "is_recommend".
                const existing = uniqueItemsMap.get(item.id);
                if (item.is_recommend && !existing.is_recommend) {
                    // Keep existing as non-recommend
                }
            }
        });

        const uniqueItems = Array.from(uniqueItemsMap.values());

        // Sort by score (timestamp) Descending
        uniqueItems.sort((a, b) => b.score - a.score);

        // Slice top limit
        const slicedItems = uniqueItems.slice(0, limit);

        if (slicedItems.length === 0) {
            return { posts: [], next_cursor: null };
        }

        const postIds = slicedItems.map(item => item.id);

        // Fetch Content
        const cachedPosts = await this.getPostCache(postIds);
        const missingIds = [];
        const finalPostsMap = {};

        postIds.forEach((id, index) => {
            if (cachedPosts[index]) {
                finalPostsMap[id] = cachedPosts[index];
            } else {
                missingIds.push(id);
            }
        });

        if (missingIds.length > 0) {
            const dbPosts = await this.getPostsByIds(missingIds);
            await this.setPostCache(dbPosts);
            dbPosts.forEach(post => {
                finalPostsMap[post.post_id] = post;
            });
        }

        // Get Last Read Time
        const readCursorKey = `user:${uid}:read_cursor`;
        const lastReadTimeStr = await redis.get(readCursorKey);
        const lastReadTime = lastReadTimeStr ? parseFloat(lastReadTimeStr) : 0;

        // Assemble Result with is_new flag
        const posts = slicedItems.map(item => {
            const post = finalPostsMap[item.id];
            if (!post) return null;

            // Assuming post.created_at is ISO string or Date object in DB/Cache
            // We can also use the score (timestamp)
            const is_new = item.score > lastReadTime;
            const is_recommend = !!item.is_recommend;

            return { ...post, is_new, is_recommend };
        }).filter(p => p);

        const next_cursor = slicedItems.length > 0 ? slicedItems[slicedItems.length - 1].score : null;

        return { posts, next_cursor };
    }

    async markRead({ uid, timestamp }) {
        const { redis } = this.gl;
        const key = `user:${uid}:read_cursor`;
        // Only update if new timestamp is greater than current
        const current = await redis.get(key);
        if (!current || timestamp > parseFloat(current)) {
            await redis.set(key, timestamp);
        }
        return { success: true };
    }

    async likePost({ uid, postId }) {
        const { db } = this.gl;

        // 1. Insert into likes table (ignore if already exists)
        const result = await db.query(
            'INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [uid, postId]
        );

        if (result.rowCount === 0) {
            return { success: true, message: 'already-liked' };
        }

        // 2. Increment stats
        await this.updatePostStats(postId, 'likes', 1);

        return { success: true };
    }

    async unlikePost({ uid, postId }) {
        const { db } = this.gl;

        // 1. Delete from likes table
        const result = await db.query(
            'DELETE FROM likes WHERE user_id = $1 AND post_id = $2',
            [uid, postId]
        );

        if (result.rowCount === 0) {
            return { success: true, message: 'not-liked' };
        }

        // 2. Decrement stats
        await this.updatePostStats(postId, 'likes', -1);

        return { success: true };
    }

    async updatePostStats(postId, field, delta) {
        const { redis } = this.gl;

        // 1. Atomic Increment in Redis Hash
        await redis.$r.hincrby(`post:stats:${postId}`, field, delta);

        // 2. Refresh TTL
        await redis.$r.expire(`post:stats:${postId}`, 3600 * 24);

        // 3. Mark as dirty (Add to Set)
        await redis.$r.sadd('stats:dirty_posts', postId);
    }

    async syncStatsToDb() {
        const { db, redis } = this.gl;

        // 1. Get dirty posts (limit batch size?)
        // SPOP count
        const batchSize = 100;
        const postIds = await redis.$r.spop('stats:dirty_posts', batchSize);

        if (!postIds || postIds.length === 0) return;

        // 2. Fetch stats for these posts
        const pipeline = redis.$r.pipeline();
        postIds.forEach(id => pipeline.hgetall(`post:stats:${id}`));
        const results = await pipeline.exec();

        // 3. Update DB
        // We can do this in parallel or transaction
        // For simplicity, loop and update.
        // Ideally use a bulk update query.

        for (let i = 0; i < postIds.length; i++) {
            const id = postIds[i];
            const [err, stats] = results[i];

            if (err || !stats) continue;

            // Convert strings to ints
            const cleanStats = {
                likes: parseInt(stats.likes || 0),
                comments: parseInt(stats.comments || 0),
                shares: parseInt(stats.shares || 0)
            };

            // Update DB
            await db.update('posts', { stats: JSON.stringify(cleanStats) }, { post_id: id });
        }

        // this.gl.logger.info(`Synced stats for ${postIds.length} posts`);
    }

    async regEndpoints(app) {
        app.post('/v1/posts', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const { content, media } = req.body;
                if (!content) return { err: 'content-required' };

                const result = await this.createPost({ uid, content, media });
                return { result };
            } catch (error) {
                this.gl.logger.error('Create post failed', { error: error.message, uid: req.uid });
                return { err: 'internal-server-error' };
            }
        });

        app.get('/v1/feed', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const { cursor, limit } = req.query;
                const result = await this.getFeed({ uid, cursor, limit: limit ? parseInt(limit) : 20 });
                return { result };
            } catch (error) {
                this.gl.logger.error('Get feed failed', { error: error.message, uid: req.uid });
                return { err: 'internal-server-error' };
            }
        });

        app.post('/v1/system_posts', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };
                // In real app, check admin role here

                const { content, media } = req.body;
                if (!content) return { err: 'content-required' };

                const result = await this.createSystemPost({ uid, content, media });
                return { result };
            } catch (error) {
                this.gl.logger.error('Create system post failed', { error: error.message, uid: req.uid });
                return { err: 'internal-server-error' };
            }
        });
        app.post('/v1/feed/read', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const { timestamp } = req.body;
                if (!timestamp) return { err: 'timestamp-required' };

                const result = await this.markRead({ uid, timestamp });
                return { result };
            } catch (error) {
                this.gl.logger.error('Mark read failed', { error: error.message, uid: req.uid });
                return { err: 'internal-server-error' };
            }
        });

        app.post('/v1/posts/:id/like', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const postId = req.params.id;
                const result = await this.likePost({ uid, postId });
                return { result };
            } catch (error) {
                this.gl.logger.error('Like post failed', { error: error.message, uid: req.uid, postId: req.params.id });
                return { err: 'internal-server-error' };
            }
        });

        app.delete('/v1/posts/:id/like', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const postId = req.params.id;
                const result = await this.unlikePost({ uid, postId });
                return { result };
            } catch (error) {
                this.gl.logger.error('Unlike post failed', { error: error.message, uid: req.uid, postId: req.params.id });
                return { err: 'internal-server-error' };
            }
        });

        app.post('/v1/posts/:id/comments', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const postId = req.params.id;
                const { content, parent_id } = req.body;
                if (!content) return { err: 'content-required' };

                const result = await this.commentPost({ uid, postId, content, parentId: parent_id });
                return { result };
            } catch (error) {
                this.gl.logger.error('Comment post failed', { error: error.message, uid: req.uid, postId: req.params.id });
                return { err: 'internal-server-error' };
            }
        });

        app.get('/v1/posts/:id/comments', async (req, res) => {
            try {
                const uid = req.uid;
                if (!uid) return { err: 'user-not-login' };

                const postId = req.params.id;
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;

                const result = await this.getComments(postId, limit, offset);
                return { result };
            } catch (error) {
                this.gl.logger.error('Get comments failed', { error: error.message, uid: req.uid, postId: req.params.id });
                return { err: 'internal-server-error' };
            }
        });

        // Search API
        app.get('/v1/search', async (req, res) => {
            try {
                const q = req.query.q;
                const limit = parseInt(req.query.limit) || 20;
                const offset = parseInt(req.query.offset) || 0;

                if (!q) return { result: { posts: [] } };

                const result = await this.searchPosts(q, limit, offset);
                return { result };
            } catch (error) {
                this.gl.logger.error('Search failed', { error: error.message, query: req.query });
                return { err: 'internal-server-error' };
            }
        });
    }
}
