import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../config';

interface LogEntry {
  id: string;
  tool_name: string;
  tool_input: string;
  tool_result: string;
  confirmed: number;
  created_at: number;
}

export function LogViewer(): React.JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/chat/logs?limit=100`)
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .catch(() => setLogs([]));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>ツール実行ログ</h1>
      {logs.length === 0 ? (
        <p style={{ color: '#999' }}>実行ログはまだありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map((log) => {
            let input = '';
            let result = '';
            try { input = JSON.stringify(JSON.parse(log.tool_input), null, 2); } catch { input = log.tool_input; }
            try { result = JSON.stringify(JSON.parse(log.tool_result), null, 2); } catch { result = log.tool_result; }

            return (
              <div key={log.id} style={{ padding: 12, borderRadius: 8, border: '1px solid #eee', background: '#fafafa', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 12,
                      background: '#9b59b6', color: '#fff',
                    }}>
                      {log.tool_name}
                    </span>
                    {log.confirmed ? (
                      <span style={{ fontSize: 11, color: '#27ae60' }}>確認済み</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#999' }}>自動実行</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#999' }}>
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer', color: '#666' }}>入力</summary>
                  <pre style={{ fontSize: 11, background: '#f0f0f0', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 150, marginTop: 4 }}>{input}</pre>
                </details>
                <details style={{ marginTop: 4 }}>
                  <summary style={{ cursor: 'pointer', color: '#666' }}>結果</summary>
                  <pre style={{ fontSize: 11, background: '#f0f0f0', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 150, marginTop: 4 }}>{result}</pre>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
