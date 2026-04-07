import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../../config';

interface Props {
  benchmarkId: string;
}

interface KeywordData {
  word: string;
  count: number;
  samplePost: string;
}

export function BuzzWordRanking({ benchmarkId }: Props): React.JSX.Element {
  const [data, setData] = useState<KeywordData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/research/benchmarks/${benchmarkId}/keywords`)
      .then((r) => r.json())
      .then((d) => setData(d.keywords || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [benchmarkId]);

  if (loading) return <p style={{ color: '#999', fontSize: 13 }}>分析中...</p>;
  if (data.length === 0) return <p style={{ color: '#999', fontSize: 13 }}>バズ投稿がないか、キーワードが抽出できませんでした。</p>;

  const maxCount = data[0]?.count || 1;

  return (
    <div>
      <h4 style={{ fontSize: 14, margin: '0 0 12px' }}>バズ投稿キーワードランキング</h4>
      <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
        バズ判定された投稿から頻出キーワードを抽出しています
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((kw, idx) => (
          <div key={kw.word} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            borderRadius: 6, background: idx < 3 ? '#faf5ff' : '#fff', border: '1px solid #eee',
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: idx < 3 ? '#9b59b6' : '#e0e0e0',
              color: idx < 3 ? '#fff' : '#666', fontSize: 11, fontWeight: 600,
            }}>
              {idx + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{kw.word}</span>
                <span style={{ fontSize: 12, color: '#999' }}>{kw.count}回</span>
              </div>
              {/* バー */}
              <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#eee', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(kw.count / maxCount) * 100}%`, background: '#9b59b6', borderRadius: 2 }} />
              </div>
              {kw.samplePost && (
                <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {kw.samplePost}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
