import { DB } from './db.js';
import { Config } from './config.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const gl = { config: Config, logger: console };

async function test() {
    const db = await DB.create(gl);

    // Check the search_vector content
    const result = await db.query(`
        SELECT post_id, content->>'text' as text, search_vector::text 
        FROM posts 
        WHERE post_id = '256659714459308032'
    `);

    console.log('Post content and search_vector:');
    console.log(JSON.stringify(result.rows, null, 2));

    // Test different search queries
    const queries = ['测试', '中文', 'hashtag', 'mention'];

    for (const q of queries) {
        const searchResult = await db.query(`
            SELECT post_id, ts_rank(search_vector, websearch_to_tsquery('simple', $1)) as rank
            FROM posts
            WHERE search_vector @@ websearch_to_tsquery('simple', $1)
            ORDER BY rank DESC
        `, [q]);

        console.log(`\nSearch for "${q}":`, searchResult.rows.length, 'results');
        if (searchResult.rows.length > 0) {
            console.log(searchResult.rows);
        }
    }

    process.exit(0);
}

test();
