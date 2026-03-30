/**
 * Threads トレンドフィード スクレイパー
 * ネットワーク傍受方式: GraphQL応答を直接取得（DOM解析不要）
 */
import { launchBrowser, closeBrowser, saveStorageState, isAuthenticated, humanDelay, humanScroll } from './browser';

import { getApiBase } from '../config/api-base';

interface TrendingPost {
  id: string;
  text: string;
  username: string;
  likes: number;
  replies: number;
  reposts: number;
  timestamp: string;
  permalink?: string;
}

/**
 * トレンドフィード取得（ネットワーク傍受方式）
 */
export async function scrapeTrending(): Promise<{ ok: true; posts: TrendingPost[] } | { ok: false; error: string }> {
  const posts: TrendingPost[] = [];
  let launched = false;

  try {
    const { page } = await launchBrowser(false);
    launched = true;

    // GraphQL応答を傍受
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('api/graphql') || url.includes('graphql')) {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json')) return;

          const data = await response.json();
          extractPosts(data, posts);
        }
      } catch {
        // JSON parse失敗は無視
      }
    });

    // Threadsトップページにアクセス
    await page.goto('https://www.threads.net/', { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(page, 3000, 5000);

    // ログインチェック
    if (!(await isAuthenticated(page))) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    // 人間らしくスクロール（5-10投稿分を取得）
    await humanScroll(page, 5);
    await humanDelay(page, 2000, 4000);
    await humanScroll(page, 3);
    await humanDelay(page, 2000, 3000);

    // D1に保存
    if (posts.length > 0) {
      try {
        await fetch(`${getApiBase()}/chat/trending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts }),
        });
      } catch { /* 保存失敗は無視（ローカル表示は可能） */ }
    }

    // 監査ログ
    try {
      await fetch(`${getApiBase()}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'scrape_trending',
          tool_input: {},
          tool_result: { posts_found: posts.length },
          confirmed: true,
        }),
      });
    } catch { /* ログ失敗は無視 */ }

    return { ok: true, posts };
  } catch (err) {
    return { ok: false, error: `スクレイプ失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    // 必ずブラウザを閉じる
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
    }
  }
}

/**
 * GraphQLレスポンスから投稿データを抽出
 */
function extractPosts(data: unknown, posts: TrendingPost[]): void {
  if (!data || typeof data !== 'object') return;

  const str = JSON.stringify(data);

  // Threads GraphQLの典型的なレスポンス構造を探索
  findPostNodes(data as Record<string, unknown>, posts, new Set());
}

function findPostNodes(obj: Record<string, unknown>, posts: TrendingPost[], seen: Set<string>, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 30) return;

  // 投稿ノードの特徴: text_post_app_info, like_count, reply_count を持つ
  if (obj.text_post_app_info || (obj.caption && obj.like_count !== undefined)) {
    const id = String(obj.pk || obj.id || obj.code || '');
    if (id && !seen.has(id)) {
      seen.add(id);
      const caption = (obj.caption as Record<string, unknown>)?.text as string
        || obj.text as string || '';

      const user = obj.user as Record<string, unknown> || {};
      posts.push({
        id,
        text: caption,
        username: (user.username as string) || '',
        likes: (obj.like_count as number) || 0,
        replies: (obj.text_post_app_info as Record<string, unknown>)?.direct_reply_count as number || 0,
        reposts: (obj.repost_count as number) || 0,
        timestamp: (obj.taken_at as string) || '',
        permalink: obj.code ? `https://www.threads.net/post/${obj.code}` : undefined,
      });
    }
  }

  // 再帰探索（depth制限付き）
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          findPostNodes(item as Record<string, unknown>, posts, seen, depth + 1);
        }
      }
    } else if (value && typeof value === 'object') {
      findPostNodes(value as Record<string, unknown>, posts, seen, depth + 1);
    }
  }
}

/**
 * 自分の投稿のInsights取得（Playwright、API消費ゼロ）
 */
