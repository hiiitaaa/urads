import React, { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../../../config';
import type { RewriteRunResult, RewriteSkipReason } from '@urads/shared';

interface Benchmark {
  id: string;
  threads_handle: string;
  threads_user_id: string | null;
  display_name: string | null;
  follower_count: number | null;
  status: string;
  last_scraped_at: number | null;
  category?: string;
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
  media_urls?: string;
  media_type?: string;
  engagement_rate?: number;
  follower_snapshot?: number;
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

interface Account {
  id: string;
  threads_handle: string;
  display_name: string | null;
}

type RewriteCardState =
  | { kind: 'running'; startedAt: number }
  | { kind: 'ok'; message: string }
  | { kind: 'skip'; message: string }
  | { kind: 'err'; message: string };

const SKIP_MESSAGES: Record<RewriteSkipReason, string> = {
  persona_not_set: '先に世界観を設定してください（設定 → 世界観（persona））',
  ng_violation: 'NG判定でスキップ',
  all_failed_guardrail: 'ガードレール全失格でスキップ（丸パクリ防止）',
  skill_error: 'AI実行エラー',
  invalid_skill_output: 'AI出力をJSON解析できませんでした',
};

export function Research(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('benchmarks');
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(new Set(['benchmarks']));
  const selectTab = (t: Tab) => {
    setMountedTabs((prev) => new Set([...prev, t]));
    setTab(t);
  };
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [newHandle, setNewHandle] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScrapedPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ScrapedPost[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [rewriteStates, setRewriteStates] = useState<Record<string, RewriteCardState>>({});
  const [, forceTick] = useState(0); // running タイマー再描画用
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadBenchmarks();
    loadBudget();
    loadAccounts();
  }, []);

  // リライト実行中がある限り 1秒刻みで再描画（経過秒カウンタ用）
  useEffect(() => {
    const hasRunning = Object.values(rewriteStates).some((s) => s.kind === 'running');
    if (hasRunning && !tickRef.current) {
      tickRef.current = setInterval(() => forceTick((n) => n + 1), 1000);
    } else if (!hasRunning && tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    };
  }, [rewriteStates]);

  const loadAccounts = async () => {
    try {
      const r = await fetch(`${API_BASE}/accounts`);
      const d = await r.json();
      const accs: Account[] = d.accounts || [];
      setAccounts(accs);
      if (accs.length > 0 && !selectedAccount) setSelectedAccount(accs[0].id);
    } catch { /* ignore */ }
  };

  const handleRewrite = async (postId: string) => {
    if (!selectedAccount) {
      setRewriteStates((s) => ({ ...s, [postId]: { kind: 'err', message: 'アカウントを選択してください' } }));
      return;
    }
    setRewriteStates((s) => ({ ...s, [postId]: { kind: 'running', startedAt: Date.now() } }));
    try {
      const res = (await (window.urads as any).aiRunBuzzRewrite({
        scraped_post_id: postId,
        account_id: selectedAccount,
      })) as RewriteRunResult;
      if (res.ok) {
        const msg = res.already_existed
          ? `既存の下書きに到達しました（案: ${res.variants_saved}件）`
          : `下書き保存しました（案: ${res.variants_saved}件）`;
        setRewriteStates((s) => ({ ...s, [postId]: { kind: 'ok', message: msg } }));
        setTimeout(() => {
          setRewriteStates((s) => {
            const next = { ...s };
            if (next[postId]?.kind === 'ok') delete next[postId];
            return next;
          });
        }, 8000);
      } else if (res.skipped) {
        const base = SKIP_MESSAGES[res.reason] ?? 'スキップ';
        setRewriteStates((s) => ({
          ...s,
          [postId]: { kind: 'skip', message: res.detail ? `${base}（${res.detail}）` : base },
        }));
      } else {
        setRewriteStates((s) => ({ ...s, [postId]: { kind: 'err', message: res.error } }));
      }
    } catch (err) {
      setRewriteStates((s) => ({
        ...s,
        [postId]: { kind: 'err', message: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  const dismissRewriteStatus = (postId: string) => {
    setRewriteStates((s) => {
      const next = { ...s };
      delete next[postId];
      return next;
    });
  };

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
      body: JSON.stringify({ threads_handle: newHandle, threads_user_id: newUserId || undefined, category: newCategory || undefined }),
    });
    setNewHandle(''); setNewUserId(''); setNewCategory('');
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
        if (postCount > 0) {
          setStatus(`完了: ${postCount}件の投稿を取得`);
          loadPosts(id); // 自動で投稿一覧を表示
        } else {
          setStatus(`取得0件: ページの読み込みに失敗したか、投稿データの形式が変更された可能性があります。アクティビティログで詳細を確認してください。`);
        }
        loadBenchmarks();
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
          <button key={id} onClick={() => selectTab(id)}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: tab === id ? '#1a1a2e' : '#eee', color: tab === id ? '#fff' : '#333', fontSize: 14 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ベンチマークタブ */}
      <div style={{ display: tab === 'benchmarks' ? 'block' : 'none' }}>
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder="@handle"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, width: 160 }} />
            <input value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="User ID（任意）"
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, width: 160 }} />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}>
              <option value="">カテゴリ（任意）</option>
              <option value="占い">占い</option>
              <option value="恋愛">恋愛</option>
              <option value="美容">美容</option>
              <option value="ビジネス">ビジネス</option>
              <option value="ライフスタイル">ライフスタイル</option>
              <option value="その他">その他</option>
            </select>
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
                  <span
                    style={{ fontWeight: 'bold', fontSize: 13, cursor: 'pointer', color: '#1a1a2e' }}
                    onClick={(e) => { e.stopPropagation(); (window.urads as any).openExternal(`https://www.threads.net/@${bm.threads_handle}`); }}
                    title="Threadsプロフィールを開く"
                  >
                    @{bm.threads_handle}
                  </span>
                  {bm.display_name && <span style={{ color: '#666', marginLeft: 8 }}>{bm.display_name}</span>}
                  {bm.category && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#e8e0f0', color: '#8e44ad', marginLeft: 8 }}>{bm.category}</span>}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>収集投稿（{posts.length}件）</h3>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: '#666' }}>リライト対象</label>
                  <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 12, minWidth: 180 }}>
                    {accounts.length === 0 && <option value="">（アカウント未連携）</option>}
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>@{a.threads_handle}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {posts.map((p) => (
                  <div key={p.id} style={{ padding: 12, borderRadius: 8, border: p.is_buzz ? '2px solid #f39c12' : '1px solid #eee',
                    background: p.is_buzz ? '#fffbf0' : '#fafafa' }}>
                    {p.is_buzz && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 3, background: '#f39c12', color: '#fff', marginBottom: 4, display: 'inline-block' }}>BUZZ</span>}
                    {p.media_urls && (() => {
                      try {
                        const urls = typeof p.media_urls === 'string' ? JSON.parse(p.media_urls) : p.media_urls;
                        if (Array.isArray(urls) && urls.length > 0) {
                          return (
                            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                              {urls.slice(0, 3).map((url: string, idx: number) => (
                                <img key={idx} src={url} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4 }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ))}
                              {urls.length > 3 && <span style={{ fontSize: 11, color: '#999', alignSelf: 'center' }}>+{urls.length - 3}</span>}
                            </div>
                          );
                        }
                      } catch { /* parse error */ }
                      return null;
                    })()}
                    <p style={{ fontSize: 14, lineHeight: 1.5 }}>{p.content || '(メディア投稿)'}</p>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginTop: 4, alignItems: 'center' }}>
                      <span>❤ {p.likes}</span>
                      <span>💬 {p.replies}</span>
                      <span>🔁 {p.reposts}</span>
                      {p.engagement_rate != null && (
                        <span style={{ color: p.engagement_rate >= 0.08 ? '#e67e22' : '#999' }}>
                          ER {(p.engagement_rate * 100).toFixed(1)}%
                        </span>
                      )}
                      {p.posted_at && <span>{new Date(p.posted_at).toLocaleDateString()}</span>}
                      {p.is_buzz === 1 && (() => {
                        const st = rewriteStates[p.id];
                        const running = st?.kind === 'running';
                        return (
                          <button
                            onClick={() => handleRewrite(p.id)}
                            disabled={running || accounts.length === 0}
                            style={{
                              marginLeft: 'auto', padding: '4px 12px', borderRadius: 4,
                              border: 'none',
                              background: running ? '#ccc' : '#8e44ad',
                              color: '#fff', fontSize: 12, cursor: running ? 'wait' : 'pointer',
                            }}
                            title={accounts.length === 0 ? 'アカウント未連携' : 'この投稿をリライト'}
                          >
                            {running ? 'リライト中...' : 'リライト'}
                          </button>
                        );
                      })()}
                    </div>

                    {/* リライト結果 */}
                    {(() => {
                      const st = rewriteStates[p.id];
                      if (!st) return null;
                      const palette = {
                        running: { bg: '#eef5ff', color: '#1a5490', icon: '🔄' },
                        ok: { bg: '#eaf9ee', color: '#1e7a3b', icon: '✅' },
                        skip: { bg: '#fff7e0', color: '#a56a00', icon: '⚠' },
                        err: { bg: '#fdecea', color: '#c0392b', icon: '❌' },
                      }[st.kind];
                      const body = st.kind === 'running'
                        ? `リライト中... (${Math.floor((Date.now() - st.startedAt) / 1000)}秒)`
                        : st.message;
                      return (
                        <div style={{
                          marginTop: 8, padding: '6px 10px', borderRadius: 4,
                          background: palette.bg, color: palette.color, fontSize: 12,
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span>{palette.icon}</span>
                          <span style={{ flex: 1 }}>{body}</span>
                          {st.kind !== 'running' && (
                            <button onClick={() => dismissRewriteStatus(p.id)}
                              style={{ border: 'none', background: 'transparent', color: palette.color, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                              title="閉じる">
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      </div>

      {/* キーワード検索タブ */}
      {mountedTabs.has('search') && (
      <div style={{ display: tab === 'search' ? 'block' : 'none' }}>
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
            {[...searchResults].sort((a, b) => {
              const sa = a as unknown as { likes?: number; replies?: number; reposts?: number };
              const sb = b as unknown as { likes?: number; replies?: number; reposts?: number };
              return ((sb.likes || 0) + (sb.replies || 0) * 5 + (sb.reposts || 0) * 4)
                   - ((sa.likes || 0) + (sa.replies || 0) * 5 + (sa.reposts || 0) * 4);
            }).map((p, i) => {
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
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        style={{ fontWeight: 'bold', fontSize: 13, cursor: 'pointer', color: '#1a1a2e' }}
                        onClick={(e) => { e.stopPropagation(); (window.urads as any).openExternal(`https://www.threads.net/@${pr.username || ''}`); }}
                        title="Threadsプロフィールを開く"
                      >
                        @{pr.username || '不明'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const handle = pr.username;
                          if (!handle) return;
                          fetch(`${API_BASE}/research/benchmarks`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ threads_handle: handle }),
                          }).then(() => {
                            setStatus(`@${handle} をベンチマークに追加しました`);
                          }).catch(() => {
                            setStatus('追加に失敗しました');
                          });
                        }}
                        style={{
                          padding: '2px 8px', borderRadius: 4, border: '1px solid #3498db',
                          background: 'transparent', color: '#3498db', fontSize: 11, cursor: 'pointer',
                          marginLeft: 8,
                        }}
                      >
                        + ベンチマーク
                      </button>
                    </div>
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
      </div>
      )}

      {/* トレンドタブ */}
      {mountedTabs.has('trending') && (
      <div style={{ display: tab === 'trending' ? 'block' : 'none' }}>
        <TrendingTab />
      </div>
      )}

      {/* 設定タブ */}
      {mountedTabs.has('settings') && (
      <div style={{ display: tab === 'settings' ? 'block' : 'none' }}>
        <ResearchSettings />
      </div>
      )}

      {status && <p style={{ marginTop: 12, fontSize: 14, color: status.includes('失敗') ? '#e74c3c' : '#27ae60' }}>{status}</p>}
    </div>
  );
}

function ResearchSettings(): React.JSX.Element {
  const [settings, setSettings] = useState({ buzz_likes: 1000, buzz_replies: 100, buzz_reposts: 50, retention_days: 90, max_pages: 2, search_min_likes: 0, search_max_results: 50, benchmark_scrape_days: 30, search_filter_days: 7, buzz_engagement_rate: 0.08 });
  const [saved, setSaved] = useState(false);
  const [schedule, setSchedule] = useState({ enabled: false, hour: 9, minute: 0, types: ['trending'] as string[] });

  useEffect(() => {
    fetch(`${API_BASE}/research/settings`).then((r) => r.json()).then(setSettings).catch(() => {});
    (window.urads as any).researchGetSchedule?.().then((s: any) => {
      if (s) setSchedule(s);
    }).catch(() => {});
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

      <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 12 }}>検索フィルタ</h3>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: '#666' }}>最大表示件数</label>
        <input type="number" value={settings.search_max_results} min={10} max={200}
          onChange={(e) => setSettings({ ...settings, search_max_results: Number(e.target.value) })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#666' }}>最低いいね数（下限フィルタ）</label>
        <input type="number" value={settings.search_min_likes} min={0} max={100000}
          onChange={(e) => setSettings({ ...settings, search_min_likes: Number(e.target.value) })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>0 = フィルタなし。設定するとエンゲージメントの低い投稿を除外します</p>
      </div>

      <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 12 }}>スクレイピング期間</h3>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: '#666' }}>ベンチマーク取得期間（日）</label>
        <input type="number" value={settings.benchmark_scrape_days} min={1} max={90}
          onChange={(e) => setSettings({ ...settings, benchmark_scrape_days: Number(e.target.value) })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#666' }}>キーワード検索表示期間（日）</label>
        <input type="number" value={settings.search_filter_days} min={1} max={90}
          onChange={(e) => setSettings({ ...settings, search_filter_days: Number(e.target.value) })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
      </div>

      <h3 style={{ fontSize: 16, marginTop: 20, marginBottom: 12 }}>バズ判定</h3>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: '#666' }}>エンゲージメント率閾値（%）</label>
        <input type="number" value={Math.round(settings.buzz_engagement_rate * 100)} min={1} max={100} step={1}
          onChange={(e) => setSettings({ ...settings, buzz_engagement_rate: Number(e.target.value) / 100 })}
          style={{ marginLeft: 8, width: 80, padding: 6, borderRadius: 4, border: '1px solid #ddd', fontSize: 14 }} />
        <p style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          (いいね + リプライx2 + リポストx3) / フォロワー数。フォロワー数不明時は従来の絶対値判定を使用
        </p>
      </div>

      <button onClick={handleSave}
        style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
        保存
      </button>
      {saved && <span style={{ marginLeft: 12, color: '#27ae60', fontSize: 14 }}>保存しました</span>}

      <h3 style={{ fontSize: 16, marginTop: 28, marginBottom: 12 }}>定時リサーチ</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 14 }}>
        <input type="checkbox" checked={schedule.enabled}
          onChange={(e) => {
            const next = { ...schedule, enabled: e.target.checked };
            setSchedule(next);
            (window.urads as any).researchSetSchedule(next);
          }}
          style={{ width: 18, height: 18 }} />
        毎日自動でリサーチを実行
      </label>
      {schedule.enabled && (
        <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <label style={{ fontSize: 13 }}>実行時刻:</label>
            <input type="number" min={0} max={23} value={schedule.hour}
              onChange={(e) => {
                const next = { ...schedule, hour: Number(e.target.value) };
                setSchedule(next);
                (window.urads as any).researchSetSchedule(next);
              }}
              style={{ width: 50, padding: 4, borderRadius: 4, border: '1px solid #ddd', fontSize: 14, textAlign: 'center' as const }} />
            <span>:</span>
            <input type="number" min={0} max={59} value={schedule.minute}
              onChange={(e) => {
                const next = { ...schedule, minute: Number(e.target.value) };
                setSchedule(next);
                (window.urads as any).researchSetSchedule(next);
              }}
              style={{ width: 50, padding: 4, borderRadius: 4, border: '1px solid #ddd', fontSize: 14, textAlign: 'center' as const }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
            <label style={{ fontSize: 13, color: '#666' }}>実行内容:</label>
            {[['trending', 'トレンド取得'], ['insights', 'Insights更新'], ['benchmark', 'ベンチマーク更新']].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={schedule.types.includes(val)}
                  onChange={(e) => {
                    const types = e.target.checked
                      ? [...schedule.types, val]
                      : schedule.types.filter(t => t !== val);
                    const next = { ...schedule, types };
                    setSchedule(next);
                    (window.urads as any).researchSetSchedule(next);
                  }}
                  style={{ width: 16, height: 16 }} />
                {label}
              </label>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
            アプリ起動中のみ実行されます。実行時間には1〜5分のランダムな遅延が入ります。
          </p>
        </div>
      )}
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
                    <span
                      style={{ fontWeight: 'bold', fontSize: 13, cursor: 'pointer', color: '#1a1a2e' }}
                      onClick={(e) => { e.stopPropagation(); (window.urads as any).openExternal(`https://www.threads.net/@${p.username}`); }}
                      title="Threadsプロフィールを開く"
                    >
                      @{p.username}
                    </span>
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
