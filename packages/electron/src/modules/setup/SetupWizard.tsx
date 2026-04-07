import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: Props): React.JSX.Element {
  const [authStatus, setAuthStatus] = useState('');
  const [authDone, setAuthDone] = useState(false);
  const [showCustomServer, setShowCustomServer] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

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

  const handleTestCustomServer = async () => {
    const normalized = customUrl.replace(/\/+$/, '');
    if (!normalized.startsWith('https://') && !normalized.startsWith('http://localhost')) {
      setTestResult({ ok: false, error: 'URLは https:// で始まる必要があります（localhost は http 可）' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await (window as any).urads.configTestConnection(normalized);
      setTestResult(result);
      if (result.ok) {
        await (window as any).urads.configSetApiBase(normalized);
        setCustomUrl(normalized);
      }
    } catch {
      setTestResult({ ok: false, error: '接続テストに失敗しました' });
    } finally {
      setTesting(false);
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
          Threads アカウントを連携して始めましょう
        </div>

        {/* 自分のサーバーを使う（折りたたみ） */}
        {showCustomServer ? (
          <div style={{ marginBottom: 20, padding: 16, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e0e0e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, margin: 0, color: '#333' }}>自分のサーバーを使う</h3>
              <button onClick={() => { setShowCustomServer(false); setTestResult(null); }}
                style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd', background: 'transparent', color: '#999', fontSize: 11, cursor: 'pointer' }}>
                閉じる
              </button>
            </div>
            <input
              type="url"
              value={customUrl}
              onChange={(e) => { setCustomUrl(e.target.value); setTestResult(null); }}
              placeholder="https://urads-api.xxxxx.workers.dev"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <button onClick={handleTestCustomServer} disabled={testing || !customUrl}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: testing ? 'default' : 'pointer', fontSize: 12, marginBottom: 8 }}>
              {testing ? 'テスト中...' : '接続テスト'}
            </button>
            {testResult && (
              <div style={{
                padding: '6px 10px', borderRadius: 6, fontSize: 12,
                background: testResult.ok ? '#f0f8f0' : '#fff3f3',
                color: testResult.ok ? '#27ae60' : '#e74c3c',
              }}>
                {testResult.ok ? '接続OK — 自分のサーバーを使用します' : testResult.error}
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => setShowCustomServer(true)}
            style={{ display: 'block', marginBottom: 16, padding: 0, border: 'none', background: 'transparent', color: '#999', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
            自分のサーバーを使う（詳細設定）
          </button>
        )}

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
      </div>
    </div>
  );
}