export async function scrapeOwnInsights(handle: string, accountId: string): Promise<{
  ok: true;
  posts: TrendingPost[];
  saved: number;
} | { ok: false; error: string }> {
  const posts: TrendingPost[] = [];
  let launched = false;

  try {
    const { page } = await launchBrowser(false);
    launched = true;

    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('api/graphql') || url.includes('graphql')) {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json')) return;
          const data = await response.json();
          extractPosts(data, posts);
        }
      } catch { /* 無視 */ }
    });

    await page.goto(`https://www.threads.net/@${handle}`, { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(page, 3000, 5000);

    if (!(await isAuthenticated(page))) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    await humanScroll(page, 5);
    await humanDelay(page, 2000, 4000);
    await humanScroll(page, 3);

    // D1に保存
    let saved = 0;
    if (posts.length > 0) {
      try {
        const insightsData = posts.map((p) => ({
          threads_id: p.id,
          content_preview: (p.text || '').slice(0, 50),
          likes: p.likes,
          replies: p.replies,
          reposts: p.reposts,
          quotes: 0,
        }));

        const res = await fetch(`${getApiBase()}/posts/insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account_id: accountId, posts: insightsData }),
        });
        const result = await res.json() as { saved: number };
        saved = result.saved || 0;
      } catch { /* 保存失敗は無視 */ }
    }

    // 監査ログ
    try {
      await fetch(`${getApiBase()}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'scrape_own_insights',
          tool_input: { handle, accountId },
          tool_result: { posts_found: posts.length, saved },
          confirmed: true,
        }),
      });
    } catch { /* 無視 */ }

    return { ok: true, posts, saved };
  } catch (err) {
    return { ok: false, error: `Insights取得失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
    }
  }
}

/**
 * キーワード検索（Playwright、API消費ゼロ）
 */
export async function scrapeSearch(query: string): Promise<{
  ok: true;
  posts: TrendingPost[];
} | { ok: false; error: string }> {
  const posts: TrendingPost[] = [];
  let launched = false;

  try {
    const { page } = await launchBrowser(false);
    launched = true;

    // GraphQL応答を傍受
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('api/graphql') || url.includes('graphql')) {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json')) return;
          const data = await response.json();
          extractPosts(data, posts);
        }
      } catch { /* 無視 */ }
    });

    // Threads検索ページにアクセス
    await page.goto(
      `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=default`,
      { waitUntil: 'networkidle', timeout: 30000 },
    );
    await humanDelay(page, 3000, 5000);

    if (!(await isAuthenticated(page))) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    // スクロールで追加結果読み込み
    await humanScroll(page, 4);
    await humanDelay(page, 2000, 4000);
    await humanScroll(page, 3);
    await humanDelay(page, 1000, 2000);

    // 監査ログ
    try {
      await fetch(`${getApiBase()}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'scrape_search',
          tool_input: { query },
          tool_result: { posts_found: posts.length },
          confirmed: true,
        }),
      });
    } catch { /* ログ失敗は無視 */ }

    return { ok: true, posts };
  } catch (err) {
    return { ok: false, error: `検索失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
    }
  }
}

/**
 * ベンチマークアカウントのプロフィール+投稿をスクレイプ（Playwright）
 * APIではなくブラウザ経由 → レートリミット消費ゼロ
 */
export async function scrapeBenchmark(handle: string, benchmarkId: string): Promise<{
  ok: true;
  profile: { username: string; name: string; follower_count: number; user_id: string };
  posts: TrendingPost[];
} | { ok: false; error: string }> {
  const posts: TrendingPost[] = [];
  let launched = false;
  let profile = { username: handle, name: '', follower_count: 0, user_id: '' };

  try {
    const { page } = await launchBrowser(false);
    launched = true;

    // GraphQL応答を傍受
    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (url.includes('api/graphql') || url.includes('graphql')) {
          const contentType = response.headers()['content-type'] || '';
          if (!contentType.includes('json')) return;

          const data = await response.json();

          // プロフィール情報抽出
          extractProfile(data, profile);

          // 投稿抽出
          extractPosts(data, posts);
        }
      } catch { /* 無視 */ }
    });

    // プロフィールページにアクセス
    await page.goto(`https://www.threads.net/@${handle}`, { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(page, 3000, 5000);

    // ログインチェック
    if (!(await isAuthenticated(page))) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    // スクロールして投稿を読み込む
    await humanScroll(page, 4);
    await humanDelay(page, 2000, 4000);
    await humanScroll(page, 3);
    await humanDelay(page, 1000, 2000);

    // benchmarksテーブル更新（プロフィール情報反映）
    if (profile.user_id || profile.follower_count) {
      try {
        await fetch(`${getApiBase()}/research/benchmarks/${benchmarkId}/update-profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threads_user_id: profile.user_id || undefined,
            display_name: profile.name || undefined,
            follower_count: profile.follower_count || undefined,
          }),
        });
      } catch { /* 更新失敗は無視 */ }
    }

    // scraped_postsテーブルに保存（benchmark_id紐づけ）
    if (posts.length > 0) {
      try {
        await fetch(`${getApiBase()}/research/benchmarks/${benchmarkId}/save-posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts }),
        });
      } catch { /* 保存失敗は無視 */ }
    }

    // 監査ログ
    try {
      await fetch(`${getApiBase()}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'scrape_benchmark',
          tool_input: { handle, benchmarkId },
          tool_result: { posts_found: posts.length, user_id: profile.user_id },
          confirmed: true,
        }),
      });
    } catch { /* ログ失敗は無視 */ }

    return { ok: true, profile, posts };
  } catch (err) {
    return { ok: false, error: `スクレイプ失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
    }
  }
}

