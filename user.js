import { BaseService } from './common/baseService.js';
import crypto from 'crypto';

export class User extends BaseService {
  constructor() {
    super();
    this.tableName = 'users';
  }

  /**
   * 初始化用户服务
   * @param {Object} gl - 全局对象
   * @returns {Promise<string|null>} 错误信息或null
   */
  async init(gl) {
    this.gl = gl;
    try {
      const { logger, db } = gl;

      if (!db) {
        return '数据库服务未初始化';
      }

      logger.info('用户服务初始化成功');
      return null;
    } catch (error) {
      return `用户服务初始化失败: ${error.message}`;
    }
  }



  /**
   * 获取第三方应用名称
   * @param {number} frm - 第三方应用ID
   * @returns {string} 应用名称
   */
  getFromName(frm) {
    const fromMap = {
      1: 'Magic Link',
      2: 'Google',
      3: 'Maxthon'
    };

    return fromMap[frm] || `Unknown(${frm})`;
  }

  /**
   * 创建用户
   * @param {Object} userData - 用户数据
   * @returns {Promise<Object>} 创建的用户信息
   */
  async createUser({ uid, frm = 0, info = {}, status = 1 }) {
    const { db, logger } = this.gl;
    const userData = { uid, frm, info, status }; // Collect args

    // 创建用户
    const newUser = await db.insert('users', {
      uid: userData.uid, // Explicitly pass uid if provided in createUser
      frm,
      info: JSON.stringify(info),
      status
    });

    logger.info('用户创建成功', { uid: newUser.uid, frm });
    return newUser;
  }



  /**
   * 根据邮箱或UID获取用户信息
   * @param {Object} params - 查询参数
   * @param {string} params.email - 邮箱（可选）
   * @param {number} params.uid - 用户ID（可选）
   * @returns {Promise<Object|null>} 用户信息或null
   */
  async getUser({ uid }) {
    if (!uid) {
      throw new Error('必须提供用户ID');
    }

    const query = 'SELECT uid, frm, info, interests, created_at, updated_at, status FROM users WHERE uid = $1';
    const params = [uid];

    const user = await this.gl.db.findOne(query, params);
    return user;
  }
  /**
   * 更新用户信息
   * @param {number} uid - 用户ID
   * @param {Object} updateData - 更新的数据
   * @returns {Promise<Object>} 更新后的用户信息
   */
  async updateUser(uid, updateData) {


    const updatedUser = await this.gl.db.update('users', updateFields, { uid });

    if (!updatedUser) {
      throw new Error('用户不存在');
    }

    this.gl.logger.info('用户信息更新成功', {
      uid,
      updatedFields: Object.keys(updateFields)
    });

    // 返回用户信息（不包含密码）
    const { pass, ...userInfo } = updatedUser;
    return userInfo;
  }

  async getUserInfo(uid) {
    const user = await this.getUser({ uid });
    if (!user) {
      return { err: "user-not-found" }
    }
    return user.info
  }
  /**
   * 更新用户info属性下的子对象或属性
   * @param {number} uid - 用户ID
   * @param {Object} infoUpdates - 要更新的info子属性
   * @returns {Promise<Object>} 更新后的用户信息
   */
  async updateUserInfo(uid, infoUpdates) {
    if (!infoUpdates || typeof infoUpdates !== 'object') {
      throw new Error('info更新数据必须是对象');
    }

    // 获取当前用户信息
    const user = await this.getUser({ uid });
    if (!user) {
      return { code: 100, err: "no-user" }
    }

    // 解析当前的info字段
    let currentInfo = {};
    try {
      currentInfo = typeof user.info === 'string' ? JSON.parse(user.info) : (user.info || {});
    } catch (error) {
      this.gl.logger.warn('解析用户info字段失败，使用空对象', { uid, error: error.message });
      currentInfo = {};
    }

    // 合并更新的info属性
    const updatedInfo = { ...currentInfo, ...infoUpdates };

    // 更新用户info字段
    const updatedUser = await this.gl.db.update('users',
      { info: JSON.stringify(updatedInfo) },
      { uid }
    );

    if (!updatedUser) {
      return { code: 100, err: "update-info-failed" }
    }

    this.gl.logger.info('用户info更新成功', {
      uid,
      updatedFields: Object.keys(infoUpdates)
    });

    // 返回用户信息（不包含密码）
    const { pass, ...userInfo } = updatedUser;
    return { code: 0, info: userInfo };
  }

