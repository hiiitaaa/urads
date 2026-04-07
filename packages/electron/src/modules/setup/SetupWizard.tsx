import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: Props): React.JSX.Element {
  const [step, setStep] = useState<1 | 2>(1);
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [authStatus, setAuthStatus] = useState('');
  const [authDone, setAuthDone] = useState(false);

  const handleTest = async () => {
    const isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
    if (!url.startsWith('https://') && !isLocalhost) {
      setTestResult({ ok: false, error: 'URLは https:// で始まる必要があります（localhost は http 可）' });
      return;
    }
    // 末尾スラッシュ除去
    const normalizedUrl = url.replace(/\/+$/, '');
    setTesting(true);
    setTestResult(null);
    try {
      const result = await (window as any).urads.configTestConnection(normalizedUrl);
      setTestResult(result);
      if (result.ok) {
        await (window as any).urads.configSetApiBase(normalizedUrl);
        setUrl(normalizedUrl);
      }
    } catch {
      setTestResult({ ok: false, error: '接続テストに失敗しました' });
    } finally {
      setTesting(false);
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
        <div style={{ fontSize: 13, color: '#999', marginBottom: 24 }}>
          ステップ {step} / 2
        </div>

        {step === 1 && (
          <>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>サーバー接続</h2>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Cloudflare Workers の URL を入力してください。
              セットアップスクリプト実行時に表示された URL です。
            </p>

            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
              placeholder="https://urads-api.xxxxx.workers.dev"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 6,
                border: '1px solid #ddd', fontSize: 14, marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <button
              onClick={handleTest}
              disabled={testing || !url}
              style={{
                padding: '8px 20px', borderRadius: 6, border: '1px solid #ddd',
                background: testing ? '#f0f0f0' : '#fff', cursor: testing ? 'default' : 'pointer',
                fontSize: 13, marginBottom: 12,
              }}
            >
              {testing ? 'テスト中...' : '接続テスト'}
            </button>

            {testResult && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 16,
                background: testResult.ok ? '#f0f8f0' : '#fff3f3',
                color: testResult.ok ? '#27ae60' : '#e74c3c',
                border: `1px solid ${testResult.ok ? '#c3e6cb' : '#f5c6cb'}`,
              }}>
                {testResult.ok ? '接続OK' : testResult.error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => setStep(2)}
                disabled={!testResult?.ok}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: testResult?.ok ? '#1a1a2e' : '#ccc',
                  color: '#fff', cursor: testResult?.ok ? 'pointer' : 'default',
                  fontSize: 14,
                }}
              >
                次へ
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
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
