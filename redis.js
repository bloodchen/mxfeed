import { BaseService } from './common/baseService.js'
import IOredis from 'ioredis'

export class Redis extends BaseService {
    async init(gl) {
        const { config } = gl
        // redis.set('key', 100, 'ex', 10) //set key expires after 10 seconds
        try {
            const addr = process.env.REDIS || config.redis
            this.$r = new IOredis(addr, { maxRetriesPerRequest: 1 })
            await this.set('test', '123')
            const v = await this.get('test')
            if (v !== '123') return 'error'
        } catch (e) {
            console.log(e.message)
        }
    }
    async close() {
    }
    async set(...argc) {
        return await this.$r.set(...argc)
    }
    async get(key) {
        return await this.$r.get(key)
    }
    async sadd(...argc) {
        return await this.$r.sadd(...argc)
    }
    async smembers(...argc) {
        return await this.$r.smembers(...argc)
    }
}