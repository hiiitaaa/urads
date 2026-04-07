import React, { useState } from 'react';

interface Props {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: Props): React.JSX.Element {
  const [authStatus, setAuthStatus] = useState('');
  const [authDone, setAuthDone] = useState(false);

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
          Threads アカウントを連携して始めましょう
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
      </div>
    </div>
  );
}