  /**
   * 更新用户兴趣标签
   * @param {number} uid - 用户ID
   * @param {Array} interests - 兴趣标签列表
   * @returns {Promise<Object>} 更新结果
   */
  async updateInterests(uid, interests) {
    if (!Array.isArray(interests)) {
      throw new Error('Interests must be an array');
    }
    // Ensure unique tags and valid strings
    const uniqueInterests = [...new Set(interests)].filter(t => typeof t === 'string' && t.trim());

    const result = await this.gl.db.update('users', { interests: JSON.stringify(uniqueInterests) }, { uid });
    return result;
  }


  /**
   * 删除用户（软删除，设置status为0）
   * @param {number} uid - 用户ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteUser(uid) {
    const result = await this.gl.db.update('users', { status: 0 }, { uid });

    if (!result) {
      throw new Error('用户不存在');
    }

    this.gl.logger.info('用户删除成功', { uid });

    return true;
  }

  /**
   * 获取用户等级
   * @param {number} uid - 用户ID
   * @returns {Promise<number>} 用户等级，如果level_exp已过期则返回0
   */
  async getUserLevel(uid) {
    return 0;
  }

  /**
   * 确保用户存在，如果不存在则创建用户
   * @param {Object} userData - 用户数据
   * @param {string} userData.email - 邮箱（可选，如果提供uid则可不提供）
   * @param {number} userData.uid - 用户ID（可选，如果提供email则可不提供）
   * @param {string} userData.frm - 第三方来源
   * @param {Object} userData.info - 用户信息（可选）
   * @returns {Promise<Object>} 用户信息
   */
  async ensureUser({ uid, frm, info = {} }) {
    // 参数验证
    if (!uid) {
      throw new Error('必须提供用户ID');
    }

    let user = null;

    // 根据提供的参数查找用户
    user = await this.getUser({ uid });

    // 如果用户存在，返回用户信息
    if (user) {
      this.gl.logger.info('用户已存在', {
        uid: user.uid,
        frm: user.frm
      });
      return user;
    }

    // 如果用户不存在，创建新用户
    // Ensure uid is string
    const uidStr = String(uid);
    const newUser = await this.createUser({ uid: uidStr, frm: frm || 0, info });

    this.gl.logger.info('用户创建成功', { uid: newUser.uid, frm: newUser.frm, fromName: this.getFromName(newUser.frm) });

    return newUser;
  }


  async handleLoginSuccessful_fromCommonAPI({ OTT, ...rest }) {
    const { redis } = this.gl
    console.log("handleLoginSuccessful_fromCommonAPI", OTT, rest)
    if (!OTT) return { code: 100, err: "no-ott" }
    // Simplified: No email, just ensure user exists if we had UID?
    // But this method relies on email from upstream.
    // If we remove email, we can't map email -> uid easily unless we store it in info.
    // For now, I'll comment out or simplify to just return ok, as auth is handled upstream via X-User-ID.
    return { msg: "ok" }
  }
  async handleOrderPaid_fromCommonAPI(meta) {
    const { db } = this.gl
    const { uid, type, amount, id: order_id } = meta
    await db.insert('payments', { uid, type, amount, order_id, meta })
    if (type === 1) return { msg: "ok" }
    if (!uid) return { err: "no-uid" }
    return await this.updateUserInfo(uid, { pay: meta })
  }

  async getPlan({ user, uid }) {
    if (!user) user = await this.getUser({ uid })
    if (!user?.info?.pay) return "free"
    const { name, endTime } = user?.info?.pay
    if (endTime * 1000 < Date.now()) return 'free'
    if (name === 'Plus Plan Monthly' || name === 'Plus Plan Yearly') {
      return 'plus'
    }
    if (name === 'Ultra Plan Monthly' || name === 'Ultra Plan Yearly') {
      return 'ultra'
    }
    return 'free'
  }


