/**
 * Threads トレンドフィード スクレイパー
 * ネットワーク傍受方式: GraphQL応答を直接取得（DOM解析不要）
 */
import { launchBrowser, closeBrowser, saveStorageState, isAuthenticated, humanDelay, humanScroll } from './browser';
import { createLogger } from '../../unified-logger';
import { getApiBase } from '../config/api-base';

const log = createLogger('scraper');

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
 * ページレスポンス傍受（診断ログ付き、URL範囲拡大）
 * threads.net / instagram.com の全JSONレスポンスを対象にする
 */
function interceptResponses(
  page: { on(event: string, handler: (...args: unknown[]) => void): void },
  posts: TrendingPost[],
  label: string,
  onData?: (data: unknown) => void,
): { getDiag: () => { jsonCount: number; apiCount: number; urls: string[] } } {
  const diag = { jsonCount: 0, apiCount: 0, urls: [] as string[] };
  let firstLogged = false;

  page.on('response', async (response: unknown) => {
    try {
      const res = response as { url(): string; headers(): Record<string, string>; json(): Promise<unknown> };
      const url = res.url();
      if (/\.(js|css|png|jpg|gif|svg|woff2?|ico|webp|mp4|wasm)(\?|$)/.test(url)) return;
      const contentType = res.headers()['content-type'] || '';
      if (!contentType.includes('json')) return;
      diag.jsonCount++;

      // threads.net / instagram.com のAPIのみ処理
      if (!url.includes('threads.net') && !url.includes('instagram.com')) return;
      diag.apiCount++;
      const shortUrl = url.replace(/\?.*/, '').slice(-100);
      if (diag.urls.length < 30) diag.urls.push(shortUrl);

      const data = await res.json();

      // 初回のみレスポンス構造をログ出力（デバッグ用）
      if (!firstLogged && data && typeof data === 'object') {
        firstLogged = true;
        const topKeys = Object.keys(data as Record<string, unknown>);
        const sample = JSON.stringify(data).slice(0, 800);
        log.debug(`${label}: 初回API応答 keys=[${topKeys.join(',')}]`, { url: url.slice(0, 300), sample });
      }

      if (onData) onData(data);

      const before = posts.length;
      extractPosts(data, posts);
      if (posts.length > before) {
        log.info(`${label}: API応答から${posts.length - before}件抽出`, { url: shortUrl });
      }
    } catch { /* response.json() 失敗等は無視 */ }
  });

  return { getDiag: () => diag };
}

/**
 * トレンドフィード取得（ネットワーク傍受方式）
 */
