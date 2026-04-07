import React, { useState, useEffect } from 'react';
import { PostCompose } from './modules/post/pages/PostCompose';
import { Schedules } from './modules/post/pages/Schedules';
import { History } from './modules/post/pages/History';
import { Settings } from './modules/account/pages/Settings';
import { ReplyRules } from './modules/reply/pages/ReplyRules';
import { ReplyLogs } from './modules/reply/pages/ReplyLogs';
import { Research } from './modules/research/pages/Research';
import { ChatPanel } from './modules/chat/ChatPanel';
import { LogViewer } from './modules/chat/LogViewer';
import { Dashboard } from './modules/dashboard/pages/Dashboard';
import { BatchSchedule } from './modules/post/pages/BatchSchedule';
import { SetupWizard } from './modules/setup/SetupWizard';
import { getApiBase, initApiBase } from './config';

type Page = 'dashboard' | 'compose' | 'batch-schedule' | 'schedules' | 'history' | 'replies' | 'reply-logs' | 'research' | 'chat-logs' | 'settings';

const PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'ダッシュボード' },
  { id: 'compose', label: '新規投稿' },
  { id: 'batch-schedule', label: '一括予約' },
  { id: 'schedules', label: '予約一覧' },
  { id: 'history', label: '投稿履歴' },
  { id: 'replies', label: 'リプライルール' },
  { id: 'reply-logs', label: 'リプライ履歴' },
  { id: 'research', label: 'リサーチ' },
  { id: 'chat-logs', label: 'ツールログ' },
  { id: 'settings', label: '設定' },
];

const FUTURE_PAGES = ['画像エディタ'];

export function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [setupCompleted, setSetupCompleted] = useState(true);
  const [page, setPage] = useState<Page>('dashboard');
  const [preselectedPostId, setPreselectedPostId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(() => {
    try { return localStorage.getItem('urads-chat-default-open') === 'true'; } catch { return false; }
  });
  const [assistantName, setAssistantName] = useState('Navi');

  // 起動時に設定初期化
  useEffect(() => {
    (async () => {
      try {
        await initApiBase();
        const completed = await (window as any).urads.configIsSetupCompleted();
        setSetupCompleted(completed);
        if (completed) {
          // アシスタント名取得
          fetch(`${getApiBase()}/chat/settings`)
            .then((r) => r.json())
            .then((d) => setAssistantName(d.assistant_name || 'Navi'))
            .catch(() => {});
        }
      } catch {
        setSetupCompleted(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const navigateToRules = (threadsPostId?: string) => {
    if (threadsPostId) setPreselectedPostId(threadsPostId);
    setPage('replies');
  };

  const handleChatNavigate = (pageId: string) => {
    const validPages: Page[] = ['dashboard', 'compose', 'batch-schedule', 'schedules', 'history', 'replies', 'reply-logs', 'research', 'chat-logs', 'settings'];
    if (validPages.includes(pageId as Page)) {
      setPage(pageId as Page);
    }
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />;
      case 'compose': return <PostCompose />;
      case 'batch-schedule': return <BatchSchedule />;
      case 'schedules': return <Schedules />;
      case 'history': return <History onNavigateToRules={navigateToRules} />;
      case 'replies': return <ReplyRules preselectedPostId={preselectedPostId} onClearPreselect={() => setPreselectedPostId(null)} />;
      case 'reply-logs': return <ReplyLogs />;
      case 'research': return <Research />;
      case 'chat-logs': return <LogViewer />;
      case 'settings': return <Settings onAssistantNameChange={setAssistantName} />;
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#fff' }}>読み込み中...</div>;
  }

  if (!setupCompleted) {
    return <SetupWizard onComplete={() => {
      setSetupCompleted(true);
      initApiBase().then(() => {
        fetch(`${getApiBase()}/chat/settings`)
          .then((r) => r.json())
          .then((d) => setAssistantName(d.assistant_name || 'Navi'))
          .catch(() => {});
      });
    }} />;
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

        <div style={{ marginTop: 'auto' }}>
          <div
            onClick={() => setChatOpen(!chatOpen)}
            style={{
              padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
              background: chatOpen ? '#9b59b6' : 'transparent',
              fontSize: 14, transition: 'background 0.15s',
              marginBottom: 8,
            }}
          >
            {chatOpen ? 'チャットを閉じる' : 'AIアシスタント'}
          </div>

          <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 4 }}>
            Phase 4+
          </div>
          {FUTURE_PAGES.map((label) => (
            <div key={label} style={{
              padding: '8px 12px', borderRadius: 6, fontSize: 13, opacity: 0.25,
            }}>
              {label}
            </div>
          ))}
        </div>
      </nav>

      <main style={{ flex: 1, padding: 32, overflowY: 'auto', background: '#fff' }}>
        {renderPage()}
      </main>

      <ChatPanel isOpen={chatOpen} onNavigate={handleChatNavigate} assistantName={assistantName} />
    </div>
  );
}
