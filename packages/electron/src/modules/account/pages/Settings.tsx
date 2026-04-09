import React, { useState, useEffect } from 'react';

import { API_BASE } from '../../../config';

declare global {
  interface Window {
    urads: {
      platform: string;
      version: string;
      threadsAuth: () => Promise<{
        accountId: string;
        expiresIn: number;
        profile: { id: string; username: string; name?: string };
      }>;
      getAccounts: () => Promise<SavedAccount[]>;
      deleteAccount: (id: string) => Promise<{ deleted: boolean }>;
    };
  }
}

interface SavedAccount {
  id: string;
  threads_user_id: string;
  threads_handle: string;
  display_name: string | null;
  token_expires_at: number | null;
  created_at: number;
}

interface SettingsProps {
  onAssistantNameChange?: (name: string) => void;
}

export function Settings({ onAssistantNameChange }: SettingsProps): React.JSX.Element {
  const [health, setHealth] = useState<string>('確認中...');
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // 起動時にサーバー接続確認 + 保存済みアカウント読み込み
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((r) => r.json())
      .then((data) => setHealth(`接続OK (${new Date(data.timestamp).toLocaleTimeString()})`))
      .catch(() => setHealth('未接続'));

    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      if (window.urads?.getAccounts) {
        const accs = await window.urads.getAccounts();
        setAccounts(accs || []);
      }
    } catch (err) {
      console.warn('アカウント読み込み失敗:', err);
    }
  };

  const handleAuth = async () => {
    setIsAuthenticating(true);
    setAuthStatus('Threads認証画面を開いています...');
    try {
      const result = await window.urads.threadsAuth();
      setAuthStatus(`@${result.profile.username} を連携しました！（トークン有効期限: ${Math.floor(result.expiresIn / 86400)}日）`);
      await loadAccounts(); // D1から再読み込み
    } catch (err) {
      setAuthStatus(`認証失敗: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDelete = async (id: string, handle: string) => {
    if (!confirm(`@${handle} を削除しますか？`)) return;
    try {
      await window.urads.deleteAccount(id);
      await loadAccounts();
    } catch (err) {
      setAuthStatus(`削除失敗: ${err instanceof Error ? err.message : String(err)}`);
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

      <ServerSettings health={health} />

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

        <button
          onClick={handleAuth}
          disabled={isAuthenticating}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: isAuthenticating ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 14,
          }}
        >
          {isAuthenticating ? '認証中...' : '+ Threadsアカウントを連携'}
        </button>

        {authStatus && (
          <p style={{
            marginTop: 12, fontSize: 14,
            color: authStatus.includes('失敗') ? '#e74c3c' : '#27ae60',
          }}>
            {authStatus}
          </p>
        )}
      </section>

      <AssistantSettings onNameChange={onAssistantNameChange} />
    </div>
  );
}

function AssistantSettings({ onNameChange }: { onNameChange?: (name: string) => void }): React.JSX.Element {
  const [name, setName] = useState('Navi');
  const [customName, setCustomName] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/chat/settings`)
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
    await fetch(`${API_BASE}/chat/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistant_name: newName.trim(), custom_instructions: customInstructions }),
    });
    setName(newName.trim());
    onNameChange?.(newName.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveInstructions = async () => {
    await fetch(`${API_BASE}/chat/settings`, {
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
          placeholder="AIアシスタントへの追加指示を入力...&#10;例: 占いアカウントとして運用しています&#10;例: 敬語は使わないでください"
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

      {/* チャットデフォルトON設定 */}
      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox"
            checked={(() => { try { return localStorage.getItem('urads-chat-default-open') === 'true'; } catch { return false; } })()}
            onChange={(e) => {
              localStorage.setItem('urads-chat-default-open', e.target.checked ? 'true' : 'false');
            }}
            style={{ width: 18, height: 18 }}
          />
          アプリ起動時にチャットパネルを自動で開く
        </label>
      </div>
    </section>
  );
}

function ServerSettings({ health }: { health: string }): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [isShared, setIsShared] = useState(true);

  React.useEffect(() => {
    (window as any).urads.configIsSharedServer().then((v: boolean) => setIsShared(v)).catch(() => {});
  }, [saved]);

  const handleTest = async () => {
    const normalized = newUrl.replace(/\/+$/, '');
    try {
      const parsed = new URL(normalized);
      if (parsed.username || parsed.password) {
        setTestResult({ ok: false, error: '認証情報を含むURLは使用できません' });
        return;
      }
    } catch {
      setTestResult({ ok: false, error: '有効なURLを入力してください' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await (window as any).urads.configTestConnection(normalized);
      setTestResult(result);
    } catch {
      setTestResult({ ok: false, error: '接続テストに失敗しました' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const normalized = newUrl.replace(/\/+$/, '');
    await (window as any).urads.configSetApiBase(normalized);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleSwitchToShared = async () => {
    await (window as any).urads.configSetSharedServer();
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>サーバー接続</h2>
      <div style={{ padding: 16, borderRadius: 8, background: '#f8f9fa' }}>
        <p>Workers API: <strong>{health}</strong></p>
        <p style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
          {isShared ? '共有サーバー' : 'カスタムサーバー'}
        </p>

        {!editing ? (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => { setEditing(true); setNewUrl(''); setTestResult(null); }}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'transparent', color: '#666', fontSize: 12, cursor: 'pointer' }}>
              サーバーを変更
            </button>
            {saved && <span style={{ color: '#27ae60', marginLeft: 8, fontSize: 13 }}>保存しました（再起動後に反映）</span>}
          </div>
        ) : (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #e0e0e0' }}>
            {!isShared && (
              <button onClick={handleSwitchToShared}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer', marginBottom: 12, display: 'block' }}>
                共有サーバーに戻す
              </button>
            )}
            <p style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>カスタムサーバーURL:</p>
            <input
              type="url" value={newUrl}
              onChange={(e) => { setNewUrl(e.target.value); setTestResult(null); }}
              placeholder="https://your-worker.your-subdomain.workers.dev"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={handleTest} disabled={testing || !newUrl.trim()}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
                {testing ? 'テスト中...' : '接続テスト'}
              </button>
              {testResult?.ok && (
                <button onClick={handleSave}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                  保存
                </button>
              )}
              <button onClick={() => setEditing(false)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: 'transparent', color: '#999', fontSize: 12, cursor: 'pointer' }}>
                キャンセル
              </button>
            </div>
            {testResult && (
              <p style={{ marginTop: 8, fontSize: 12, color: testResult.ok ? '#27ae60' : '#e74c3c' }}>
                {testResult.ok ? '接続OK' : testResult.error}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