export async function scrapeTrending(): Promise<{ ok: true; posts: TrendingPost[] } | { ok: false; error: string }> {
  const posts: TrendingPost[] = [];
  let launched = false;

  try {
    log.info('トレンド取得: ブラウザ起動');
    const { page } = await launchBrowser(false);
    launched = true;

    const { getDiag } = interceptResponses(page, posts, 'トレンド取得');

    log.info('トレンド取得: threads.net にアクセス');
    await page.goto('https://www.threads.net/', { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(page, 3000, 5000);

    // ログインチェック
    const authed = await isAuthenticated(page);
    log.info(`トレンド取得: 認証チェック → ${authed ? 'OK' : 'NG'}`);
    if (!authed) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    log.info('トレンド取得: スクロール開始');
    await humanScroll(page, 5);
    await humanDelay(page, 2000, 4000);
    await humanScroll(page, 3);
    await humanDelay(page, 2000, 3000);

    // レスポンス傍受で0件の場合、ページ内の埋め込みデータから抽出を試行
    if (posts.length === 0) {
      log.info('トレンド取得: レスポンス傍受で0件 → ページ内データ抽出を試行');
      try {
        const embeddedData = await page.evaluate(() => {
          const results: string[] = [];
          document.querySelectorAll('script[type="application/json"]').forEach((s) => {
            if (s.textContent && s.textContent.length > 100) results.push(s.textContent);
          });
          const w = window as unknown as Record<string, unknown>;
          if (w.__NEXT_DATA__) results.push(JSON.stringify(w.__NEXT_DATA__));
          if (w.__data) results.push(JSON.stringify(w.__data));
          document.querySelectorAll('script').forEach((s) => {
            const t = s.textContent || '';
            if (t.includes('thread_items') || t.includes('text_post_app_info') || t.includes('"pk"')) {
              results.push(t);
            }
          });
          return results;
        });
        for (const jsonStr of embeddedData) {
          try {
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              extractPosts(parsed, posts);
            }
          } catch { /* パース失敗は無視 */ }
        }
        if (posts.length > 0) {
          log.info(`トレンド取得: ページ内データから${posts.length}件抽出`);
        }
      } catch (err) {
        log.debug('ページ内データ抽出失敗', { error: String(err) });
      }
    }

    // D1に保存
    if (posts.length > 0) {
      try {
        await fetch(`${getApiBase()}/chat/trending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts }),
        });
        log.info(`トレンド取得: D1保存完了 (${posts.length}件)`);
      } catch (err) {
        log.warn('トレンド取得: D1保存失敗', { error: String(err) });
      }
    }

    const d = getDiag();
    log.info(`トレンド取得: 完了 (${posts.length}件) 診断: json=${d.jsonCount} api=${d.apiCount}`, { urls: d.urls.join('\n') });
    return { ok: true, posts };
  } catch (err) {
    log.error('トレンド取得: 失敗', { error: String(err) });
    return { ok: false, error: `スクレイプ失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
      log.info('トレンド取得: ブラウザ終了');
    }
  }
}

/**
 * GraphQLレスポンスから投稿データを抽出
 */
function extractPosts(data: unknown, posts: TrendingPost[]): void {
  if (!data || typeof data !== 'object') return;
  findPostNodes(data as Record<string, unknown>, posts, new Set());
}

function findPostNodes(obj: Record<string, unknown>, posts: TrendingPost[], seen: Set<string>, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 30) return;

  // 投稿ノード検出（複数パターン対応）
  // Pattern 1: Threads固有マーカー (text_post_app_info)
  // Pattern 2: Instagram式 (caption + like_count)
  // Pattern 3: 汎用 (ID + user object + コンテンツ)
  const hasThreadsMarker = !!obj.text_post_app_info;
  const hasInstagramStyle = !!(obj.caption && obj.like_count !== undefined);
  const hasBroadMatch = !!(
    (obj.pk || obj.id || obj.code || obj.media_id) &&
    obj.user && typeof obj.user === 'object' &&
    (obj.caption !== undefined || obj.text_post_app_info || obj.thread_type !== undefined || obj.text_with_entities)
  );

  if (hasThreadsMarker || hasInstagramStyle || hasBroadMatch) {
    const id = String(obj.pk || obj.id || obj.code || obj.media_id || '');
    if (id && !seen.has(id)) {
      seen.add(id);

      // テキスト抽出（複数パターン）
      let caption = '';
      if (obj.caption && typeof obj.caption === 'object') {
        caption = ((obj.caption as Record<string, unknown>).text as string) || '';
      } else if (typeof obj.caption === 'string') {
        caption = obj.caption;
      }
      if (!caption && obj.text_with_entities && typeof obj.text_with_entities === 'object') {
        caption = ((obj.text_with_entities as Record<string, unknown>).text as string) || '';
      }
      if (!caption) {
        caption = (obj.text as string) || '';
      }

      const user = (obj.user as Record<string, unknown>) || {};
      const threadInfo = (obj.text_post_app_info as Record<string, unknown>) || {};

      posts.push({
        id,
        text: caption,
        username: (user.username as string) || '',
        likes: (obj.like_count as number) || 0,
        replies: (threadInfo.direct_reply_count as number)
              || (obj.reply_count as number)
              || (obj.comment_count as number)
              || 0,
        reposts: (obj.repost_count as number) || (obj.reshare_count as number) || 0,
        timestamp: (obj.taken_at as string) || '',
        permalink: obj.code ? `https://www.threads.net/post/${obj.code}` : undefined,
      });
    }
  }

  // 再帰探索
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
    log.info(`Insights取得: @${handle} ブラウザ起動`);
    const { page } = await launchBrowser(false);
    launched = true;

    const { getDiag } = interceptResponses(page, posts, 'Insights取得');

    log.info(`Insights取得: @${handle} プロフィールにアクセス`);
    await page.goto(`https://www.threads.net/@${handle}`, { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(page, 3000, 5000);

    const authed = await isAuthenticated(page);
    log.info(`Insights取得: 認証チェック → ${authed ? 'OK' : 'NG'}`);
    if (!authed) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    log.info('Insights取得: スクロール開始');
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
        log.info(`Insights取得: D1保存完了 (${posts.length}件取得, ${saved}件保存)`);
      } catch (err) {
        log.warn('Insights取得: D1保存失敗', { error: String(err) });
      }
    }

    const d = getDiag();
    log.info(`Insights取得: 完了 @${handle} (${posts.length}件) 診断: json=${d.jsonCount} api=${d.apiCount}`, { urls: d.urls.join('\n') });
    return { ok: true, posts, saved };
  } catch (err) {
    log.error(`Insights取得失敗: @${handle}`, { error: String(err) });
    return { ok: false, error: `Insights取得失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
      log.info('Insights取得: ブラウザ終了');
    }
  }
}

/**
 * キーワード検索（Playwright、API消費ゼロ）
 */
export async function scrapeSearch(query: string, scrollRounds = 3, maxResults = 50, minLikes = 0): Promise<{
  ok: true;
  posts: TrendingPost[];
} | { ok: false; error: string }> {
  const posts: TrendingPost[] = [];
  let launched = false;

  try {
    log.info(`検索スクレイプ: "${query}" ブラウザ起動`);
    const { page } = await launchBrowser(false);
    launched = true;

    const { getDiag } = interceptResponses(page, posts, '検索スクレイプ');

    log.info(`検索スクレイプ: "${query}" ページにアクセス`);
    await page.goto(
      `https://www.threads.net/search?q=${encodeURIComponent(query)}&serp_type=default`,
      { waitUntil: 'networkidle', timeout: 30000 },
    );
    await humanDelay(page, 3000, 5000);

    const authed = await isAuthenticated(page);
    log.info(`検索スクレイプ: 認証チェック → ${authed ? 'OK' : 'NG'}`);
    if (!authed) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    log.info(`検索スクレイプ: スクロール開始 (${scrollRounds}ラウンド)`);
    for (let round = 0; round < scrollRounds; round++) {
      const steps = 4 + Math.floor(Math.random() * 3); // 4-6回/ラウンド
      await humanScroll(page, steps);
      await humanDelay(page, 2000, 5000);
      log.debug(`検索スクレイプ: ラウンド${round + 1}/${scrollRounds} 完了 (現在${posts.length}件)`);
    }

    // レスポンス傍受で0件の場合、ページ内の埋め込みデータから抽出を試行
    if (posts.length === 0) {
      log.info('検索スクレイプ: レスポンス傍受で0件 → ページ内データ抽出を試行');
      try {
        const embeddedData = await page.evaluate(() => {
          const results: string[] = [];
          // SSR埋め込みデータを探索
          document.querySelectorAll('script[type="application/json"]').forEach((s) => {
            if (s.textContent && s.textContent.length > 100) results.push(s.textContent);
          });
          // Next.js / React SSRデータ
          const w = window as unknown as Record<string, unknown>;
          if (w.__NEXT_DATA__) results.push(JSON.stringify(w.__NEXT_DATA__));
          if (w.__data) results.push(JSON.stringify(w.__data));
          // require("ServerJS")系のデータ
          document.querySelectorAll('script').forEach((s) => {
            const t = s.textContent || '';
            if (t.includes('thread_items') || t.includes('text_post_app_info') || t.includes('"pk"')) {
              results.push(t);
            }
          });
          return results;
        });
        for (const jsonStr of embeddedData) {
          try {
            // JSONブロックを抽出（scriptタグ内にJSON以外のコードが含まれる場合）
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              extractPosts(parsed, posts);
            }
          } catch { /* パース失敗は無視 */ }
        }
        if (posts.length > 0) {
          log.info(`検索スクレイプ: ページ内データから${posts.length}件抽出`);
        }
      } catch (err) {
        log.debug('ページ内データ抽出失敗', { error: String(err) });
      }
    }

    // エンゲージメントフィルタ + 件数上限
    if (minLikes > 0) {
      const before = posts.length;
      const filtered = posts.filter(p => p.likes >= minLikes);
      posts.length = 0;
      posts.push(...filtered);
      if (before !== posts.length) {
        log.info(`検索スクレイプ: エンゲージメントフィルタ ${before}件 → ${posts.length}件 (最低${minLikes}いいね)`);
      }
    }
    if (posts.length > maxResults) {
      // エンゲージメントが高い順にソートしてトップN件を残す
      posts.sort((a, b) => (b.likes + b.replies * 5 + b.reposts * 4) - (a.likes + a.replies * 5 + a.reposts * 4));
      posts.length = maxResults;
      log.info(`検索スクレイプ: 上限${maxResults}件に絞り込み`);
    }

    const d = getDiag();
    log.info(`検索スクレイプ: 完了 "${query}" (${posts.length}件) 診断: json=${d.jsonCount} api=${d.apiCount}`, { urls: d.urls.join('\n') });
    return { ok: true, posts };
  } catch (err) {
    log.error(`検索スクレイプ失敗: "${query}"`, { error: String(err) });
    return { ok: false, error: `検索失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
      log.info('検索スクレイプ: ブラウザ終了');
    }
  }
}

/**
 * ベンチマークアカウントのプロフィール+投稿をスクレイプ
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
    log.info(`ベンチマーク: @${handle} ブラウザ起動`);
    const { page } = await launchBrowser(false);
    launched = true;

    const { getDiag } = interceptResponses(page, posts, 'ベンチマーク', (data) => extractProfile(data, profile));

    log.info(`ベンチマーク: @${handle} プロフィールにアクセス`);
    await page.goto(`https://www.threads.net/@${handle}`, { waitUntil: 'networkidle', timeout: 30000 });
    await humanDelay(page, 3000, 5000);

    const authed = await isAuthenticated(page);
    log.info(`ベンチマーク: 認証チェック → ${authed ? 'OK' : 'NG'}`);
    if (!authed) {
      return { ok: false, error: 'ログインが必要です。設定画面から「Threadsログイン」を実行してください。' };
    }

    log.info('ベンチマーク: スクロール開始');
    await humanScroll(page, 4);
    await humanDelay(page, 2000, 4000);
    await humanScroll(page, 3);
    await humanDelay(page, 1000, 2000);

    // レスポンス傍受で0件の場合、ページ内の埋め込みデータから抽出を試行
    if (posts.length === 0) {
      log.info('ベンチマーク: レスポンス傍受で0件 → ページ内データ抽出を試行');
      try {
        const embeddedData = await page.evaluate(() => {
          const results: string[] = [];
          // script[type="application/json"]
          const jsonScripts = document.querySelectorAll('script[type="application/json"]');
          jsonScripts.forEach((s) => {
            if (s.textContent && s.textContent.length > 100) results.push(s.textContent);
          });
          // SSR data
          const w = window as unknown as Record<string, unknown>;
          if (w.__NEXT_DATA__) results.push(JSON.stringify(w.__NEXT_DATA__));
          if (w.__data) results.push(JSON.stringify(w.__data));
          // Inline scripts with post data markers
          const allScripts = document.querySelectorAll('script:not([src])');
          allScripts.forEach((s) => {
            const t = s.textContent || '';
            if (t.includes('thread_items') || t.includes('text_post_app_info') || t.includes('"pk"')) {
              results.push(t);
            }
          });
          return {
            data: results,
            stats: {
              jsonScripts: jsonScripts.length,
              allScripts: allScripts.length,
              bodyLength: document.body?.innerHTML?.length || 0,
              title: document.title,
            },
          };
        });
        log.info(`ベンチマーク: ページ分析 - script[json]=${embeddedData.stats.jsonScripts} scripts=${embeddedData.stats.allScripts} bodySize=${embeddedData.stats.bodyLength} title="${embeddedData.stats.title}" データブロック=${embeddedData.data.length}件`);
        for (let idx = 0; idx < embeddedData.data.length; idx++) {
          const jsonStr = embeddedData.data[idx];
          try {
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const beforePosts = posts.length;
              extractProfile(parsed, profile);
              extractPosts(parsed, posts);
              if (posts.length > beforePosts) {
                log.info(`ベンチマーク: データブロック#${idx + 1}から${posts.length - beforePosts}件抽出`);
              }
            }
          } catch { /* パース失敗は無視 */ }
        }
        if (posts.length > 0) {
          log.info(`ベンチマーク: ページ内データから合計${posts.length}件抽出`);
        } else {
          log.warn('ベンチマーク: ページ内データからも0件。Threadsのページ構造が変更された可能性あり');
        }
      } catch (err) {
        log.error('ページ内データ抽出失敗', { error: String(err) });
      }
    }

    // プロフィール更新
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
        log.info(`ベンチマーク: プロフィール更新完了`, { user_id: profile.user_id, followers: profile.follower_count });
      } catch (err) {
        log.warn('ベンチマーク: プロフィール更新失敗', { error: String(err) });
      }
    }

    // 投稿保存
    if (posts.length > 0) {
      try {
        await fetch(`${getApiBase()}/research/benchmarks/${benchmarkId}/save-posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ posts }),
        });
        log.info(`ベンチマーク: 投稿保存完了 (${posts.length}件)`);
      } catch (err) {
        log.warn('ベンチマーク: 投稿保存失敗', { error: String(err) });
      }
    }

    const d = getDiag();
    log.info(`ベンチマーク: 完了 @${handle} (${posts.length}件) 診断: json=${d.jsonCount} api=${d.apiCount}`, { urls: d.urls.join('\n') });
    return { ok: true, profile, posts };
  } catch (err) {
    log.error(`ベンチマーク失敗: @${handle}`, { error: String(err) });
    return { ok: false, error: `スクレイプ失敗: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    if (launched) {
      await saveStorageState().catch(() => {});
      await closeBrowser().catch(() => {});
      log.info('ベンチマーク: ブラウザ終了');
    }
  }
}

/**
 * GraphQLレスポンスからプロフィール情報を抽出
 */
function extractProfile(data: unknown, profile: { username: string; name: string; follower_count: number; user_id: string }): void {
  if (!data || typeof data !== 'object') return;
  findProfileNode(data as Record<string, unknown>, profile, 0);
}

function findProfileNode(obj: Record<string, unknown>, profile: { username: string; name: string; follower_count: number; user_id: string }, depth: number): void {
  if (!obj || typeof obj !== 'object' || depth > 20) return;

  if (obj.pk && obj.username && obj.follower_count !== undefined) {
    if (!profile.user_id) profile.user_id = String(obj.pk);
    if (typeof obj.follower_count === 'number') profile.follower_count = obj.follower_count;
    if (typeof obj.full_name === 'string' && obj.full_name) profile.name = obj.full_name;
    return;
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
    log.info('ログインブラウザ: 起動 (headed)');
    const { page } = await launchBrowser(true);

    await page.goto('https://www.threads.net/login', { waitUntil: 'networkidle', timeout: 30000 });
    log.info('ログインブラウザ: ログインページ表示');

    try {
      await page.waitForURL('**/threads.net/**', {
        timeout: 300000,
        waitUntil: 'networkidle',
      });

      if (await isAuthenticated(page)) {
        await saveStorageState();
        await closeBrowser();
        log.info('ログインブラウザ: ログイン成功');
        return { ok: true };
      }
    } catch {
      // タイムアウト
    }

    await closeBrowser();
    log.warn('ログインブラウザ: タイムアウト（5分）');
    return { ok: false, error: 'ログインがタイムアウトしました（5分）' };
  } catch (err) {
    await closeBrowser().catch(() => {});
    log.error('ログインブラウザ: 失敗', { error: String(err) });
    return { ok: false, error: `ログイン失敗: ${err instanceof Error ? err.message : String(err)}` };
  }
}
