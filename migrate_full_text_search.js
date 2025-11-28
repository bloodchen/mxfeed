import { DB } from './db.js';
import { Config } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = { config: Config, logger: console };

async function migrate() {
    try {
        const db = await DB.create(gl);
        console.log('Starting migration: Full-Text Search...');

        // 1. Add search_vector column
        console.log('Adding search_vector column...');
        await db.query(`
            ALTER TABLE posts 
            ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;
        `);

        // 2. Create GIN Index
        console.log('Creating GIN index...');
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_posts_search_vector 
            ON posts USING GIN (search_vector);
        `);

        // 3. Create Trigger Function
        // Use 'simple' configuration for multi-language support (Chinese, Japanese, etc.)
        console.log('Creating trigger function...');
        await db.query(`
            CREATE OR REPLACE FUNCTION posts_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector := to_tsvector('simple', COALESCE(NEW.content->>'text', ''));
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        `);

        // 4. Create Trigger
        console.log('Creating trigger...');
        await db.query(`
            DROP TRIGGER IF EXISTS tsvectorupdate ON posts;
            CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE
            ON posts FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();
        `);

        // 5. Update existing rows
        console.log('Updating existing rows...');
        await db.query(`
            UPDATE posts SET search_vector = to_tsvector('english', COALESCE(content->>'text', ''));
        `);

        console.log('✅ Migration completed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

migrate();
