import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

type ServerMode = null | 'shared' | 'custom';

export function SetupWizard({ onComplete }: Props): React.JSX.Element {
  const [serverMode, setServerMode] = useState<ServerMode>(null);
  const [serverReady, setServerReady] = useState(false);
  const [serverTesting, setServerTesting] = useState(false);
  const [serverError, setServerError] = useState('');

  const [customUrl, setCustomUrl] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [authStatus, setAuthStatus] = useState('');
  const [authDone, setAuthDone] = useState(false);

  // 共有サーバー選択
  const handleSelectShared = async () => {
    setServerMode('shared');
    setServerTesting(true);
    setServerError('');
    try {
      await (window as any).urads.configSetSharedServer();
      const result = await (window as any).urads.configTestConnection(
        await (window as any).urads.configGetApiBase()
      );
      if (result.ok) {
        setServerReady(true);
      } else {
        setServerError('共有サーバーに接続できません。ネットワークを確認してください。');
      }
    } catch {
      setServerError('共有サーバーに接続できません。');
    } finally {
      setServerTesting(false);
    }
  };

  // 共有サーバー接続失敗時に続行
  const handleForceShared = () => {
    setServerReady(true);
    setServerError('');
  };

  // カスタムサーバー接続テスト
  const handleTestCustom = async () => {
    const normalized = customUrl.replace(/\/+$/, '');
    try {
      new URL(normalized);
    } catch {
      setTestResult({ ok: false, error: '有効なURLを入力してください' });
      return;
    }
    setServerTesting(true);
    setTestResult(null);
    try {
      const result = await (window as any).urads.configTestConnection(normalized);
      setTestResult(result);
      if (result.ok) {
        await (window as any).urads.configSetApiBase(normalized);
        setServerReady(true);
      }
    } catch {
      setTestResult({ ok: false, error: '接続テストに失敗しました' });
    } finally {
      setServerTesting(false);
    }
  };

  const handleAuth = async () => {
    setAuthStatus('認証中...');
    try {
      const result = await (window as any).urads.threadsAuth();
      setAuthStatus(`@${result.profile.username} を連携しました`);
      setAuthDone(true);
    } catch (err: any) {
      setAuthStatus(`認証失敗: ${err.message || '不明なエラー'}`);
    }
  };

  const handleFinish = async () => {
    await (window as any).urads.configCompleteSetup();
    onComplete();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#1a1a2e',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 40,
        width: 480, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      }}>
        <h1 style={{ fontSize: 24, marginBottom: 8, color: '#1a1a2e' }}>Urads セットアップ</h1>

        {/* ステップ1: サーバー選択 */}
        {!serverReady ? (
          <>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>
              使用するサーバーを選択してください
            </div>

            {/* 共有サーバー / 自分のサーバー 二択 */}
            {serverMode === null && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <button onClick={handleSelectShared} style={{
                  flex: 1, padding: '16px 12px', borderRadius: 8,
                  border: '2px solid #1a1a2e', background: '#1a1a2e', color: '#fff',
                  cursor: 'pointer', fontSize: 14, lineHeight: 1.5,
                }}>
                  共有サーバー<br />
                  <span style={{ fontSize: 11, opacity: 0.7 }}>推奨 / 設定不要</span>
                </button>
                <button onClick={() => setServerMode('custom')} style={{
                  flex: 1, padding: '16px 12px', borderRadius: 8,
                  border: '2px solid #ddd', background: '#fff', color: '#333',
                  cursor: 'pointer', fontSize: 14, lineHeight: 1.5,
                }}>
                  自分のサーバー<br />
                  <span style={{ fontSize: 11, color: '#999' }}>Cloudflare Workers</span>
                </button>
              </div>
            )}

            {/* 共有サーバー: テスト中 or エラー */}
            {serverMode === 'shared' && (
              <div style={{ marginBottom: 16 }}>
                {serverTesting && (
                  <div style={{ padding: 12, borderRadius: 8, background: '#f8f9fa', color: '#666', fontSize: 13 }}>
                    接続テスト中...
                  </div>
                )}
                {serverError && (
                  <div style={{ padding: 12, borderRadius: 8, background: '#fff3f3', color: '#e74c3c', fontSize: 13, marginBottom: 8 }}>
                    {serverError}
                  </div>
                )}
                {serverError && !serverTesting && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSelectShared} style={{
                      padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                      background: '#fff', cursor: 'pointer', fontSize: 12,
                    }}>再試行</button>
                    <button onClick={handleForceShared} style={{
                      padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                      background: '#fff', cursor: 'pointer', fontSize: 12, color: '#999',
                    }}>続行する</button>
                    <button onClick={() => { setServerMode(null); setServerError(''); }} style={{
                      padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                      background: '#fff', cursor: 'pointer', fontSize: 12, color: '#999',
                    }}>戻る</button>
                  </div>
                )}
              </div>
            )}

            {/* カスタムサーバー入力 */}
            {serverMode === 'custom' && (
              <div style={{ marginBottom: 16, padding: 16, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e0e0e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, margin: 0, color: '#333' }}>自分のサーバー</h3>
                  <button onClick={() => { setServerMode(null); setTestResult(null); }}
                    style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd', background: 'transparent', color: '#999', fontSize: 11, cursor: 'pointer' }}>
                    戻る
                  </button>
                </div>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => { setCustomUrl(e.target.value); setTestResult(null); }}
                  placeholder="https://your-worker.your-subdomain.workers.dev"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
                />
                <button onClick={handleTestCustom} disabled={serverTesting || !customUrl}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: serverTesting ? 'default' : 'pointer', fontSize: 12, marginBottom: 8 }}>
                  {serverTesting ? 'テスト中...' : '接続テスト'}
                </button>
                {testResult && (
                  <div style={{
                    padding: '6px 10px', borderRadius: 6, fontSize: 12,
                    background: testResult.ok ? '#f0f8f0' : '#fff3f3',
                    color: testResult.ok ? '#27ae60' : '#e74c3c',
                  }}>
                    {testResult.ok ? '接続OK' : testResult.error}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* ステップ2: Threads認証 */}
            <div style={{ fontSize: 13, color: '#999', marginBottom: 24 }}>
              Threads アカウントを連携して始めましょう
            </div>

            <div style={{
              padding: '8px 12px', borderRadius: 6, background: '#f0f8f0',
              color: '#27ae60', fontSize: 12, marginBottom: 16,
            }}>
              サーバー接続OK
            </div>

            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Threads アカウント連携</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Threads アカウントを連携すると、投稿や分析が使えるようになります。
            </p>

            {!authDone ? (
              <button
                onClick={handleAuth}
                disabled={authStatus === '認証中...'}
                style={{
                  padding: '12px 24px', borderRadius: 8, border: 'none',
                  background: '#1a1a2e', color: '#fff', cursor: 'pointer',
                  fontSize: 14, width: '100%', marginBottom: 12,
                }}
              >
                {authStatus === '認証中...' ? '認証中...' : 'Threads アカウントを連携する'}
              </button>
            ) : (
              <div style={{
                padding: '12px 16px', borderRadius: 8, background: '#f0f8f0',
                color: '#27ae60', fontSize: 14, marginBottom: 12, textAlign: 'center',
              }}>
                {authStatus}
              </div>
            )}

            {authStatus && !authDone && authStatus !== '認証中...' && (
              <div style={{ color: '#e74c3c', fontSize: 13, marginBottom: 12 }}>
                {authStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button
                onClick={handleFinish}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #ddd',
                  background: '#fff', cursor: 'pointer', fontSize: 13, color: '#999',
                }}
              >
                あとで設定する
              </button>
              {authDone && (
                <button
                  onClick={handleFinish}
                  style={{
                    padding: '10px 24px', borderRadius: 8, border: 'none',
                    background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontSize: 14,
                  }}
                >
                  始める
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