  /**
   * 注册用户管理相关的API端点
   * @param {Object} app - Fastify应用实例
   */
  async regEndpoints(app) {
    // Authentication is handled by upstream API Gateway
    // This service only needs to trust the X-User-ID header

    // Keep utility endpoints for user info if needed
    app.get('/user/info', async (req, res) => {
      try {
        const uid = req.uid;
        if (!uid) return { err: 'user-not-authenticated' };

        const user = await this.getUserById(uid);
        if (!user) return { err: 'user-not-found' };

        return { result: user };
      } catch (error) {
        this.gl.logger.error('Get user info failed', { error: error.message, uid: req.uid });
        return { err: 'internal-server-error' };
      }
    });
    app.get('/user/verifyCode', async (req, res) => {
      const { util, mail } = this.gl
      const { email, code } = req.query
      const result = await mail.verifyEmailCode({ email, code })
      if (result.code === 0) {
        const user = await this.ensureUser({ email, frm: 3 })
        const token = await util.uidToToken({ uid: user.uid, create: Date.now(), expire: Date.now() + 3600 * 24 * 30 })
        util.setCookie({ req, res, name: `${process.env.APP_NAME}_ut`, value: token, days: 30, secure: true })
        return { result: user };
      }
      return { err: 'invalid-code' }
    })

    // 更新用户信息
    app.post('/user/update', async (req, res) => {
      try {
        const uid = req.uid;
        if (!uid) {
          return { err: 'user-not-login' };
        }

        const updateData = req.body;
        const user = await this.updateUser(uid, updateData);

        return { result: user };
      } catch (error) {
        this.gl.logger.error('更新用户信息失败', { error: error.message, uid: req.uid });
        return { err: 'internal-server-error' };
      }
    });

    // 更新用户info属性
    app.post('/user/info/update', async (req, res) => {
      try {
        const uid = req.uid;
        if (!uid) {
          return { err: 'user-not-login' };
        }

        const infoUpdates = req.body;
        const user = await this.updateUserInfo(uid, infoUpdates);

        return { result: user };
      } catch (error) {
        this.gl.logger.error('更新用户info失败', { error: error.message, uid: req.uid });
        return { err: 'internal-server-error' };
      }
    });

    // 更新用户兴趣标签
    app.post('/v1/users/tags', async (req, res) => {
      try {
        const uid = req.uid;
        if (!uid) {
          return { err: 'user-not-login' };
        }

        const { tags } = req.body;
        if (!tags) {
          return { err: 'tags-required' };
        }

        await this.updateInterests(uid, tags);

        return { result: 'ok' };
      } catch (error) {
        this.gl.logger.error('更新用户兴趣失败', { error: error.message, uid: req.uid });
        return { err: 'internal-server-error' };
      }
    });

    // 删除用户
    app.delete('/user/delete', async (req, res) => {
      try {
        const uid = req.uid;
        if (!uid) {
          return { err: 'user-not-login' };
        }
        await this.deleteUser(uid);

        return { result: '用户删除成功' };
      } catch (error) {
        this.gl.logger.error('删除用户失败', { error: error.message, uid: req.uid });
        return { err: 'internal-server-error' };
      }
    });


    // 获取其他用户信息（邮箱和头像）
    app.get('/user/otherUserInfo', async (req, res) => {
      try {
        const { uids } = req.query;
        if (!uids) {
          return { err: 'missing-uids-parameter' };
        }

        const { db } = this.gl;

        // 解析用户ID字符串，支持逗号分隔的多个ID
        const userIds = uids.toString().split(',').map(uid => uid.trim()).filter(uid => uid);

        if (userIds.length === 0) {
          return { err: 'invalid-uids-parameter' };
        }

        // 查询用户信息（只返回头像）
        const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
        const query = `
          SELECT uid, info->>'avatar' as avatar
          FROM users 
          WHERE uid IN (${placeholders})
        `;

        const result = await db.query(query, userIds);

        // 构建结果对象，以uid为key
        const userInfoMap = {};
        result.rows.forEach(row => {
          userInfoMap[row.uid] = {
            avatar: row.avatar || null
          };
        });

        return { result: userInfoMap };
      } catch (error) {
        this.gl.logger.error('获取其他用户信息失败', { error: error.message, query: req.query });
        return { err: 'internal-server-error' };
      }
    });

  }
}