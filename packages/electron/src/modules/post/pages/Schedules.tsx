import React, { useState, useEffect } from 'react';

import { API_BASE } from '../../../config';
import type { RewriteMetadata, SavedRewriteVariant } from '@urads/shared';

interface ScheduledPost {
  id: string;
  account_id: string;
  content: string;
  status: string;
  scheduled_at: number;
  created_at: number;
  error: string | null;
}

interface DraftPost {
  id: string;
  account_id: string;
  content: string;
  status: string;
  created_at: number;
  updated_at: number;
  source_scraped_post_id: string | null;
  rewrite_metadata: string | null; // JSON string
  persona_hash: string | null;
}

export function Schedules(): React.JSX.Element {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/posts?status=scheduled`).then((r) => r.json()).catch(() => ({ posts: [] })),
      fetch(`${API_BASE}/posts?status=draft`).then((r) => r.json()).catch(() => ({ posts: [] })),
    ])
      .then(([schedRes, draftRes]) => {
        setPosts(schedRes.posts || []);
        const rewriteDrafts = (draftRes.posts || []).filter(
          (p: DraftPost) => p.source_scraped_post_id != null,
        );
        setDrafts(rewriteDrafts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    try {
      await fetch(`${API_BASE}/posts/${id}`, { method: 'DELETE' });
      loadAll();
    } catch {
      alert('削除に失敗しました');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24 }}>予約一覧</h1>
        <button
          onClick={loadAll}
          style={{
            padding: '6px 16px', borderRadius: 6, border: '1px solid #ddd',
            background: '#fff', cursor: 'pointer', fontSize: 13,
          }}
        >
          更新
        </button>
      </div>

      {/* 下書き（リライト） */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>
          下書き（リライト）{drafts.length > 0 && <span style={{ color: '#8e44ad', marginLeft: 6 }}>{drafts.length}</span>}
        </h2>
        {loading ? (
          <p style={{ color: '#999' }}>読み込み中...</p>
        ) : drafts.length === 0 ? (
          <p style={{ color: '#999', fontSize: 13 }}>リサーチ画面でバズ投稿をリライトすると、ここに下書きが表示されます。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onChanged={loadAll} onDelete={() => handleDelete(d.id)} />
            ))}
          </div>
        )}
      </section>

      {/* 予約投稿 */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>予約投稿</h2>
        {loading ? (
          <p style={{ color: '#999' }}>読み込み中...</p>
        ) : posts.length === 0 ? (
          <p style={{ color: '#999', fontSize: 13 }}>予約投稿はありません。新規投稿画面から予約できます。</p>
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
      </section>
    </div>
  );
}

function parseMetadata(raw: string | null): RewriteMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RewriteMetadata;
  } catch {
    return null;
  }
}

function DraftCard({
  draft, onChanged, onDelete,
}: {
  draft: DraftPost;
  onChanged: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const metadata = parseMetadata(draft.rewrite_metadata);
  const [content, setContent] = useState(draft.content);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const dirty = content !== draft.content;
  const tooLong = content.length > 500;

  const variants = metadata?.variants ?? [];
  const currentIdx = variants.findIndex((v) => v.content === content);

  const switchToVariant = (v: SavedRewriteVariant) => {
    if (dirty && !confirm('未保存の変更を破棄して案を切り替えますか？')) return;
    setContent(v.content);
    setStatus(null);
  };

  const handleSave = async () => {
    if (!content.trim() || tooLong) return;
    setSaving(true);
    setStatus(null);
    try {
      const r = await fetch(`${API_BASE}/posts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${r.status}`);
      }
      setStatus({ kind: 'ok', message: '保存しました' });
      setTimeout(() => setStatus(null), 3000);
      onChanged();
    } catch (err) {
      setStatus({ kind: 'err', message: `保存失敗: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      padding: 16, borderRadius: 8, border: '1px solid #e0d0f0', background: '#faf7fd',
    }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 12, padding: '2px 8px', borderRadius: 4,
            background: '#8e44ad', color: '#fff',
          }}>
            🎨 下書き
          </span>
          {metadata?.benchmark_handle && (
            <span style={{ fontSize: 13, color: '#666' }}>
              @{metadata.benchmark_handle} 由来
            </span>
          )}
          <span style={{ fontSize: 12, color: '#999' }}>
            {new Date(draft.updated_at).toLocaleString()}
          </span>
        </div>
        <button
          onClick={onDelete}
          style={{
            padding: '4px 12px', borderRadius: 4, border: '1px solid #e74c3c',
            background: 'transparent', color: '#e74c3c', fontSize: 12, cursor: 'pointer',
          }}
        >
          削除
        </button>
      </div>

      {/* 元投稿プレビュー */}
      {metadata?.original_preview && (
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 10px', padding: '6px 10px', background: '#f0ebf7', borderRadius: 4, lineHeight: 1.5 }}>
          元: {metadata.original_preview}{metadata.original_preview.length >= 80 && '…'}
        </p>
      )}

      {/* テーマ差し替え表示 */}
      {metadata?.theme_remapped && (
        <p style={{ fontSize: 11, color: '#8e44ad', margin: '0 0 8px' }}>
          テーマ: {metadata.original_theme} → {metadata.target_theme}
        </p>
      )}

      {/* 案切替タブ */}
      {variants.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {variants.map((v, i) => {
            const isCurrent = i === currentIdx;
            const passed = v.guardrail?.passed !== false;
            return (
              <button
                key={i}
                onClick={() => switchToVariant(v)}
                disabled={isCurrent}
                title={passed ? v.reasoning : `失格: ${v.guardrail?.failures?.map((f) => f.code).join(', ')}`}
                style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: isCurrent ? 'default' : 'pointer',
                  border: isCurrent ? '2px solid #8e44ad' : '1px solid #ddd',
                  background: isCurrent ? '#f3e8ff' : '#fff',
                  color: passed ? '#333' : '#c0392b',
                  opacity: passed ? 1 : 0.6,
                }}
              >
                案{String.fromCharCode(65 + i)}{v.is_default && ' ★'}{!passed && ' ❌'}
              </button>
            );
          })}
          {currentIdx === -1 && (
            <span style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 12,
              border: '2px solid #8e44ad', background: '#f3e8ff', color: '#333',
            }}>
              カスタム
            </span>
          )}
        </div>
      )}

      {/* 本文編集 */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{
          width: '100%', minHeight: 120, padding: 10, borderRadius: 6,
          border: tooLong ? '1px solid #e74c3c' : '1px solid #ddd',
          fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical',
          background: '#fff',
        }}
      />

      {/* フッター */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 12, color: tooLong ? '#e74c3c' : '#999' }}>
          {content.length} / 500 字
          {dirty && <span style={{ marginLeft: 10, color: '#e67e22' }}>● 未保存</span>}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !dirty || tooLong || !content.trim()}
          style={{
            padding: '5px 16px', borderRadius: 6, border: 'none',
            background: (saving || !dirty || tooLong || !content.trim()) ? '#ccc' : '#8e44ad',
            color: '#fff', fontSize: 13, cursor: (saving || !dirty || tooLong) ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {status && (
        <p style={{ marginTop: 6, fontSize: 12, color: status.kind === 'ok' ? '#27ae60' : '#e74c3c' }}>
          {status.message}
        </p>
      )}
    </div>
  );
}
