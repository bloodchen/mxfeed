import axios from 'axios';
import dotenv from 'dotenv';
import { Redis } from 'ioredis';
import { DB } from './db.js';
import { Config } from './config.js';

dotenv.config({ path: 'env' });

const API_URL = `http://localhost:${process.env.PORT || 8081}`;
const redis = new Redis(process.env.redis);

const gl = { config: Config, logger: { info: console.log, error: console.error } };

async function test() {
    try {
        const db = await DB.create(gl);
        console.log('--- Testing Redis Stats Sync ---');

        const uid = 3001;

        // 1. Create Post
        console.log('Creating post...');
        const postRes = await axios.post(`${API_URL}/v1/posts`,
            { content: { text: "Stats Sync Test Post" } },
            { headers: { 'X-User-ID': uid.toString() } }
        );
        const postId = postRes.data.result.post_id;
        console.log(`Post created: ${postId}`);

        // 2. Like Post (Atomic Redis Update)
        console.log('Liking post...');
        await axios.post(`${API_URL}/v1/posts/${postId}/like`, {}, {
            headers: { 'X-User-ID': uid.toString() }
        });
        console.log('✅ Liked');

        // 3. Verify Redis Hash
        console.log('Verifying Redis Hash...');
        const stats = await redis.hgetall(`post:stats:${postId}`);
        console.log('Redis Stats:', stats);
        if (parseInt(stats.likes) === 1) {
            console.log('✅ Redis stats correct');
        } else {
            console.error('❌ Redis stats incorrect');
            process.exit(1);
        }

        // 4. Verify DB stats (should NOT be updated yet immediately, but sync is 5s)
        // We check immediately
        console.log('Verifying DB stats (immediate)...');
        let post = await db.findOne('SELECT stats FROM posts WHERE post_id = $1', [postId]);
        let dbStats = post.stats;
        if (typeof dbStats === 'string') dbStats = JSON.parse(dbStats);

        console.log('DB Stats (Immediate):', dbStats);
        // Note: createPost initializes stats to 0.
        // If sync hasn't run, it should be 0.

        // 5. Wait for Sync (6s)
        console.log('Waiting for sync (6s)...');
        await new Promise(resolve => setTimeout(resolve, 6000));

        // 6. Verify DB stats (after sync)
        console.log('Verifying DB stats (after sync)...');
        post = await db.findOne('SELECT stats FROM posts WHERE post_id = $1', [postId]);
        dbStats = post.stats;
        if (typeof dbStats === 'string') dbStats = JSON.parse(dbStats);

        console.log('DB Stats (After Sync):', dbStats);
        if (dbStats.likes === 1) {
            console.log('✅ DB stats synced correctly');
        } else {
            console.error('❌ DB stats NOT synced');
            process.exit(1);
        }

        // 7. Verify Feed (Read Merging)
        console.log('Verifying Feed Read Merging...');
        const feedRes = await axios.get(`${API_URL}/v1/feed?limit=1`, {
            headers: { 'X-User-ID': uid.toString() }
        });
        const feedPost = feedRes.data.result.posts.find(p => p.post_id === postId);
        if (feedPost && feedPost.stats.likes === 1) {
            console.log('✅ Feed returns correct merged stats');
        } else {
            console.error('❌ Feed returned incorrect stats:', feedPost ? feedPost.stats : 'Post not found');
            process.exit(1);
        }

        console.log('--- All Tests Passed ---');

    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    } finally {
        redis.disconnect();
        // db might not be defined if DB.create failed, but here it is inside try block.
        // But db variable is scoped to try block?
        // No, const db is inside try.
        // I should move it out or handle close inside try.
        // For simplicity, I'll let process exit handle DB close or just ignore.
        process.exit(0);
    }
}

test();
