import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { API_BASE } from '../../../config';

interface Props {
  accountId: string;
  threadsId: string;
  contentPreview: string;
}

interface TrendPoint {
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  score: number;
  fetched_at: number;
}

export function EngagementTrendChart({ accountId, threadsId, contentPreview }: Props): React.JSX.Element {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/posts/insights/trends?account_id=${accountId}&threads_id=${threadsId}`)
      .then((r) => r.json())
      .then((d) => setData(d.trends || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accountId, threadsId]);

  if (loading) return <p style={{ color: '#999', fontSize: 13 }}>読み込み中...</p>;
  if (data.length < 2) return <p style={{ color: '#999', fontSize: 13 }}>推移データが不足しています（2回以上のInsights取得が必要）</p>;

  const chartData = data.map((d) => ({
    ...d,
    date: new Date(d.fetched_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
        「{contentPreview?.slice(0, 30)}...」のエンゲージメント推移
      </p>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="likes" stroke="#e74c3c" name="いいね" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="replies" stroke="#3498db" name="リプライ" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="reposts" stroke="#27ae60" name="リポスト" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="score" stroke="#9b59b6" name="スコア" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
