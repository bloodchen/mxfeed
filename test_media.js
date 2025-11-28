import { DB } from './db.js';
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
                exec: async () => { return []; }
            }),
            zadd: async () => { }
        }
    }
};

async function test() {
    const db = new DB();
    await db.init(gl);
    gl.db = db;

    const posts = new Posts();
    await posts.init(gl);

    try {
        console.log('Starting Media Support Verification...');

        const uid = 'test_media_user_' + Date.now();
        const media = [
            { type: 'image', url: 'https://example.com/image1.jpg', width: 800, height: 600 },
            { type: 'video', url: 'https://example.com/video1.mp4', duration: 120 }
        ];

        console.log('Creating post with media...');
        const { post_id } = await posts.createPost({
            uid,
            content: { text: 'Check out this media!' },
            media
        });

        console.log('Post created:', post_id);

        const dbPost = await db.findOne('SELECT media FROM posts WHERE post_id = $1', [post_id]);
        console.log('Saved media in DB:', dbPost.media);

        if (dbPost.media.length === media.length &&
            dbPost.media[0].url === media[0].url &&
            dbPost.media[1].type === media[1].type) {
            console.log('✅ Media saved correctly.');
        } else {
            console.error('❌ Media mismatch!');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await db.close();
    }
}

test();
