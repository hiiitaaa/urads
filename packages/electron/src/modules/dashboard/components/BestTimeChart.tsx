import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { API_BASE } from '../../../config';

interface Props {
  accountId: string;
}

interface HourData {
  hour: number;
  avgScore: number;
  postCount: number;
}

export function BestTimeChart({ accountId }: Props): React.JSX.Element {
  const [data, setData] = useState<HourData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/posts/insights/time-analysis?account_id=${accountId}`)
      .then((r) => r.json())
      .then((d) => setData(d.analysis || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return <p style={{ color: '#999', fontSize: 13 }}>読み込み中...</p>;

  const hasData = data.some((d) => d.postCount > 0);
  if (!hasData) return <p style={{ color: '#999', fontSize: 13 }}>投稿データがありません。投稿して Insights を更新すると分析が表示されます。</p>;

  const maxScore = Math.max(...data.map((d) => d.avgScore));

  const chartData = data.map((d) => ({
    hour: `${d.hour}時`,
    avgScore: d.avgScore,
    postCount: d.postCount,
    isMax: d.avgScore === maxScore && d.avgScore > 0,
  }));

  // ベスト時間帯を特定
  const bestHours = data
    .filter((d) => d.postCount >= 2 && d.avgScore > 0)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 3);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
        時間帯別の平均エンゲージメントスコア
      </p>

      {bestHours.length > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#f0faf0', border: '1px solid #c3e6cb' }}>
          <span style={{ fontSize: 13, color: '#27ae60' }}>
            おすすめ投稿時間: {bestHours.map((h) => `${h.hour}時`).join('、')}
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="hour" fontSize={10} interval={1} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Bar dataKey="avgScore" name="平均スコア" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.isMax ? '#27ae60' : '#9b59b6'} fillOpacity={entry.postCount > 0 ? 0.8 : 0.2} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
