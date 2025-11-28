import dotenv from "dotenv";
import { Worker } from 'bullmq';
import { Logger } from './logger.js';
import { Config } from './config.js';
import { DB } from './db.js';
import { Redis } from './redis.js';
import { Posts } from './posts.js';

dotenv.config({ path: "env" });

const gl = {};

async function main() {
    // Initialize Services


    // Start Stats Sync Loop (every 5 seconds)
    setInterval(async () => {
        try {
            await posts.syncStatsToDb();
        } catch (error) {
            gl.logger.error('Stats sync failed', error);
        }
    }, 5000);

    // Initialize Logger
    gl.logger = new Logger({
        serviceName: 'worker-service',
        logDir: process.env.LOG_DIR || './logs'
    });
    gl.config = Config;

    // Initialize Services (Posts)
    const posts = await Posts.create(gl);
    gl.posts = posts;

    // Start Stats Sync Loop (every 5 seconds)
    setInterval(async () => {
        try {
            await posts.syncStatsToDb();
        } catch (error) {
            gl.logger.error('Stats sync failed', error);
        }
    }, 5000);

    // Initialize Services (Posts) - Moved here


    // Start Stats Sync Loop (every 5 seconds) - Moved here
    setInterval(async () => {
        try {
            await posts.syncStatsToDb();
        } catch (error) {
            gl.logger.error('Stats sync failed', error);
        }
    }, 5000);

    // Initialize Redis
    await Redis.create(gl);

    // Initialize DB
    await DB.create(gl);

    // The duplicate Posts initialization block was here and has been removed.
    // const posts = await Posts.create(gl);
    // gl.posts = posts;

    // The duplicate setInterval block was here and has been removed.
    // setInterval(async () => {
    //     try {
    //         await posts.syncStatsToDb();
    //     } catch (error) {
    //         gl.logger.error('Stats sync failed', error);
    //     }
    // }, 5000);

    const redisUrl = process.env.redis || 'redis://localhost:6379';
    const connection = {
        url: redisUrl,
    };

    gl.logger.info('Worker Service Starting...');

    const worker = new Worker('fanout_queue', async job => {
        gl.logger.info('Processing job', { id: job.id, name: job.name, data: job.data });

        if (job.name === 'fanout_post') {
            await handleFanout(job.data);
        }
    }, {
        connection: new URL(redisUrl),
        concurrency: 5
    });

    worker.on('completed', job => {
        gl.logger.info(`Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
        gl.logger.error(`Job ${job.id} failed`, { error: err.message });
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await worker.close();
        await gl.db.close();
        process.exit(0);
    });
}

async function handleFanout({ post_id, user_id }) {
    const { db, redis, logger } = gl;

    // 1. Get followers
    // We might need pagination if there are millions of followers, but for now fetch all.
    const followers = await db.query('SELECT follower_id FROM follows WHERE followee_id = $1', [user_id]);

    const followerIds = followers.rows.map(row => row.follower_id);
    // Add self to timeline as well
    followerIds.push(user_id);

    logger.info(`Fanout post ${post_id} to ${followerIds.length} timelines`);

    // 2. Write to Redis Timelines
    // Batch writes using pipeline
    const pipeline = redis.$r.pipeline();
    const timestamp = Date.now();

    for (const fid of followerIds) {
        const key = `timeline:feed:${fid}`;
        // ZADD key score member
        pipeline.zadd(key, timestamp, post_id);
        // Optional: Trim timeline to keep only latest N posts (e.g., 1000)
        // pipeline.zremrangebyrank(key, 0, -1001); 
    }

    await pipeline.exec();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
