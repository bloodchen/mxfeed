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
        console.log('Starting migration: Add tags and interests...');

        // 1. Add interests to users
        console.log('Adding interests to users...');
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS interests JSONB DEFAULT '[]'
        `);

        // 2. Add tags to posts
        console.log('Adding tags to posts...');
        await db.query(`
            ALTER TABLE posts 
            ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'
        `);

        // 3. Create GIN index on posts.tags
        console.log('Creating GIN index on posts.tags...');
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_posts_tags ON posts USING GIN (tags)
        `);

        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.close();
    }
}

migrate();
