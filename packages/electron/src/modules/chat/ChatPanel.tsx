import React, { useState, useRef, useEffect } from 'react';

declare global {
  interface Window {
    urads: {
      chatSendMessage: (payload: { message?: string; skill?: string }) => Promise<{ text: string; error?: string }>;
      chatListSkills: () => Promise<Array<{ name: string; description: string; trigger: string }>>;
      chatGetHistory: () => Promise<Array<{ role: string; text: string; timestamp: number }>>;
      chatGetSessionInfo: () => Promise<{ sessionId: string | null; isActive: boolean; lastActivity: number }>;
      chatClearHistory: () => Promise<{ cleared: boolean }>;
      [key: string]: unknown;
    };
  }
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface SkillInfo {
  name: string;
  description: string;
  trigger: string;
}

interface Props {
  isOpen: boolean;
  onNavigate?: (pageId: string) => void;
  assistantName?: string;
}

export function ChatPanel({ isOpen, onNavigate, assistantName: propName }: Props): React.JSX.Element | null {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const assistantName = propName || 'Navi';
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // スキル一覧読み込み
    window.urads.chatListSkills()
      .then((s) => setSkills(s || []))
      .catch(() => {});

    // 過去の会話履歴を復元
    window.urads.chatGetHistory()
      .then((msgs) => {
        if (msgs && msgs.length > 0) {
          setMessages(msgs.map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userText = input.trim();
    setInput('');

    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const result = await window.urads.chatSendMessage({ message: userText });
      setMessages((prev) => [...prev, { role: 'assistant', text: result.text }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `エラー: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkill = async (skillName: string, trigger: string) => {
    if (isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text: trigger }]);
    setIsLoading(true);

    try {
      const result = await window.urads.chatSendMessage({ skill: skillName });
      setMessages((prev) => [...prev, { role: 'assistant', text: result.text }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `エラー: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    await window.urads.chatClearHistory();
    setMessages([]);
  };

  // テキスト内のページ参照を検出してボタン化
  const renderText = (text: string) => {
    const pageMap: Record<string, string> = {
      '投稿履歴': 'history', '予約一覧': 'schedules', '新規投稿': 'compose',
      'リプライルール': 'replies', 'リサーチ': 'research', '設定': 'settings',
    };

    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    for (const [label, pageId] of Object.entries(pageMap)) {
      const idx = remaining.indexOf(label);
      if (idx !== -1 && onNavigate) {
        parts.push(remaining.slice(0, idx));
        parts.push(
          <button key={key++} onClick={() => onNavigate(pageId)}
            style={{ color: '#3498db', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, font: 'inherit' }}>
            {label}
          </button>
        );
        remaining = remaining.slice(idx + label.length);
      }
    }
    parts.push(remaining);
    return <>{parts}</>;
  };

  return (
    <div style={{
      width: 350, borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column',
      background: '#fafafa', flexShrink: 0,
    }}>
      {/* ヘッダー */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', background: '#1a1a2e', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 'bold' }}>{assistantName}</span>
          <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>AIアシスタント</span>
        </div>
        <button onClick={handleClear}
          style={{ fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
          クリア
        </button>
      </div>

      {/* スキルタブバー */}
      {skills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 12px', borderBottom: '1px solid #eee', background: '#f0f0f0' }}>
          {skills.map((skill) => (
            <button key={skill.name} onClick={() => handleSkill(skill.name, skill.trigger)}
              disabled={isLoading}
              title={skill.description}
              style={{
                padding: '4px 10px', borderRadius: 12, border: '1px solid #9b59b6',
                background: 'transparent', color: '#9b59b6', fontSize: 12,
                cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.5 : 1,
              }}>
              {skill.trigger}
            </button>
          ))}
        </div>
      )}

      {/* メッセージ一覧 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 30, color: '#999' }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>{assistantName}に何でも聞いてください</p>
            <p style={{ fontSize: 12 }}>上のボタンでスキルを実行できます</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
            {msg.role === 'user' ? (
              <div style={{ background: '#1a1a2e', color: '#fff', padding: '8px 12px', borderRadius: '12px 12px 4px 12px', fontSize: 13 }}>
                {msg.text}
              </div>
            ) : (
              <div style={{ background: '#fff', padding: '10px 12px', borderRadius: '12px 12px 12px 4px', fontSize: 13, border: '1px solid #eee', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {renderText(msg.text)}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div style={{ alignSelf: 'flex-start', fontSize: 13, color: '#999', padding: '8px 12px' }}>
            {assistantName}が実行中...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力 */}
      <div style={{ padding: 12, borderTop: '1px solid #eee' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`${assistantName}に聞く...`}
            disabled={isLoading}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13 }}
          />
          {isLoading ? (
            <button onClick={async () => {
              await window.urads.chatCancelMessage();
              setIsLoading(false);
              setMessages((prev) => [...prev, { role: 'assistant', text: '[取り消しました]' }]);
            }}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#e74c3c', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
              取消
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
              送信
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
