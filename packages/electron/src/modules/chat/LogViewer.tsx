import React, { useState, useEffect, useRef, useCallback } from 'react';

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  detail?: string;
}

const CATEGORIES = ['all', 'api', 'scraper', 'ipc', 'auth', 'app', 'chat', 'config', 'ui', 'error'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All', api: 'API', scraper: 'Scraper', ipc: 'IPC', auth: 'Auth',
  app: 'App', chat: 'Chat', config: 'Config', ui: 'UI', error: 'Error',
};

const LEVEL_COLORS: Record<string, { bg: string; color: string }> = {
  error: { bg: '#fde8e8', color: '#c0392b' },
  warn: { bg: '#fff8e1', color: '#e67e22' },
  info: { bg: 'transparent', color: '#333' },
  debug: { bg: 'transparent', color: '#999' },
};

const CATEGORY_COLORS: Record<string, string> = {
  api: '#3498db', scraper: '#27ae60', ipc: '#8e44ad', auth: '#e74c3c',
  app: '#2c3e50', chat: '#9b59b6', config: '#f39c12', ui: '#1abc9c', error: '#c0392b',
};

export function LogViewer(): React.JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 初回読み込み
  useEffect(() => {
    if (window.urads?.getLogs) {
      window.urads.getLogs({ limit: 1000 }).then((entries: LogEntry[]) => {
        setLogs(entries || []);
      }).catch(() => {});
    }
  }, []);

  // リアルタイム購読
  useEffect(() => {
    if (!window.urads?.onLogEntry) return;
    const unsubscribe = window.urads.onLogEntry((entry: LogEntry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 1500) return next.slice(-1000);
        return next;
      });
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  // 自動スクロール
  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // スクロール位置検知
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollTop + clientHeight >= scrollHeight - 50);
  }, []);

  // ログファイルを開く
  const openLogFile = async () => {
    if (window.urads?.getLogFilePath) {
      const path = await window.urads.getLogFilePath();
      if (path) {
        // コピーしやすいようにプロンプト表示
        prompt('ログファイルパス:', path);
      }
    }
  };

  // フィルタリング
  const filtered = logs.filter((log) => {
    if (filter !== 'all' && log.category !== filter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>アクティビティログ</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#999' }}>{filtered.length}件</span>
          <button onClick={openLogFile}
            style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
            ファイルを開く
          </button>
        </div>
      </div>

      {/* カテゴリフィルタ */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setFilter(cat)}
            style={{
              padding: '4px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
              border: filter === cat ? '2px solid #1a1a2e' : '1px solid #ddd',
              background: filter === cat ? '#1a1a2e' : '#fff',
              color: filter === cat ? '#fff' : '#666',
            }}>
            {CATEGORY_LABELS[cat] || cat}
          </button>
        ))}
      </div>

      {/* 検索 */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="検索..."
        style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 8 }}
      />

      {/* ログ一覧 */}
      <div ref={containerRef} onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', background: '#fafafa', borderRadius: 8, border: '1px solid #eee', fontFamily: 'monospace', fontSize: 12 }}>

        {filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>ログはまだありません</div>
        ) : (
          filtered.map((entry) => {
            const levelStyle = LEVEL_COLORS[entry.level] || LEVEL_COLORS.info;
            const catColor = CATEGORY_COLORS[entry.category] || '#666';
            const time = new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
            const isExpanded = expandedId === entry.id;

            return (
              <div key={entry.id}
                onClick={() => entry.detail && setExpandedId(isExpanded ? null : entry.id)}
                style={{
                  padding: '4px 8px', borderBottom: '1px solid #f0f0f0',
                  background: levelStyle.bg, color: levelStyle.color,
                  cursor: entry.detail ? 'pointer' : 'default',
                }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ color: '#999', flexShrink: 0 }}>{time}</span>
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 3,
                    background: entry.level === 'error' ? '#c0392b' : entry.level === 'warn' ? '#e67e22' : '#eee',
                    color: entry.level === 'error' || entry.level === 'warn' ? '#fff' : '#666',
                    flexShrink: 0,
                  }}>
                    {entry.level.toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '1px 5px', borderRadius: 3,
                    background: catColor, color: '#fff', flexShrink: 0,
                  }}>
                    {(entry.category || '').toUpperCase().slice(0, 4)}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.message}
                  </span>
                  {entry.detail && <span style={{ color: '#ccc', flexShrink: 0 }}>{isExpanded ? '-' : '+'}</span>}
                </div>
                {isExpanded && entry.detail && (
                  <pre style={{
                    fontSize: 11, background: '#f0f0f0', padding: 6, borderRadius: 4,
                    overflow: 'auto', maxHeight: 150, marginTop: 4, whiteSpace: 'pre-wrap',
                  }}>
                    {(() => {
                      try { return JSON.stringify(JSON.parse(entry.detail!), null, 2); } catch { return entry.detail; }
                    })()}
                  </pre>
                )}
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      {/* 自動スクロール表示 */}
      {!autoScroll && filtered.length > 0 && (
        <button onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
          style={{
            position: 'absolute', bottom: 20, right: 40, padding: '6px 16px',
            borderRadius: 20, border: 'none', background: '#1a1a2e', color: '#fff',
            fontSize: 12, cursor: 'pointer', opacity: 0.9,
          }}>
          最新へスクロール
        </button>
      )}
    </div>
  );
}
