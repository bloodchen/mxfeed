import { DB } from './db.js';
import { Config } from './config.js';
import { createTables } from './dbInit.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = {};
gl.config = Config;
gl.logger = { info: console.log, error: console.error };

async function migrate() {
    const db = new DB();
    db.gl = gl;
    await db.init(gl);

    try {
        console.log('Creating likes and comments tables...');
        // createTables checks if table exists, so it's safe to call
        await createTables(db);
        console.log('✅ Migration successful');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
    } finally {
        await db.close();
    }
}

migrate();
