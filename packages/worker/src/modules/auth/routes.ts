import { Hono } from 'hono';
import type { Env } from '../../env.js';
import { encryptField } from '../../infrastructure/crypto.js';

export const authRoutes = new Hono<{ Bindings: Env }>();

const DEV_LICENSE_ID = 'dev-license';
const THREADS_API = 'https://graph.threads.net';

// GET /license/auth-url — OAuth認可URLを返す（App IDをクライアントに渡す）
authRoutes.get('/auth-url', async (c) => {
  const state = crypto.randomUUID();
  const scopes = 'threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies,threads_read_replies';

  const url = `https://threads.net/oauth/authorize?client_id=${c.env.THREADS_APP_ID}&redirect_uri=${encodeURIComponent(c.env.THREADS_REDIRECT_URI)}&scope=${scopes}&response_type=code&state=${state}`;

  return c.json({ url, state, redirect_uri: c.env.THREADS_REDIRECT_URI });
});

// POST /license/exchange — 認可コードをトークンに交換してD1に保存
authRoutes.post('/exchange', async (c) => {
  const { code } = await c.req.json<{ code: string }>();
  const licenseId = c.req.header('X-License-Id') || DEV_LICENSE_ID;

  // 1. 認可コード → 短期トークン（multipart/form-data 方式 — 公式ドキュメント準拠）
  const formData = new FormData();
  formData.append('client_id', c.env.THREADS_APP_ID.trim());
  formData.append('client_secret', c.env.THREADS_APP_SECRET.trim());
  formData.append('code', code);
  formData.append('grant_type', 'authorization_code');
  formData.append('redirect_uri', c.env.THREADS_REDIRECT_URI.trim());
  console.log('[exchange] Sending as multipart/form-data to', `${THREADS_API}/oauth/access_token`);
  const tokenRes = await fetch(`${THREADS_API}/oauth/access_token`, {
    method: 'POST',
    body: formData,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json({ error: `トークン交換失敗: ${err}` }, 400);
  }

  const { access_token: shortToken, user_id: userId } = await tokenRes.json() as {
    access_token: string; user_id: string;
  };

  // 2. 短期 → 長期トークン
  const longRes = await fetch(
    `${THREADS_API}/access_token?grant_type=th_exchange_token&client_secret=${c.env.THREADS_APP_SECRET.trim()}&access_token=${shortToken}`
  );

  if (!longRes.ok) {
    const err = await longRes.text();
    return c.json({ error: `長期トークン交換失敗: ${err}` }, 400);
  }

  const { access_token: longToken, expires_in: expiresIn } = await longRes.json() as {
    access_token: string; expires_in: number;
  };

  // 3. プロフィール取得
  const profileRes = await fetch(
    `${THREADS_API}/v1.0/me?fields=id,username,name&access_token=${longToken}`
  );

  if (!profileRes.ok) {
    const err = await profileRes.text();
    return c.json({ error: `プロフィール取得失敗: ${err}` }, 400);
  }

  const profile = await profileRes.json() as {
    id: string; username: string; name?: string;
  };

  // 4. D1に保存（upsert）— access_tokenは暗号化
  const now = Date.now();
  const tokenExpiresAt = now + expiresIn * 1000;
  const encryptedToken = await encryptField(c.env.ENCRYPTION_KEY, longToken);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE license_id = ? AND threads_user_id = ?'
  ).bind(licenseId, profile.id).first();

  let accountId: string;

  if (existing) {
    accountId = existing.id as string;
    await c.env.DB.prepare(
      'UPDATE accounts SET access_token = ?, threads_handle = ?, display_name = ?, token_expires_at = ?, updated_at = ? WHERE id = ?'
    ).bind(encryptedToken, profile.username, profile.name || null, tokenExpiresAt, now, accountId).run();
  } else {
    accountId = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO accounts (id, license_id, threads_user_id, threads_handle, display_name, access_token, token_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(accountId, licenseId, profile.id, profile.username, profile.name || null, encryptedToken, tokenExpiresAt, now, now).run();
  }

  return c.json({
    accountId,
    profile,
    expiresIn,
  });
});

// POST /license/verify
authRoutes.post('/verify', async (c) => {
  const { key, device_id } = await c.req.json<{ key: string; device_id?: string }>();

  const license = await c.env.DB.prepare(
    'SELECT id, plan, max_accounts, status, expires_at FROM licenses WHERE key = ?'
  ).bind(key).first();

  if (!license) {
    return c.json({ valid: false, error: 'ライセンスキーが無効です' }, 401);
  }

  if (license.status !== 'active') {
    return c.json({ valid: false, error: 'ライセンスが無効化されています' }, 403);
  }

  if (license.expires_at && (license.expires_at as number) < Date.now()) {
    return c.json({ valid: false, error: 'ライセンスが期限切れです' }, 403);
  }

  if (device_id) {
    await c.env.DB.prepare(
      `INSERT INTO app_users (id, license_id, device_id, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = ?`
    ).bind(
      `user_${device_id}`, license.id, device_id,
      Date.now(), Date.now(), Date.now()
    ).run();
  }

  return c.json({ valid: true, license });
});

// GET /license/status
authRoutes.get('/status', async (c) => {
  const key = c.req.header('X-License-Key');
  if (!key) {
    return c.json({ valid: false, error: 'ライセンスキーが必要です' }, 401);
  }

  const license = await c.env.DB.prepare(
    'SELECT id, plan, max_accounts, status, expires_at FROM licenses WHERE key = ?'
  ).bind(key).first();

  if (!license || license.status !== 'active') {
    return c.json({ valid: false }, 401);
  }

  return c.json({ valid: true, license });
});
