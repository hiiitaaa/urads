import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../../config';

interface Post {
  id: string;
  content: string;
  status: string;
  threads_id: string | null;
  error: string | null;
  posted_at: number | null;
  created_at: number;
}

const STATUS_LABEL: Record<string, string> = {
  posted: '投稿済み',
  failed: '失敗',
  scheduled: '予約中',
  posting: '投稿中',
  draft: '下書き',
};

interface Props {
  onNavigateToRules?: (threadsPostId: string) => void;
}

export function History({ onNavigateToRules }: Props): React.JSX.Element {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    apiFetch('/posts')
      .then((r) => r.json())
      .then((data) => setPosts(data.posts || []))
      .catch(() => setPosts([]));
  }, []);

  const openInThreads = (threadsId: string) => {
    window.open(`https://www.threads.net/post/${threadsId}`, '_blank');
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>投稿履歴</h1>
      {posts.length === 0 ? (
        <p style={{ color: '#999' }}>投稿履歴はまだありません。</p>
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
                    background: post.status === 'posted' ? '#27ae60' : post.status === 'failed' ? '#e74c3c' : '#f39c12',
                    color: '#fff',
                  }}>
                    {STATUS_LABEL[post.status] || post.status}
                  </span>
                  {post.threads_id && (
                    <>
                      <button
                        onClick={() => openInThreads(post.threads_id!)}
                        style={{
                          fontSize: 12, padding: '2px 8px', borderRadius: 4,
                          border: '1px solid #1a1a2e', background: 'transparent',
                          color: '#1a1a2e', cursor: 'pointer',
                        }}
                      >
                        Threadsで見る
                      </button>
                      {onNavigateToRules && (
                        <button
                          onClick={() => onNavigateToRules(post.threads_id!)}
                          style={{
                            fontSize: 12, padding: '2px 8px', borderRadius: 4,
                            border: '1px solid #9b59b6', background: 'transparent',
                            color: '#9b59b6', cursor: 'pointer',
                          }}
                        >
                          ルール設定→
                        </button>
                      )}
                    </>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#999' }}>
                  {new Date(post.posted_at || post.created_at).toLocaleString()}
                </span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.5 }}>{post.content}</p>
              {post.error && (
                <p style={{ fontSize: 12, color: '#e74c3c', marginTop: 4 }}>
                  エラー: {post.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
