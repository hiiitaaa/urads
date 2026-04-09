import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRoutes } from './modules/auth/routes.js';
import { accountRoutes } from './modules/account/routes.js';
import { postRoutes } from './modules/post/routes.js';
import { replyRoutes } from './modules/reply/routes.js';
import { webhookRoutes } from './modules/reply/webhook.js';
import { researchRoutes } from './modules/research/routes.js';
import { aiRoutes, cleanupOldGenerations } from './modules/ai/routes.js';
import { chatRoutes } from './modules/chat/routes.js';
import { mediaRoutes } from './modules/media/routes.js';
import { handleCron } from './modules/post/cron.js';
import { pollReplies } from './modules/reply/poller.js';
import { licenseMiddleware } from './infrastructure/auth-middleware.js';
import { cleanupOldCalls, cleanupOldScrapedPosts } from './modules/research/limits.js';
import { cleanupOrphanMedia } from './modules/post/media-cleanup.js';
import type { Env } from './env.js';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', cors({ origin: '*' }));
app.use('/accounts/*', licenseMiddleware);
app.use('/posts/*', licenseMiddleware);
app.use('/replies/*', licenseMiddleware);
app.use('/research/*', licenseMiddleware);
app.use('/ai/*', licenseMiddleware);
app.use('/chat/*', licenseMiddleware);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// Module routes
app.route('/license', authRoutes);
app.route('/accounts', accountRoutes);
app.route('/posts', postRoutes);
app.route('/replies', replyRoutes);
app.route('/webhook', webhookRoutes);
app.route('/research', researchRoutes);
app.route('/ai', aiRoutes);
app.route('/chat', chatRoutes);
// /media/uploads/* はGET認証不要（Threads APIがアクセス）
// /media/upload と DELETE は認証必要
app.post('/media/upload', licenseMiddleware);
app.delete('/media/*', licenseMiddleware);
app.route('/media', mediaRoutes);

// 404
app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ code: 'INTERNAL_ERROR', message: 'Internal server error' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 予約投稿チェック（毎分）
    ctx.waitUntil(handleCron(env));

    // リプライポーリング（偶数分のみ = 2分間隔）
    const minute = new Date(event.scheduledTime).getMinutes();
    if (minute % 2 === 0) {
      ctx.waitUntil(pollReplies(env));
    }

    // クリーンアップ（毎時0分）
    if (minute === 0) {
      ctx.waitUntil(cleanupOldCalls(env.DB));
      ctx.waitUntil(cleanupOldScrapedPosts(env.DB));
      ctx.waitUntil(cleanupOldGenerations(env.DB));
      ctx.waitUntil(cleanupOrphanMedia(env.DB, env.MEDIA));
    }
  },
};
