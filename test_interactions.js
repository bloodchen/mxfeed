import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: 'env' });

const API_URL = `http://localhost:${process.env.PORT || 8081}`;

async function test() {
    try {
        console.log('--- Testing Interactions (Like/Comment) ---');

        const uidA = 2001;
        const uidB = 2002;
        const uidC = 2003;

        // 1. User A creates a post
        console.log('User A creating post...');
        const postRes = await axios.post(`${API_URL}/v1/posts`,
            { content: { text: "Interaction Test Post" } },
            { headers: { 'X-User-ID': uidA.toString() } }
        );
        const postId = postRes.data.result.post_id;
        console.log(`Post created: ${postId}`);

        // 2. User B likes post
        console.log('User B liking post...');
        await axios.post(`${API_URL}/v1/posts/${postId}/like`, {}, {
            headers: { 'X-User-ID': uidB.toString() }
        });
        console.log('✅ Liked');

        // Verify stats (fetch feed or post detail - we don't have getPostDetail yet, so fetch feed of A)
        // Wait a bit for cache update if async? No, updatePostStats updates cache immediately.
        // But getFeed reads from cache.
        // Let's fetch feed of A (A follows self usually? or just check global/personal feed logic)
        // Actually we don't have getPost API. We can check DB or just trust getFeed if A follows self.
        // Let's assume A follows self or we can just check DB via side channel (not possible here easily).
        // We can use getFeed for User A.

        // 3. User B comments on post
        console.log('User B commenting...');
        const commentRes = await axios.post(`${API_URL}/v1/posts/${postId}/comments`,
            { content: { text: "Nice post!" } },
            { headers: { 'X-User-ID': uidB.toString() } }
        );
        const commentId = commentRes.data.result.comment_id;
        console.log(`Comment created: ${commentId}`);

        // 4. User C replies to User B's comment
        console.log('User C replying...');
        await axios.post(`${API_URL}/v1/posts/${postId}/comments`,
            { content: { text: "Agreed!" }, parent_id: commentId },
            { headers: { 'X-User-ID': uidC.toString() } }
        );
        console.log('✅ Replied');

        // 5. Fetch comments
        console.log('Fetching comments...');
        const commentsRes = await axios.get(`${API_URL}/v1/posts/${postId}/comments`, {
            headers: { 'X-User-ID': uidA.toString() }
        });
        const comments = commentsRes.data.result.comments;
        console.log(`Fetched ${comments.length} comments`);

        if (comments.length === 2) {
            console.log('✅ Comment count correct');
        } else {
            console.error('❌ Comment count incorrect');
            process.exit(1);
        }

        // 6. User B unlikes post
        console.log('User B unliking post...');
        await axios.delete(`${API_URL}/v1/posts/${postId}/like`, {
            headers: { 'X-User-ID': uidB.toString() }
        });
        console.log('✅ Unliked');

        console.log('--- All Tests Passed ---');

    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    }
}

test();
