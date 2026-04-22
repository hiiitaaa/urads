import React, { useState, useEffect } from 'react';

import { apiFetch, API_BASE } from '../../../config';

interface SavedAccount {
  id: string;
  threads_user_id: string;
  threads_handle: string;
  display_name: string | null;
  token_expires_at: number | null;
  created_at: number;
}

export function Settings(): React.JSX.Element {
  const [health, setHealth] = useState<string>('確認中...');
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    apiFetch('/health')
      .then((r) => r.json())
      .then((data) => setHealth(`接続OK (${new Date(data.timestamp).toLocaleTimeString()})`))
      .catch(() => setHealth('未接続'));

    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await apiFetch('/accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {
      console.warn('アカウント読み込み失敗');
    }
  };

  const handleDelete = async (id: string, handle: string) => {
    if (!confirm(`@${handle} を削除しますか？`)) return;
    try {
      await apiFetch(`/accounts/${id}`, { method: 'DELETE' });
      await loadAccounts();
    } catch (err) {
      alert(`削除失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const daysUntilExpiry = (expiresAt: number | null) => {
    if (!expiresAt) return null;
    const days = Math.floor((expiresAt - Date.now()) / 86400000);
    return days;
  };

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>設定</h1>

      {/* サーバー接続 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>サーバー接続</h2>
        <div style={{ padding: 16, borderRadius: 8, background: '#f8f9fa' }}>
          <p>Workers API: <strong>{health}</strong></p>
          <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>接続先: {API_BASE || '未設定'}</p>
        </div>
      </section>

      {/* アカウント管理 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>アカウント管理</h2>

        {accounts.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((acc) => {
              const days = daysUntilExpiry(acc.token_expires_at);
              return (
                <div key={acc.id} style={{
                  padding: 12, borderRadius: 8, background: '#f0f8f0',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{
                    width: 36, height: 36, borderRadius: '50%', background: '#27ae60',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 'bold', fontSize: 16, flexShrink: 0,
                  }}>
                    {acc.threads_handle[0].toUpperCase()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 'bold' }}>@{acc.threads_handle}</p>
                    <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#666' }}>
                      {acc.display_name && <span>{acc.display_name}</span>}
                      {days !== null && (
                        <span style={{ color: days < 7 ? '#e74c3c' : '#999' }}>
                          トークン残り{days}日
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(acc.id, acc.threads_handle)}
                    style={{
                      padding: '4px 12px', borderRadius: 4, border: '1px solid #e74c3c',
                      background: 'transparent', color: '#e74c3c', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: 12, borderRadius: 8, background: '#f0f0f0', color: '#888', fontSize: 13 }}>
          アカウント連携（OAuth）はPC版から行ってください。Web版での連携は今後対応予定です。
        </div>
      </section>

      <AssistantSettings />
    </div>
  );
}

function AssistantSettings(): React.JSX.Element {
  const [name, setName] = useState('Navi');
  const [customName, setCustomName] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/chat/settings')
      .then((r) => r.json())
      .then((d) => {
        const n = d.assistant_name || 'Navi';
        setName(n);
        if (!['Navi', 'Radi', 'Aido', 'Uno'].includes(n)) setCustomName(n);
        setCustomInstructions(d.custom_instructions || '');
      })
      .catch(() => {});
  }, []);

  const handleSave = async (newName: string) => {
    if (!newName.trim()) return;
    await apiFetch('/chat/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_name: newName.trim(), custom_instructions: customInstructions }),
    });
    setName(newName.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveInstructions = async () => {
    await apiFetch('/chat/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_instructions: customInstructions }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const presets = ['Navi', 'Radi', 'Aido', 'Uno'];

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>AIアシスタント</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {presets.map((p) => (
          <button key={p} onClick={() => handleSave(p)}
            style={{
              padding: '6px 16px', borderRadius: 6, fontSize: 14, cursor: 'pointer',
              border: name === p ? '2px solid #9b59b6' : '1px solid #ddd',
              background: name === p ? '#f3e8ff' : '#fff', color: '#333',
            }}>
            {p}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={customName} onChange={(e) => setCustomName(e.target.value)}
          placeholder="カスタム名を入力..." maxLength={20}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, width: 200 }} />
        <button onClick={() => handleSave(customName)} disabled={!customName.trim()}
          style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
          設定
        </button>
      </div>
      <p style={{ fontSize: 13, color: '#999', marginTop: 8 }}>
        現在の名前: <strong>{name}</strong>
        {saved && <span style={{ color: '#27ae60', marginLeft: 8 }}>保存しました</span>}
      </p>

      {/* カスタム指示 */}
      <div style={{ marginTop: 20 }}>
        <label style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500 }}>カスタム指示</label>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder={"AIアシスタントへの追加指示を入力...\n例: 占いアカウントとして運用しています\n例: 敬語は使わないでください"}
          maxLength={5000}
          style={{ width: '100%', minHeight: 100, padding: 10, borderRadius: 6, border: '1px solid #ddd', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 12, color: customInstructions.length > 4500 ? '#e74c3c' : '#999' }}>
            {customInstructions.length} / 5000
          </span>
          <button onClick={handleSaveInstructions}
            style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
            保存
          </button>
        </div>
      </div>
    </section>
  );
}
