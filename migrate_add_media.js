import { DB } from './db.js';
import { Logger } from './logger.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = {
    logger: new Logger(),
};

async function migrate() {
    const db = new DB();
    await db.init(gl);

    try {
        console.log('Starting migration: Add media column to posts...');

        // Add media to posts
        console.log('Adding media to posts...');
        await db.query(`
            ALTER TABLE posts 
            ADD COLUMN IF NOT EXISTS media JSONB DEFAULT '[]'
        `);

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.close();
    }
}

migrate();
