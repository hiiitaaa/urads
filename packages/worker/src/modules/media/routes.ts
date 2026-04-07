/**
 * メディアアップロード/配信/削除
 * R2を一時公開URL置き場として使用。投稿完了後に削除。
 */
import { Hono } from 'hono';
import type { Env } from '../../env.js';

export const mediaRoutes = new Hono<{ Bindings: Env }>();

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;    // 8MB
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024;  // 1GB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

// POST /media/upload — ファイルアップロード → R2 → 公開URL返却
mediaRoutes.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return c.json({ error: 'ファイルが必要です' }, 400);
  }

  const contentType = file.type;
  const isImage = ALLOWED_IMAGE_TYPES.includes(contentType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(contentType);

  if (!isImage && !isVideo) {
    return c.json({ error: `非対応のファイル形式です: ${contentType}` }, 400);
  }

  if (isImage && file.size > MAX_IMAGE_SIZE) {
    return c.json({ error: `画像は${MAX_IMAGE_SIZE / 1024 / 1024}MB以下にしてください（現在: ${(file.size / 1024 / 1024).toFixed(1)}MB）` }, 400);
  }

  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return c.json({ error: `動画は${MAX_VIDEO_SIZE / 1024 / 1024 / 1024}GB以下にしてください` }, 400);
  }

  // R2にアップロード
  const key = `uploads/${Date.now()}-${crypto.randomUUID()}${getExtension(contentType)}`;

  await c.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { originalName: file.name, uploadedAt: String(Date.now()) },
  });

  // 公開URLを返す（本番Workersに直接アップロードされるのでoriginそのまま）
  const publicUrl = `${new URL(c.req.url).origin}/media/${key}`;

  return c.json({
    key,
    url: publicUrl,
    size: file.size,
    type: isImage ? 'image' : 'video',
    contentType,
  }, 201);
});

// GET /media/uploads/* — R2ファイルをプロキシ配信（Threads APIがこのURLからダウンロード）
mediaRoutes.get('/uploads/*', async (c) => {
  const path = c.req.path.replace('/media/', '');
  const object = await c.env.MEDIA.get(path);

  if (!object) {
    return c.json({ error: 'ファイルが見つかりません' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Length', String(object.size));
  headers.set('Cache-Control', 'public, max-age=3600'); // 1時間キャッシュ

  return new Response(object.body, { headers });
});

// DELETE /media/:key — R2からファイル削除
mediaRoutes.delete('/*', async (c) => {
  const key = c.req.path.replace('/media/', '');

  if (!key || key === '/') {
    return c.json({ error: 'キーが必要です' }, 400);
  }

  await c.env.MEDIA.delete(key);
  return c.json({ deleted: true });
});

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  };
  return map[contentType] || '';
}
