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
                exec: async () => { }
            }),
            zadd: async () => { }
        }
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
        console.log('Starting verification...');

        // 1. Test User Interests
        const uid = 'test_user_' + Date.now();
        console.log(`Creating user ${uid}...`);
        await user.ensureUser({ uid, frm: 0 });

        const interests = ['coding', 'AI', 'pizza'];
        console.log('Updating interests:', interests);
        await user.updateInterests(uid, interests);

        const dbUser = await user.getUser({ uid });
        const savedInterests = typeof dbUser.info === 'string' ? JSON.parse(dbUser.info).interests : dbUser.interests;
        // Wait, interests is a separate column now.
        // Let's check how getUser works.
        // getUser selects: uid, frm, info, created_at, updated_at, status
        // It does NOT select interests!
        // I need to update getUser to select interests or query DB directly.

        const directUser = await db.findOne('SELECT interests FROM users WHERE uid = $1', [uid]);
        console.log('Saved interests in DB:', directUser.interests);

        if (JSON.stringify(directUser.interests) === JSON.stringify(interests)) {
            console.log('✅ User interests verified.');
        } else {
            console.error('❌ User interests mismatch!');
        }

        // 2. Test Post Tags
        const content = { text: 'Hello world! This is a #test post about #coding and #AI.' };
        console.log('Creating post with content:', content.text);
        const { post_id } = await posts.createPost({ uid, content });

        const dbPost = await db.findOne('SELECT tags FROM posts WHERE post_id = $1', [post_id]);
        console.log('Saved tags in DB:', dbPost.tags);

        const expectedTags = ['test', 'coding', 'AI'];
        // Sort to compare
        const savedTags = dbPost.tags.sort();
        const expTags = expectedTags.sort();

        if (JSON.stringify(savedTags) === JSON.stringify(expTags)) {
            console.log('✅ Post tags verified.');
        } else {
            console.error('❌ Post tags mismatch!');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await db.close();
    }
}

test();
