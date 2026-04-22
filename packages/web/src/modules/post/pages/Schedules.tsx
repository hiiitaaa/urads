import React, { useState, useEffect } from 'react';

import { apiFetch } from '../../../config';

interface ScheduledPost {
  id: string;
  account_id: string;
  content: string;
  status: string;
  scheduled_at: number;
  created_at: number;
  error: string | null;
}

export function Schedules(): React.JSX.Element {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = () => {
    setLoading(true);
    apiFetch('/posts?status=scheduled')
      .then((r) => r.json())
      .then((data) => setPosts(data.posts || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('この予約を削除しますか？')) return;
    try {
      await apiFetch(`/posts/${id}`, { method: 'DELETE' });
      loadPosts();
    } catch {
      alert('削除に失敗しました');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24 }}>予約一覧</h1>
        <button
          onClick={loadPosts}
          style={{
            padding: '6px 16px', borderRadius: 6, border: '1px solid #ddd',
            background: '#fff', cursor: 'pointer', fontSize: 13,
          }}
        >
          更新
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#999' }}>読み込み中...</p>
      ) : posts.length === 0 ? (
        <p style={{ color: '#999' }}>予約投稿はありません。新規投稿画面から予約できます。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map((post) => (
            <div key={post.id} style={{
              padding: 16, borderRadius: 8, border: '1px solid #eee', background: '#fafafa',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 12, padding: '2px 8px', borderRadius: 4,
                    background: '#f39c12', color: '#fff',
                  }}>
                    予約中
                  </span>
                  <span style={{ fontSize: 13, color: '#666' }}>
                    {new Date(post.scheduled_at).toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(post.id)}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: '1px solid #e74c3c',
                    background: 'transparent', color: '#e74c3c', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  削除
                </button>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.5 }}>{post.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
