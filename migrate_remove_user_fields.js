import { DB } from './db.js';
import { Config } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = { config: Config, logger: console };
async function migrate() {
    try {
        const db = await DB.create(gl);
        console.log('Starting migration: Remove email, level, level_exp from users table...');

        // Check if columns exist before dropping to avoid errors if re-run
        // But DROP COLUMN IF EXISTS handles that.

        await db.query(`
            ALTER TABLE users 
            DROP COLUMN IF EXISTS email,
            DROP COLUMN IF EXISTS level,
            DROP COLUMN IF EXISTS level_exp;
        `);

        console.log('✅ Columns dropped successfully.');

        // Drop index if it exists (though dropping column usually drops index, explicit drop is safer if index name is custom)
        // idx_users_email was created in dbInit.js
        await db.query(`DROP INDEX IF EXISTS idx_users_email;`);

        console.log('✅ Indexes dropped successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await db.close();
        process.exit(0);
    }
}

migrate();
