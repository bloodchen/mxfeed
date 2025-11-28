import { BaseService } from './common/baseService.js';
import { Queue } from 'bullmq';

export class QueueService extends BaseService {
    constructor() {
        super();
        this.queues = {};
    }

    async init(gl) {
        this.gl = gl;
        const { config } = gl;
        const redisUrl = process.env.REDIS || config.redis || 'redis://localhost:6379';

        // Parse redis URL to connection options if needed, or let BullMQ handle it.
        // BullMQ accepts a connection object.
        // Let's use the same connection logic as ioredis if possible, or just pass the URL.
        // BullMQ uses ioredis under the hood.

        const connection = {
            url: redisUrl,
        };

        // Initialize fanout queue
        this.queues.fanout = new Queue('fanout_queue', { connection: new URL(redisUrl) });

        this.gl.queue = this; // Alias for easier access
        this.gl.logger.info('QueueService initialized');
    }

    async addFanoutTask(data) {
        // data: { post_id, user_id }
        await this.queues.fanout.add('fanout_post', data);
        this.gl.logger.info('Added fanout task', { post_id: data.post_id });
    }

    async close() {
        for (const key in this.queues) {
            await this.queues[key].close();
        }
    }
}
