import React, { useState, useEffect } from 'react';

import { apiFetch } from '../../../config';

interface Log {
  id: string;
  rule_id: string;
  trigger_user_id: string;
  trigger_text: string;
  response_text: string;
  threads_reply_id: string | null;
  replied_at: number;
}

export function ReplyLogs(): React.JSX.Element {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    apiFetch('/replies/logs?limit=100')
      .then((r) => r.json())
      .then((data) => setLogs(data.logs || []))
      .catch(() => setLogs([]));
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>リプライ履歴</h1>
      {logs.length === 0 ? (
        <p style={{ color: '#999' }}>自動返信の履歴はまだありません。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map((log) => (
            <div key={log.id} style={{
              padding: 12, borderRadius: 8, border: '1px solid #eee', background: '#fafafa',
              fontSize: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 'bold' }}>@{log.trigger_user_id}</span>
                <span style={{ fontSize: 12, color: '#999' }}>
                  {new Date(log.replied_at).toLocaleString()}
                </span>
              </div>
              <p style={{ color: '#666' }}>受信: {log.trigger_text}</p>
              <p style={{ color: '#27ae60' }}>→ 返信: {log.response_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
