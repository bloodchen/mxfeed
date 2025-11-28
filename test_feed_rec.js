import { DB } from './db.js';
import { User } from './user.js';
import { Posts } from './posts.js';
import { Logger } from './logger.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = {
    logger: new Logger(),
    util: {
        generateId: () => Date.now().toString() + Math.floor(Math.random() * 1000),
    },
    queue: {
        addFanoutTask: async () => { }
    },
    redis: {
        $r: {
            pipeline: () => ({
                set: () => { },
                hset: () => { },
                expire: () => { },
                get: () => { },
                hgetall: () => { },
                exec: async () => { return []; }
            }),
            zadd: async () => { },
            zrevrangebyscore: async () => { return []; }, // Mock empty private/global feed
            get: async () => { return 0; },
            spop: async () => { return []; }
        },
        get: async () => { return 0; }
    }
};

async function test() {
    const db = new DB();
    await db.init(gl);
    gl.db = db;

    const user = new User();
    await user.init(gl);

    const posts = new Posts();
    await posts.init(gl);

    try {
        console.log('Starting Feed Recommendation Verification...');

        // 1. Setup User with Interests
        const uid = 'test_rec_user_' + Date.now();
        console.log(`Creating user ${uid} with interests...`);
        await user.ensureUser({ uid, frm: 0 });
        await user.updateInterests(uid, ['tech', 'space']);

        // 2. Create Posts
        // a. Matching post
        const p1 = await posts.createPost({ uid: 'other_user', content: { text: 'This is about #tech and #space' } });
        console.log('Created matching post:', p1.post_id);

        // b. Non-matching post
        const p2 = await posts.createPost({ uid: 'other_user', content: { text: 'This is about #cooking' } });
        console.log('Created non-matching post:', p2.post_id);

        // c. Matching but old post (to test sorting if we had multiple)
        // For now just one matching is enough to verify it appears.

        // 3. Get Feed
        console.log('Fetching feed...');
        const feed = await posts.getFeed({ uid });

        console.log('Feed results:', feed.posts.map(p => ({ id: p.post_id, is_recommend: p.is_recommend })));

        const found = feed.posts.find(p => p.post_id == p1.post_id);
        const notFound = feed.posts.find(p => p.post_id == p2.post_id);

        if (found && found.is_recommend) {
            console.log('✅ Matching post found in feed as recommendation.');
        } else {
            console.error('❌ Matching post NOT found or NOT marked as recommendation.');
        }

        if (!notFound) {
            console.log('✅ Non-matching post NOT found in feed.');
        } else {
            console.error('❌ Non-matching post FOUND in feed (should be excluded).');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await db.close();
    }
}

test();
