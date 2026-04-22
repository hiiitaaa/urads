import React, { useState, useEffect } from 'react';
import { PostCompose } from './modules/post/pages/PostCompose';
import { Schedules } from './modules/post/pages/Schedules';
import { History } from './modules/post/pages/History';
import { Settings } from './modules/account/pages/Settings';
import { ReplyRules } from './modules/reply/pages/ReplyRules';
import { ReplyLogs } from './modules/reply/pages/ReplyLogs';
import { Research } from './modules/research/pages/Research';
import { Dashboard } from './modules/dashboard/pages/Dashboard';
import { apiFetch, API_BASE } from './config';

type Page = 'dashboard' | 'compose' | 'schedules' | 'history' | 'replies' | 'reply-logs' | 'research' | 'settings';

const PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'compose', label: '新規投稿' },
  { id: 'schedules', label: '予約一覧' },
  { id: 'history', label: '投稿履歴' },
  { id: 'replies', label: 'リプライルール' },
  { id: 'reply-logs', label: 'リプライ履歴' },
  { id: 'research', label: 'リサーチ' },
  { id: 'settings', label: '設定' },
];

export function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('dashboard');
  const [preselectedPostId, setPreselectedPostId] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!API_BASE) {
      setConnected(false);
      return;
    }
    apiFetch('/health')
      .then((r) => r.json())
      .then(() => setConnected(true))
      .catch(() => setConnected(false));
  }, []);

  const navigateToRules = (threadsPostId?: string) => {
    if (threadsPostId) setPreselectedPostId(threadsPostId);
    setPage('replies');
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'compose': return <PostCompose />;
      case 'schedules': return <Schedules />;
      case 'history': return <History onNavigateToRules={navigateToRules} />;
      case 'replies': return <ReplyRules preselectedPostId={preselectedPostId} onClearPreselect={() => setPreselectedPostId(null)} />;
      case 'reply-logs': return <ReplyLogs />;
      case 'research': return <Research />;
      case 'settings': return <Settings />;
    }
  };

  if (connected === null) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#fff' }}>接続確認中...</div>;
  }

  if (!API_BASE || connected === false) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#fff', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 24 }}>Urads Web</h1>
        <p style={{ color: '#999' }}>Workers APIに接続できません</p>
        <p style={{ color: '#666', fontSize: 13 }}>VITE_API_BASE 環境変数を確認してください</p>
        {API_BASE && <p style={{ color: '#666', fontSize: 12 }}>現在の設定: {API_BASE}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <nav style={{
        width: 220, background: '#1a1a2e', color: '#fff',
        padding: 20, display: 'flex', flexDirection: 'column', gap: 4,
        flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 20, marginBottom: 16, letterSpacing: 1 }}>Urads</h2>

        {PAGES.map((p) => (
          <div
            key={p.id}
            onClick={() => { setPage(p.id); setPreselectedPostId(null); }}
            style={{
              padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
              background: page === p.id ? '#16213e' : 'transparent',
              fontSize: 14, transition: 'background 0.15s',
            }}
          >
            {p.label}
          </div>
        ))}

        <div style={{ marginTop: 'auto', fontSize: 11, opacity: 0.3 }}>
          Web版 — PC専用機能は非表示
        </div>
      </nav>

      <main style={{ flex: 1, padding: 32, overflowY: 'auto', background: '#fff' }}>
        {renderPage()}
      </main>
    </div>
  );
}
