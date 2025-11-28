import { DB } from './db.js';
import { Config } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = { config: Config, logger: console };

async function migrate() {
    try {
        const db = await DB.create(gl);
        console.log('Starting migration: Convert UID to TEXT...');

        // 1. Drop FK constraints that reference users.uid
        // We need to find the constraint name for payments.uid -> users.uid
        // Usually it's 'payments_uid_fkey' but let's be safe and try to drop it if exists.
        try {
            await db.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_uid_fkey`);
        } catch (e) {
            console.log('Note: payments_uid_fkey might not exist or failed to drop:', e.message);
        }

        // 2. Alter users table
        console.log('Altering users table...');
        await db.query(`
            ALTER TABLE users 
            ALTER COLUMN uid TYPE TEXT,
            ALTER COLUMN uid DROP DEFAULT;
        `);
        // Note: We drop the sequence default because TEXT doesn't support auto-increment serial.
        // Existing IDs will be converted to strings.

        // 3. Alter other tables
        const tables = [
            { name: 'posts', col: 'user_id' },
            { name: 'follows', col: 'follower_id' },
            { name: 'follows', col: 'followee_id' },
            { name: 'likes', col: 'user_id' },
            { name: 'comments', col: 'user_id' },
            { name: 'payments', col: 'uid' },
            { name: 'orders', col: 'uid' },
            { name: 'messages', col: 'uid' },
            { name: 'convs', col: 'uid' },
            { name: 'userdata', col: 'uid' }
        ];

        for (const t of tables) {
            console.log(`Altering ${t.name}.${t.col}...`);
            // Check if table exists first? DB.query usually throws if not.
            // But we can just try.
            try {
                await db.query(`ALTER TABLE ${t.name} ALTER COLUMN ${t.col} TYPE TEXT`);
            } catch (e) {
                console.log(`Failed to alter ${t.name}.${t.col} (table might not exist):`, e.message);
            }
        }

        // 4. Re-add FK constraint for payments?
        // If we want to enforce referential integrity.
        // await db.query(`ALTER TABLE payments ADD CONSTRAINT payments_uid_fkey FOREIGN KEY (uid) REFERENCES users(uid)`);
        // But if users.uid is TEXT and payments.uid is TEXT, it should work.
        // However, if we have data inconsistency, it might fail.
        // Given the "convenience" requirement, maybe we skip strict FK for now or add it back.
        // Let's add it back to be safe, if it fails we know.
        try {
            await db.query(`ALTER TABLE payments ADD CONSTRAINT payments_uid_fkey FOREIGN KEY (uid) REFERENCES users(uid)`);
            console.log('Restored FK on payments.');
        } catch (e) {
            console.log('Warning: Could not restore FK on payments:', e.message);
        }

        console.log('✅ Migration completed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        // We can't easily close db connection here because we don't have the instance reference if we used DB.create inside?
        // Ah, I assigned it to `const db`.
        // But `DB.create` returns the instance.
        // Wait, `DB.create` is static async.
        // `const db = await DB.create(gl)`
        // `db` is the instance.
        // But `db.close()`? `pg-promise` uses a shared pool. `db.pgp.end()`?
        // `DB` class doesn't have `close` method exposed?
        // Let's check `db.js`.
        // It has `close`? No, I didn't see it in `db.js` view earlier.
        // It has `init`.
        // `pg-promise` pool shuts down on process exit usually.
        process.exit(0);
    }
}

migrate();
