import React, { useState, useEffect } from 'react';

import { API_BASE } from '../../../config';
import { AIGenerateModal } from '../../ai/components/AIGenerateModal';

interface Account {
  id: string;
  threads_handle: string;
  display_name: string | null;
}

export function PostCompose(): React.JSX.Element {
  const [content, setContent] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [status, setStatus] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<Array<{ path: string; name: string; url?: string; key?: string; type?: string; uploading?: boolean }>>([]);
  const maxLength = 500;

  useEffect(() => {
    fetch(`${API_BASE}/accounts`)
      .then((r) => r.json())
      .then((data) => {
        const accs = data.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) setSelectedAccount(accs[0].id);
      })
      .catch(() => {});

    // デフォルト: 明日の同時刻
    const tomorrow = new Date(Date.now() + 86400000);
    setScheduledDate(tomorrow.toISOString().split('T')[0]);
    setScheduledTime('21:00');
  }, []);

  const handlePost = async () => {
    if (!content.trim() || !selectedAccount) return;
    setIsPosting(true);
    setStatus(isScheduled ? '予約登録中...' : '投稿中...');

    try {
      const body: Record<string, unknown> = {
        account_id: selectedAccount,
        content,
      };

      // メディアがある場合
      if (mediaFiles.length > 0) {
        const uploadedUrls = mediaFiles.filter((f) => f.url).map((f) => f.url!);
        if (uploadedUrls.length === 1) {
          const f = mediaFiles[0];
          body.media_type = f.type === 'video' ? 'video' : 'image';
          body.media_urls = uploadedUrls;
        } else if (uploadedUrls.length >= 2) {
          body.media_type = 'carousel';
          body.media_urls = uploadedUrls;
        }
      }

      if (isScheduled) {
        const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
        if (dt.getTime() <= Date.now()) {
          setStatus('予約日時は未来の日時を指定してください');
          setIsPosting(false);
          return;
        }
        body.scheduled_at = dt.getTime();
      }

      const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.status === 'posted') {
        setStatus(`投稿完了！ (Threads ID: ${data.threads_id})`);
        setContent('');
        // 即時投稿完了 → R2から削除
        for (const f of mediaFiles) {
          if (f.key) (window.urads as Record<string, Function>).mediaDelete(f.key).catch(() => {});
        }
        setMediaFiles([]);
      } else if (data.status === 'scheduled') {
        const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
        setStatus(`予約完了！ ${dt.toLocaleString()} に投稿されます`);
        setContent('');
        setMediaFiles([]); // 予約投稿のR2ファイルはCron投稿後に削除
      } else {
        setStatus(`失敗: ${data.error || '不明なエラー'}`);
      }
    } catch {
      setStatus('失敗 — Workers未起動？');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>新規投稿</h1>

      {accounts.length === 0 ? (
        <div style={{ padding: 20, background: '#fff3cd', borderRadius: 8 }}>
          <p>アカウントが連携されていません。設定画面からThreadsアカウントを連携してください。</p>
        </div>
      ) : (
        <>
          {/* アカウント選択 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 14, color: '#666', marginBottom: 4, display: 'block' }}>投稿アカウント</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, minWidth: 200 }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.threads_handle}{acc.display_name ? ` (${acc.display_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* AI生成 + メディア添付ボタン */}
          <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
            <button onClick={() => setShowAI(true)}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #9b59b6', background: 'transparent', color: '#9b59b6', fontSize: 13, cursor: 'pointer' }}>
              AI生成
            </button>
            <button onClick={async () => {
              const result = await (window.urads as Record<string, Function>).mediaPickFiles() as { files: string[] };
              if (result.files.length === 0) return;

              for (const filePath of result.files) {
                const name = filePath.split(/[/\\]/).pop() || 'file';
                const ext = name.split('.').pop()?.toLowerCase() || '';
                const type = ['mp4', 'mov', 'webm'].includes(ext) ? 'video' : 'image';

                setMediaFiles((prev) => [...prev, { path: filePath, name, type, uploading: true }]);

                // アップロード
                const uploadResult = await (window.urads as Record<string, Function>).mediaUpload(filePath) as {
                  ok: boolean; url?: string; key?: string; error?: string; type?: string;
                };

                if (uploadResult.ok) {
                  setMediaFiles((prev) => prev.map((f) =>
                    f.path === filePath ? { ...f, url: uploadResult.url, key: uploadResult.key, type: uploadResult.type || type, uploading: false } : f
                  ));
                } else {
                  setStatus(`アップロード失敗: ${uploadResult.error}`);
                  setMediaFiles((prev) => prev.filter((f) => f.path !== filePath));
                }
              }
            }}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #3498db', background: 'transparent', color: '#3498db', fontSize: 13, cursor: 'pointer' }}>
              画像/動画を追加
            </button>
          </div>

          {/* テキスト入力（ドラッグ&ドロップ対応） */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={async (e) => {
              e.preventDefault(); e.stopPropagation();
              const files = Array.from(e.dataTransfer.files);
              if (files.length === 0) return;

              for (const file of files) {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                if (!['jpg','jpeg','png','gif','webp','mp4','mov','webm'].includes(ext)) {
                  setStatus(`非対応のファイル形式: ${file.name}`);
                  continue;
                }
                const type = ['mp4','mov','webm'].includes(ext) ? 'video' : 'image';
                // Electronのドラッグファイルはpathプロパティを持つ
                // Electron 32+: webUtils.getPathForFile()でパス取得
                const filePath = (window.urads as Record<string, Function>).getFilePath(file) as string;
                if (!filePath) {
                  setStatus('ファイルパスが取得できません。「画像/動画を追加」ボタンを使ってください。');
                  continue;
                }

                setMediaFiles((prev) => [...prev, { path: filePath, name: file.name, type, uploading: true }]);
                const result = await (window.urads as Record<string, Function>).mediaUpload(filePath) as {
                  ok: boolean; url?: string; key?: string; error?: string; type?: string;
                };
                if (result.ok) {
                  setMediaFiles((prev) => prev.map((f) =>
                    f.path === filePath ? { ...f, url: result.url, key: result.key, type: result.type || type, uploading: false } : f
                  ));
                  setStatus(null);
                } else {
                  setStatus(`アップロード失敗: ${result.error}`);
                  setMediaFiles((prev) => prev.filter((f) => f.path !== filePath));
                }
              }
            }}
            style={{ position: 'relative' }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Threadsに投稿する内容を入力..."
              maxLength={maxLength}
              style={{
                width: '100%', minHeight: 140, padding: 12, fontSize: 15,
                borderRadius: 8, border: '1px solid #ddd', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.6,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 12, color: '#bbb' }}>
              ↑ この入力欄に画像/動画をドラッグ&ドロップでも追加できます
            </span>
            <span style={{ fontSize: 13, color: content.length > maxLength * 0.9 ? '#e74c3c' : '#999' }}>
              {content.length} / {maxLength}
            </span>
            {mediaFiles.length >= 2 && (
              <span style={{ fontSize: 12, color: '#3498db' }}>カルーセル: {mediaFiles.length}/20枚</span>
            )}
          </div>

          {/* 投稿プレビュー（Threads風） */}
          {(content.trim() || mediaFiles.length > 0) && (
            <div style={{
              marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #e0e0e0',
              background: '#fff', maxWidth: 500,
            }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>プレビュー</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#1a1a2e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 'bold', fontSize: 14, flexShrink: 0,
                }}>
                  {accounts.find((a) => a.id === selectedAccount)?.threads_handle?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <p style={{ fontWeight: 'bold', fontSize: 14, margin: 0 }}>
                    @{accounts.find((a) => a.id === selectedAccount)?.threads_handle || 'username'}
                  </p>
                  <p style={{ fontSize: 14, lineHeight: 1.5, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                    {content || '(テキスト未入力)'}
                  </p>
                </div>
              </div>

              {/* メディアサムネイル */}
              {mediaFiles.length > 0 && (
                <div style={{
                  display: 'flex', gap: 4, overflow: 'auto', marginTop: 8,
                  borderRadius: 8, border: '1px solid #eee',
                }}>
                  {mediaFiles.map((f, i) => (
                    <div key={i} style={{
                      position: 'relative', minWidth: mediaFiles.length === 1 ? '100%' : 140,
                      height: mediaFiles.length === 1 ? 200 : 140,
                      background: '#f0f0f0', borderRadius: 8, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {f.type === 'video' ? (
                        <div style={{ textAlign: 'center', color: '#666' }}>
                          <div style={{ fontSize: 32 }}>🎬</div>
                          <div style={{ fontSize: 11 }}>{f.name}</div>
                        </div>
                      ) : f.url ? (
                        <img
                          src={f.url}
                          alt={f.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#999' }}>
                          <div style={{ fontSize: 24 }}>🖼</div>
                          <div style={{ fontSize: 11 }}>{f.name}</div>
                        </div>
                      )}
                      {f.uploading && (
                        <div style={{
                          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 13,
                        }}>
                          アップロード中...
                        </div>
                      )}
                      <button onClick={() => {
                        if (f.key) (window.urads as Record<string, Function>).mediaDelete(f.key).catch(() => {});
                        setMediaFiles((prev) => prev.filter((_, j) => j !== i));
                      }}
                        style={{
                          position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%',
                          border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 投稿モード切り替え */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" checked={!isScheduled} onChange={() => setIsScheduled(false)} />
              <span style={{ fontSize: 14 }}>今すぐ投稿</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" checked={isScheduled} onChange={() => setIsScheduled(true)} />
              <span style={{ fontSize: 14 }}>予約投稿</span>
            </label>
          </div>

          {/* 予約日時ピッカー */}
          {isScheduled && (
            <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
              />
            </div>
          )}

          {/* 投稿ボタン */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={handlePost}
              disabled={!content.trim() || isPosting}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: content.trim() && !isPosting ? '#1a1a2e' : '#ccc',
                color: '#fff', fontSize: 14,
              }}
            >
              {isPosting ? '処理中...' : isScheduled ? '予約する' : '今すぐ投稿'}
            </button>
          </div>
        </>
      )}

      {status && (
        <p style={{
          marginTop: 12, fontSize: 14,
          color: status.includes('失敗') || status.includes('未来') ? '#e74c3c' : '#27ae60',
        }}>
          {status}
        </p>
      )}

      {/* AI生成モーダル */}
      {showAI && (
        <AIGenerateModal
          onInsert={(text) => setContent(text)}
          onClose={() => setShowAI(false)}
        />
      )}
    </div>
  );
}