/**
 * GraphQLレスポンスからプロフィール情報を抽出（オブジェクト探索方式）
 */
function extractProfile(data: unknown, profile: { username: string; name: string; follower_count: number; user_id: string }): void {
  if (!data || typeof data !== 'object') return;
  findProfileNode(data as Record<string, unknown>, profile, 0);
}

function findProfileNode(obj: Record<string, unknown>, profile: { username: string; name: string; follower_count: number; user_id: string }, depth: number): void {
  if (!obj || typeof obj !== 'object' || depth > 20) return;

  // ユーザーノードの特徴: pk + username + follower_count を持つオブジェクト
  if (obj.pk && obj.username && obj.follower_count !== undefined) {
    if (!profile.user_id) profile.user_id = String(obj.pk);
    if (typeof obj.follower_count === 'number') profile.follower_count = obj.follower_count;
    if (typeof obj.full_name === 'string' && obj.full_name) profile.name = obj.full_name;
    return; // 見つかったら終了
  }

  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          findProfileNode(item as Record<string, unknown>, profile, depth + 1);
          if (profile.user_id) return;
        }
      }
    } else if (value && typeof value === 'object') {
      findProfileNode(value as Record<string, unknown>, profile, depth + 1);
      if (profile.user_id) return;
    }
  }
}

/**
 * 手動ログイン用ブラウザ起動（headed）
 */
export async function openLoginBrowser(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { page } = await launchBrowser(true); // headed mode（ユーザーに見せる）

    await page.goto('https://www.threads.net/login', { waitUntil: 'networkidle', timeout: 30000 });

    // ログイン完了をイベントベースで検知（最大5分）
    try {
      // ログイン成功するとホームページにリダイレクトされる
      await page.waitForURL('**/threads.net/**', {
        timeout: 300000, // 5分
        waitUntil: 'networkidle',
      });

      // ログイン画面でないことを確認
      if (await isAuthenticated(page)) {
        await saveStorageState();
        await closeBrowser();
        return { ok: true };
      }
    } catch {
      // タイムアウト
    }

    await closeBrowser();
    return { ok: false, error: 'ログインがタイムアウトしました（5分）' };
  } catch (err) {
    await closeBrowser().catch(() => {});
    return { ok: false, error: `ログイン失敗: ${err instanceof Error ? err.message : String(err)}` };
  }
}
