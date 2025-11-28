export class BaseService {
    static async create(gl, opts) {
        const inst = new this()
        inst.gl = gl
        const { logger } = gl
        logger.info("initializing:", inst.constructor.name)
        const err = await inst.init(gl, opts)
        if (err) {
            logger.error("initializing ", inst.constructor.name, "failed:", err)
            throw new Error(err)
        }
        logger.info("initializing ", inst.constructor.name, " successfully")
        if (inst.regEndpoints && gl.app) {
            logger.info("registing endpoints for ", inst.constructor.name)
            await inst.regEndpoints(gl.app)
        }
        gl[inst.constructor.name.toLowerCase()] = inst
        return inst
    }
}