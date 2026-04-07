import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../../config';

interface Benchmark {
  id: string;
  threads_handle: string;
  threads_user_id: string | null;
  display_name: string | null;
  follower_count: number | null;
  status: string;
  last_scraped_at: number | null;
}

interface ScrapedPost {
  id: string;
  content: string | null;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  is_buzz: number;
  posted_at: number | null;
  permalink?: string;
}

interface Budget {
  profile: { used: number; limit: number; remaining: number };
  threads: { used: number; limit: number; remaining: number };
  keyword_search: { used: number; limit: number; remaining: number };
}

type Tab = 'benchmarks' | 'search' | 'trending' | 'settings';

declare global {
  interface Window {
    urads: {
      scraperLogin: () => Promise<{ ok: boolean; error?: string }>;
      scraperTrending: () => Promise<{ ok: boolean; posts?: TrendingPost[]; error?: string }>;
      [key: string]: unknown;
    };
  }
}

interface TrendingPost {
  id: string;
  text: string;
  username: string;
  likes: number;
  replies: number;
  reposts: number;
}

export function Research(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('benchmarks');
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [newHandle, setNewHandle] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScrapedPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScrapedPost[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadBenchmarks();
    loadBudget();
  }, []);

  const loadBenchmarks = () => {
    fetch(`${API_BASE}/research/benchmarks`)
      .then((r) => r.json())
      .then((d) => setBenchmarks(d.benchmarks || []))
      .catch(() => {});
  };

  const loadBudget = () => {
    fetch(`${API_BASE}/research/limits`)
      .then((r) => r.json())
      .then((d) => setBudget(d.budget))
      .catch(() => {});
  };

  const handleAdd = async () => {
    if (!newHandle) return;
    await fetch(`${API_BASE}/research/benchmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threads_handle: newHandle, threads_user_id: newUserId || undefined }),
    });
    setNewHandle(''); setNewUserId('');
    loadBenchmarks();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch(`${API_BASE}/research/benchmarks/${id}`, { method: 'DELETE' });
    if (selectedBenchmark === id) { setSelectedBenchmark(null); setPosts([]); }
    loadBenchmarks();
  };

  const handleScrape = async (id: string) => {
    const bm = benchmarks.find((b) => b.id === id);
    if (!bm) return;

    setIsLoading(true); setStatus('Playwrightでスクレイプ中... APIリミット消費なし');
    try {
      const result = await (window.urads as Record<string, Function>).scraperBenchmark(bm.threads_handle, id) as {
        ok: boolean;
        profile?: { username: string; name: string; follower_count: number; user_id: string };
        posts?: Array<{ id: string; text: string; username: string; likes: number; replies: number; reposts: number }>;
        error?: string;
      };

      if (result.ok) {
        const postCount = result.posts?.length || 0;
        setStatus(`完了: ${postCount}件の投稿を取得（Playwright、APIリミット未消費）`);
        // scraped_postsに保存+benchmarks更新はfeed-scraper.ts内で実行済み
        if (selectedBenchmark === id) loadPosts(id);
      } else {
        setStatus(`失敗: ${result.error}`);
      }
    } catch (err) {
      setStatus(`スクレイプ失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
      loadBenchmarks();
    }
  };

  const loadPosts = (id: string) => {
    setSelectedBenchmark(id);
    fetch(`${API_BASE}/research/benchmarks/${id}/posts?limit=100`)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]));
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setIsLoading(true);
    setStatus('Playwrightで検索中...');
    try {
      const result = await (window.urads as Record<string, Function>).scraperSearch(searchQuery) as {
        ok: boolean; posts?: Array<{ text: string; username: string; likes: number; replies: number; reposts: number }>;
        error?: string; remaining?: number; used?: number;
      };
      if (result.ok && result.posts) {
        setSearchResults(result.posts.map((p) => ({
          ...p, content: p.text, id: '', threads_post_id: '', media_urls: null,
          quotes: 0, is_buzz: 0, source: 'playwright', posted_at: null, scraped_at: Date.now(),
        })) as unknown as ScrapedPost[]);
        setStatus(result.posts.length > 0
          ? `${result.posts.length}件取得（Playwright、API消費なし。検索 ${result.used || 0}/10回使用）`
          : '結果が見つかりませんでした');
      } else {
        setStatus(`検索失敗: ${result.error}`);
      }
    } catch (err) {
      setStatus(`検索失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const BudgetBar = () => budget ? (
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
      {(['profile', 'threads', 'keyword_search'] as const).map((ep) => (
        <span key={ep}>
          {ep}: <strong style={{ color: budget[ep].remaining < 20 ? '#e74c3c' : '#27ae60' }}>
            {budget[ep].remaining}
          </strong>/{budget[ep].limit}
        </span>
      ))}
    </div>
  ) : null;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>リサーチ</h1>
      <BudgetBar />

      {/* タブ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {([['benchmarks', 'ベンチマーク'], ['search', 'キーワード検索'], ['trending', 'トレンド'], ['settings', '設定']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: tab === id ? '#1a1a2e' : '#eee', color: tab === id ? '#fff' : '#333', fontSize: 14 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ベンチマークタブ */}
      {tab === 'benchmarks' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="@handle"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, width: 160 }} />
            <input value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="User ID（任意）"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, width: 160 }} />
            <button onClick={handleAdd} disabled={!newHandle}
              style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
              追加
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {benchmarks.map((bm) => (
              <div key={bm.id} style={{ padding: 12, borderRadius: 8, border: '1px solid #eee', background: selectedBenchmark === bm.id ? '#f0f0ff' : '#fafafa',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => loadPosts(bm.id)}>
                <div>
                  <span style={{ fontWeight: 'bold' }}>@{bm.threads_handle}</span>
                  {bm.display_name && <span style={{ color: '#666', marginLeft: 8 }}>{bm.display_name}</span>}
                  {bm.follower_count && <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>{bm.follower_count.toLocaleString()} followers</span>}
                  <span style={{ marginLeft: 8, fontSize: 11, padding: '1px 6px', borderRadius: 3,
                    background: bm.status === 'active' ? '#e8f5e9' : '#fce4ec',
                    color: bm.status === 'active' ? '#27ae60' : '#e74c3c' }}>
                    {bm.status}
                  </span>
                  {bm.last_scraped_at && <span style={{ color: '#999', marginLeft: 8, fontSize: 11 }}>
                    最終: {new Date(bm.last_scraped_at).toLocaleDateString()}
                  </span>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={(e) => { e.stopPropagation(); handleScrape(bm.id); }} disabled={isLoading || bm.status !== 'active'}
                    style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #3498db', background: 'transparent', color: '#3498db', fontSize: 12, cursor: 'pointer' }}>
                    スクレイプ
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(bm.id); }}
                    style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #e74c3c', background: 'transparent', color: '#e74c3c', fontSize: 12, cursor: 'pointer' }}>
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 投稿一覧 */}
          {selectedBenchmark && posts.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>収集投稿（{posts.length}件）</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {posts.map((p) => (
                  <div key={p.id} style={{ padding: 12, borderRadius: 8, border: p.is_buzz ? '2px solid #f39c12' : '1px solid #eee',
                    background: p.is_buzz ? '#fffbf0' : '#fafafa' }}>
                    {p.is_buzz && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#f39c12', color: '#fff', marginBottom: 4, display: 'inline-block' }}>BUZZ</span>}
                    <p style={{ fontSize: 14, lineHeight: 1.5 }}>{p.content || '(メディア投稿)'}</p>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginTop: 4 }}>
                      <span>❤ {p.likes}</span>
                      <span>💬 {p.replies}</span>
                      <span>🔁 {p.reposts}</span>
                      {p.posted_at && <span>{new Date(p.posted_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* キーワード検索タブ */}
      {tab === 'search' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="キーワードを入力（2文字以上）"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, flex: 1 }} />
            <button onClick={handleSearch} disabled={isLoading || searchQuery.length < 2}
              style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
              検索
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>Playwrightで検索（API消費なし、要ログイン）</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searchResults.map((p, i) => {
              const pr = p as unknown as { username?: string; content?: string; text?: string; likes?: number; replies?: number; reposts?: number };
              const score = (pr.likes || 0) * 1 + (pr.replies || 0) * 5 + (pr.reposts || 0) * 4;
              return (
                <div key={i} style={{
                  padding: 12, borderRadius: 8,
                  border: score > 100 ? '2px solid #f39c12' : '1px solid #eee',
                  background: score > 100 ? '#fffbf0' : '#fafafa',
                }}>
                  {score > 100 && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#f39c12', color: '#fff', marginBottom: 4, display: 'inline-block' }}>スコア: {score}</span>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 13 }}>@{pr.username || '不明'}</span>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666' }}>
                      <span>❤ {pr.likes || 0}</span>
                      <span>💬 {pr.replies || 0}</span>
                      <span>🔁 {pr.reposts || 0}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5 }}>{pr.content || pr.text || '(メディア投稿)'}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* トレンドタブ */}
      {tab === 'trending' && <TrendingTab />}

      {/* 設定タブ */}
      {tab === 'settings' && <ResearchSettings />}

      {status && <p style={{ marginTop: 12, fontSize: 14, color: status.includes('失敗') ? '#e74c3c' : '#27ae60' }}>{status}</p>}
    </div>
  );
}

function ResearchSettings(): React.JSX.Element {
  const [settings, setSettings] = useState({ buzz_likes: 1000, buzz_replies: 100, buzz_reposts: 50, retention_days: 90, max_pages: 2 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/research/settings`).then((r) => r.json()).then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    await fetch(`${API_BASE}/research/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 400 }}>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>バズ判定閾値</h3>
      {[['buzz_likes', 'いいね'], ['buzz_replies', 'リプライ'], ['buzz_reposts', 'リポスト']] .map(([key, label]) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, color: '#666' }}>{label} ≥</label>
          <input type="number" value={(settings as Record<string, number>)[key]}
            onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
            style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
        </div>
      ))}
      <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 12 }}>データ設定</h3>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: '#666' }}>データ保持期間（日）</label>
        <input type="number" value={settings.retention_days}
          onChange={(e) => setSettings({ ...settings, retention_days: Number(e.target.value) })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#666' }}>取得ページ数</label>
        <input type="number" value={settings.max_pages} min={1} max={4}
          onChange={(e) => setSettings({ ...settings, max_pages: Number(e.target.value) })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
      </div>
      <button onClick={handleSave}
        style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
        保存
      </button>
      {saved && <span style={{ marginLeft: 12, color: '#27ae60', fontSize: 14 }}>保存しました</span>}
    </div>
  );
}

function TrendingTab(): React.JSX.Element {
  const [trendingPosts, setTrendingPosts] = useState<TrendingPost[]>([]);
  const [trendStatus, setTrendStatus] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // 起動時にD1から過去のトレンドを読み込み
  useEffect(() => {
    fetch(`${API_BASE}/chat/trending?limit=100`)
      .then((r) => r.json())
      .then((d) => {
        if (d.posts && d.posts.length > 0) {
          setTrendingPosts(d.posts.map((p: Record<string, unknown>) => ({
            id: p.id, text: p.content, username: p.username,
            likes: p.likes, replies: p.replies, reposts: p.reposts,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setTrendStatus('ブラウザを起動中... ログインしてください');
    try {
      const result = await window.urads.scraperLogin();
      setTrendStatus(result.ok ? 'ログイン成功！Cookie保存済み' : `失敗: ${result.error}`);
    } catch (err) {
      setTrendStatus(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleTrending = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setTrendStatus('トレンド取得中... 人間らしくスクロールしています');
    try {
      const result = await window.urads.scraperTrending() as { ok: boolean; posts?: TrendingPost[]; error?: string; remaining?: number; used?: number };
      if (result.ok && result.posts) {
        setTrendingPosts(result.posts);
        setTrendStatus(`${result.posts.length}件取得（本日 ${result.used || 0}/5回使用、残り${result.remaining ?? '?'}回）`);
      } else {
        setTrendStatus(`失敗（回数未消費）: ${result.error}`);
      }
    } catch (err) {
      setTrendStatus(`エラー（回数未消費）: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={handleLogin} disabled={isBusy}
          style={{
            padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
            background: isBusy ? '#eee' : '#fff', fontSize: 14,
            cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.5 : 1,
          }}>
          Threadsログイン
        </button>
        <button onClick={handleTrending} disabled={isBusy}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: isBusy ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 14,
            cursor: isBusy ? 'default' : 'pointer',
          }}>
          {isBusy ? '実行中...' : 'トレンド取得'}
        </button>
      </div>

      <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        ※初回はログインが必要です。1日5回、30分間隔で取得できます。
        Playwrightでスクレイプするため、APIのリサーチ残量は消費しません。
      </p>

      {trendStatus && (
        <p style={{
          fontSize: 14, marginBottom: 12,
          color: trendStatus.includes('失敗') || trendStatus.includes('エラー') ? '#e74c3c' : '#27ae60',
        }}>
          {trendStatus}
        </p>
      )}

      {trendingPosts.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>トレンド投稿（{trendingPosts.length}件）</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {trendingPosts.map((p, i) => {
              const score = p.likes * 1 + p.replies * 5 + p.reposts * 4;
              return (
                <div key={i} style={{
                  padding: 12, borderRadius: 8,
                  border: score > 100 ? '2px solid #f39c12' : '1px solid #eee',
                  background: score > 100 ? '#fffbf0' : '#fafafa',
                }}>
                  {score > 100 && (
                    <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#f39c12', color: '#fff', marginBottom: 4, display: 'inline-block' }}>
                      スコア: {score}
                    </span>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 'bold', fontSize: 13 }}>@{p.username}</span>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#666' }}>
                      <span>❤ {p.likes}</span>
                      <span>💬 {p.replies}</span>
                      <span>🔁 {p.reposts}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.5 }}>{p.text || '(メディア投稿)'}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
