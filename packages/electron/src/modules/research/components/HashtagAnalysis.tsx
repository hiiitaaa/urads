import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_BASE } from '../../../config';

interface Props {
  benchmarkId: string;
}

interface HashtagData {
  hashtag: string;
  count: number;
  avgLikes: number;
  avgReplies: number;
  avgScore: number;
}

type SortKey = 'count' | 'avgLikes' | 'avgScore';

export function HashtagAnalysis({ benchmarkId }: Props): React.JSX.Element {
  const [data, setData] = useState<HashtagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('count');

  useEffect(() => {
    fetch(`${API_BASE}/research/benchmarks/${benchmarkId}/hashtags`)
      .then((r) => r.json())
      .then((d) => setData(d.hashtags || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [benchmarkId]);

  if (loading) return <p style={{ color: '#999', fontSize: 13 }}>分析中...</p>;
  if (data.length === 0) return <p style={{ color: '#999', fontSize: 13 }}>ハッシュタグが見つかりません。投稿データをスクレイプしてください。</p>;

  const sorted = [...data].sort((a, b) => b[sortKey] - a[sortKey]);
  const chartData = sorted.slice(0, 15).map((d) => ({ ...d, name: d.hashtag }));

  return (
    <div>
      <h4 style={{ fontSize: 14, margin: '0 0 12px' }}>ハッシュタグ分析</h4>

      {/* チャート */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis type="number" fontSize={11} />
          <YAxis type="category" dataKey="name" fontSize={11} width={80} />
          <Tooltip />
          <Bar dataKey="avgScore" fill="#9b59b6" name="平均スコア" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {/* テーブル */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {([['count', '出現数'], ['avgLikes', '平均いいね'], ['avgScore', '平均スコア']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortKey(key)}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                border: sortKey === key ? '1px solid #9b59b6' : '1px solid #ddd',
                background: sortKey === key ? '#faf5ff' : '#fff', color: sortKey === key ? '#9b59b6' : '#666',
              }}>
              {label}順
            </button>
          ))}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
              <th style={thStyle}>ハッシュタグ</th>
              <th style={thNumStyle}>出現数</th>
              <th style={thNumStyle}>平均いいね</th>
              <th style={thNumStyle}>平均リプライ</th>
              <th style={thNumStyle}>平均スコア</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => (
              <tr key={row.hashtag} style={{ background: idx % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '6px 10px', color: '#3498db' }}>{row.hashtag}</td>
                <td style={tdNumStyle}>{row.count}</td>
                <td style={tdNumStyle}>{row.avgLikes}</td>
                <td style={tdNumStyle}>{row.avgReplies}</td>
                <td style={{ ...tdNumStyle, fontWeight: 600 }}>{row.avgScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 12, color: '#666', fontWeight: 600 };
const thNumStyle: React.CSSProperties = { ...thStyle, textAlign: 'right' };
const tdNumStyle: React.CSSProperties = { padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
