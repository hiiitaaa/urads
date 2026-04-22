import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: Props): React.JSX.Element {
  const [serverUrl, setServerUrl] = useState('');
  const [serverReady, setServerReady] = useState(false);
  const [serverTesting, setServerTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const [authStatus, setAuthStatus] = useState('');
  const [authDone, setAuthDone] = useState(false);

  const handleTestConnection = async () => {
    const normalized = serverUrl.replace(/\/+$/, '');
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

        {/* ステップ1: サーバーURL入力 */}
        {!serverReady ? (
          <>
            <div style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>
              Cloudflare Worker の URL を入力してください
            </div>

            <div style={{ marginBottom: 16 }}>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => { setServerUrl(e.target.value); setTestResult(null); }}
                placeholder="https://your-worker.your-subdomain.workers.dev"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
              />
              <button
                onClick={handleTestConnection}
                disabled={serverTesting || !serverUrl}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none',
                  background: serverTesting || !serverUrl ? '#ccc' : '#1a1a2e',
                  color: '#fff', cursor: serverTesting ? 'default' : 'pointer', fontSize: 13,
                }}
              >
                {serverTesting ? 'テスト中...' : '接続テスト'}
              </button>
              {testResult && (
                <div style={{
                  marginTop: 8, padding: '6px 10px', borderRadius: 6, fontSize: 12,
                  background: testResult.ok ? '#f0f8f0' : '#fff3f3',
                  color: testResult.ok ? '#27ae60' : '#e74c3c',
                }}>
                  {testResult.ok ? '接続OK' : testResult.error}
                </div>
              )}
            </div>

            <p style={{ fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>
              まだサーバーがない場合は、セットアップガイドを参照してください。
            </p>
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
