import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../config';

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

type Tab = 'benchmarks' | 'trending' | 'settings';

export function Research(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('benchmarks');
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [newHandle, setNewHandle] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [selectedBenchmark, setSelectedBenchmark] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScrapedPost[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    loadBenchmarks();
    loadBudget();
  }, []);

  const loadBenchmarks = () => {
    apiFetch('/research/benchmarks')
      .then((r) => r.json())
      .then((d) => setBenchmarks(d.benchmarks || []))
      .catch(() => {});
  };

  const loadBudget = () => {
    apiFetch('/research/limits')
      .then((r) => r.json())
      .then((d) => setBudget(d.budget))
      .catch(() => {});
  };

  const handleAdd = async () => {
    if (!newHandle) return;
    await apiFetch('/research/benchmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threads_handle: newHandle, threads_user_id: newUserId || undefined, category: newCategory || undefined }),
    });
    setNewHandle(''); setNewUserId(''); setNewCategory('');
    loadBenchmarks();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await apiFetch(`/research/benchmarks/${id}`, { method: 'DELETE' });
    if (selectedBenchmark === id) { setSelectedBenchmark(null); setPosts([]); }
    loadBenchmarks();
  };

  const loadPosts = (id: string) => {
    setSelectedBenchmark(id);
    apiFetch(`/research/benchmarks/${id}/posts?limit=100`)
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .catch(() => setPosts([]));
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

      {/* タブ（キーワード検索はPC版のみ） */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {([['benchmarks', 'ベンチマーク'], ['trending', 'トレンド閲覧'], ['settings', '設定']] as [Tab, string][]).map(([id, label]) => (
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
                  <a
                    href={`https://www.threads.net/@${bm.threads_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e', textDecoration: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{bm.threads_handle}
                  </a>
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
                  <span style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #ccc', background: '#f5f5f5', color: '#999', fontSize: 12 }}>
                    スクレイプはPC版から
                  </span>
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
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginTop: 4 }}>
                      <span>❤ {p.likes}</span>
                      <span>💬 {p.replies}</span>
                      <span>🔁 {p.reposts}</span>
                      {p.engagement_rate != null && (
                        <span style={{ color: p.engagement_rate >= 0.08 ? '#e67e22' : '#999' }}>
                          ER {(p.engagement_rate * 100).toFixed(1)}%
                        </span>
                      )}
                      {p.posted_at && <span>{new Date(p.posted_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* トレンドタブ（D1に保存済みデータを閲覧） */}
      {tab === 'trending' && <TrendingTab />}

      {/* 設定タブ */}
      {tab === 'settings' && <ResearchSettings />}

      {status && <p style={{ marginTop: 12, fontSize: 14, color: status.includes('失敗') ? '#e74c3c' : '#27ae60' }}>{status}</p>}
    </div>
  );
}

function TrendingTab(): React.JSX.Element {
  const [trendingPosts, setTrendingPosts] = useState<Array<{ id: string; text: string; username: string; likes: number; replies: number; reposts: number }>>([]);

  useEffect(() => {
    apiFetch('/chat/trending?limit=100')
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

  return (
    <div>
      <p style={{ fontSize: 13, color: '#999', marginBottom: 16 }}>
        PC版で取得したトレンドデータを閲覧できます。新規取得はPC版から行ってください。
      </p>

      {trendingPosts.length === 0 ? (
        <p style={{ color: '#999' }}>トレンドデータがありません。PC版で取得してください。</p>
      ) : (
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
                    <a
                      href={`https://www.threads.net/@${p.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 'bold', fontSize: 13, color: '#1a1a2e', textDecoration: 'none' }}
                    >
                      @{p.username}
                    </a>
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

function ResearchSettings(): React.JSX.Element {
  const [settings, setSettings] = useState({ buzz_likes: 1000, buzz_replies: 100, buzz_reposts: 50, retention_days: 90, max_pages: 2, search_min_likes: 0, search_max_results: 50, benchmark_scrape_days: 30, search_filter_days: 7, buzz_engagement_rate: 0.08 });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/research/settings').then((r) => r.json()).then(setSettings).catch(() => {});
  }, []);

  const handleSave = async () => {
    await apiFetch('/research/settings', {
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
      {[['buzz_likes', 'いいね'], ['buzz_replies', 'リプライ'], ['buzz_reposts', 'リポスト']].map(([key, label]) => (
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
    </div>
  );
}
