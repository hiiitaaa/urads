import React, { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '../../../config';

interface Insight {
  threads_id: string;
  content_preview: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  fetched_at: number;
  score: number;
}

interface Account {
  id: string;
  threads_handle: string;
}

type SortKey = 'score' | 'likes' | 'replies' | 'reposts' | 'quotes' | 'fetched_at';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

export function Dashboard(): React.JSX.Element {
  const [account, setAccount] = useState<Account | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const fetchInsights = async (accountId: string) => {
    try {
      const res = await apiFetch(`/posts/insights?account_id=${accountId}`);
      const data = await res.json() as { insights: Insight[] };
      setInsights(data.insights || []);
    } catch {
      setInsights([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const accRes = await apiFetch('/accounts');
        const accData = await accRes.json() as { accounts: Account[] };
        if (!accData.accounts || accData.accounts.length === 0) {
          setNoAccount(true);
          setLoading(false);
          return;
        }
        const acc = accData.accounts[0];
        setAccount(acc);
        await fetchInsights(acc.id);
      } catch {
        setError('データの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sorted = useMemo(() => {
    const arr = [...insights];
    arr.sort((a, b) => {
      const diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
      return sortAsc ? diff : -diff;
    });
    return arr;
  }, [insights, sortKey, sortAsc]);

  const displayed = showAll ? sorted : sorted.slice(0, 20);

  // サマリー計算
  const totalPosts = insights.length;
  const avgScore = totalPosts > 0
    ? (insights.reduce((sum, i) => sum + i.score, 0) / totalPosts).toFixed(1)
    : '0';
  const bestPost = insights.length > 0
    ? insights.reduce((best, i) => i.score > best.score ? i : best, insights[0])
    : null;
  const lastFetched = insights.length > 0
    ? Math.max(...insights.map((i) => i.fetched_at))
    : 0;

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>読み込み中...</div>;
  }

  if (noAccount) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>ダッシュボード</h2>
        <p style={{ color: '#888' }}>アカウントが登録されていません。設定からアカウントを追加してください。</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>ダッシュボード</h2>
        <span style={{ fontSize: 12, color: '#999' }}>Insights更新はPC版から</span>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fff3f3', border: '1px solid #fcc', borderRadius: 6, color: '#c00', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* サマリーカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <Card label="総投稿数" value={String(totalPosts)} />
        <Card label="平均スコア" value={avgScore} />
        <Card label="ベスト投稿" value={bestPost ? `${bestPost.content_preview?.slice(0, 20) || '—'}… (${bestPost.score})` : '—'} />
        <Card label="最終取得" value={lastFetched ? relativeTime(lastFetched) : '未取得'} />
      </div>

      {/* 投稿テーブル */}
      {insights.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
          データがありません。PC版から「Insightsを更新」でデータを取得してください。
        </div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                <th style={thStyle}>投稿内容</th>
                <SortTh label="いいね" sortKey="likes" currentKey={sortKey} asc={sortAsc} onClick={handleSort} />
                <SortTh label="リプライ" sortKey="replies" currentKey={sortKey} asc={sortAsc} onClick={handleSort} />
                <SortTh label="リポスト" sortKey="reposts" currentKey={sortKey} asc={sortAsc} onClick={handleSort} />
                <SortTh label="引用" sortKey="quotes" currentKey={sortKey} asc={sortAsc} onClick={handleSort} />
                <SortTh label="スコア" sortKey="score" currentKey={sortKey} asc={sortAsc} onClick={handleSort} />
                <SortTh label="取得日時" sortKey="fetched_at" currentKey={sortKey} asc={sortAsc} onClick={handleSort} />
              </tr>
            </thead>
            <tbody>
              {displayed.map((row, idx) => (
                <tr key={row.threads_id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>{row.content_preview || '—'}</td>
                  <td style={tdNumStyle}>{row.likes}</td>
                  <td style={tdNumStyle}>{row.replies}</td>
                  <td style={tdNumStyle}>{row.reposts}</td>
                  <td style={tdNumStyle}>{row.quotes}</td>
                  <td style={{ ...tdNumStyle, fontWeight: 600 }}>{row.score}</td>
                  <td style={tdStyle}>{relativeTime(row.fetched_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && sorted.length > 20 && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={() => setShowAll(true)}
                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >
                すべて表示（{sorted.length}件）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
      padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function SortTh({ label, sortKey, currentKey, asc, onClick }: {
  label: string; sortKey: SortKey; currentKey: SortKey; asc: boolean;
  onClick: (key: SortKey) => void;
}): React.JSX.Element {
  const active = currentKey === sortKey;
  const arrow = active ? (asc ? ' ↑' : ' ↓') : '';
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{ ...thStyle, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{arrow}
    </th>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 12, color: '#666', fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const tdNumStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};
