import { BaseService } from './common/baseService.js';

export class Follows extends BaseService {
    constructor() {
        super();
        this.tableName = 'follows';
    }

    async init(gl) {
        this.gl = gl;
    }

    async followUser({ follower_id, followee_id }) {
        const { db } = this.gl;
        // Check if self-following
        if (follower_id === followee_id) {
            throw new Error('cannot-follow-self');
        }

        // Ensure followee exists (auto-create if needed for test users)
        // We use a placeholder email since we trust the upstream ID
        if (this.gl.user) {
            await this.gl.user.ensureUser({
                uid: followee_id,
                frm: 0
            });
        } else {
            // Fallback if User service not available (should not happen based on config)
            const followee = await db.findOne('SELECT uid FROM users WHERE uid = $1', [followee_id]);
            if (!followee) {
                throw new Error('user-not-found');
            }
        }

        await db.query(`
            INSERT INTO follows (follower_id, followee_id)
            VALUES ($1, $2)
            ON CONFLICT (follower_id, followee_id) DO NOTHING
        `, [follower_id, followee_id]);

        return { followed: true };
    }

    async unfollowUser({ follower_id, followee_id }) {
        const { db } = this.gl;
        await db.query(`
            DELETE FROM follows
            WHERE follower_id = $1 AND followee_id = $2
        `, [follower_id, followee_id]);

        return { unfollowed: true };
    }

    async regEndpoints(app) {
        app.post('/v1/follows', async (req, res) => {
            try {
                const follower_id = req.uid;
                if (!follower_id) return { err: 'user-not-login' };

                const { followee_id, action } = req.body;
                if (!followee_id) return { err: 'followee_id-required' };

                if (action === 'unfollow') {
                    const result = await this.unfollowUser({ follower_id, followee_id });
                    return { result };
                } else {
                    const result = await this.followUser({ follower_id, followee_id });
                    return { result };
                }
            } catch (error) {
                this.gl.logger.error('Follow action failed', { error: error.message, uid: req.uid });
                if (error.message === 'user-not-found' || error.message === 'cannot-follow-self') {
                    return { err: error.message };
                }
                return { err: 'internal-server-error' };
            }
        });
    }
}
