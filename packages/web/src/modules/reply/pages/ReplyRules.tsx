import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../config';

interface Account {
  id: string;
  threads_handle: string;
}

interface PostItem {
  id: string;
  content: string;
  threads_id: string | null;
  status: string;
  posted_at: number | null;
}

interface Rule {
  id: string;
  threads_post_id: string;
  type: 'keyword_match' | 'random';
  config: { triggers?: string[]; response?: string; responses?: string[] };
  max_replies: number;
  reply_count: number;
  active: number;
  cooldown_seconds: number;
  created_at: number;
}

interface Props {
  preselectedPostId?: string | null;
  onClearPreselect?: () => void;
}

export function ReplyRules({ preselectedPostId, onClearPreselect }: Props): React.JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // 新規ルール用
  const [selectedPostId, setSelectedPostId] = useState('');
  const [ruleType, setRuleType] = useState<'keyword_match' | 'random'>('keyword_match');
  const [triggers, setTriggers] = useState('');
  const [response, setResponse] = useState('');
  const [responses, setResponses] = useState('');
  const [maxReplies, setMaxReplies] = useState(200);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    apiFetch('/accounts')
      .then((r) => r.json())
      .then((data) => {
        const accs = data.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) {
          setSelectedAccount(accs[0].id);
          loadData(accs[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // preselectedPostIdが来たらフォームを開く
  useEffect(() => {
    if (preselectedPostId) {
      setSelectedPostId(preselectedPostId);
      setShowCreate(true);
      onClearPreselect?.();
    }
  }, [preselectedPostId]);

  const loadData = (accountId: string) => {
    // ルール一覧
    apiFetch(`/replies/rules?account_id=${accountId}`)
      .then((r) => r.json())
      .then((data) => setRules(data.rules || []))
      .catch(() => setRules([]));

    // 投稿一覧（posted のみ）
    apiFetch(`/posts?account_id=${accountId}&status=posted`)
      .then((r) => r.json())
      .then((data) => setPosts(data.posts || []))
      .catch(() => setPosts([]));
  };

  const handleAccountChange = (id: string) => {
    setSelectedAccount(id);
    loadData(id);
  };

  const handleCreate = async () => {
    if (!selectedAccount || !selectedPostId) return;

    const config = ruleType === 'keyword_match'
      ? { triggers: triggers.split(',').map((t) => t.trim()).filter(Boolean), response }
      : { responses: responses.split('\n').map((r) => r.trim()).filter(Boolean) };

    try {
      const res = await apiFetch('/replies/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccount,
          threads_post_id: selectedPostId,
          type: ruleType,
          config,
          max_replies: maxReplies,
          cooldown_seconds: cooldown,
        }),
      });
      const data = await res.json();
      if (data.errors) {
        setStatus(`作成失敗: ${data.errors.map((e: { message: string }) => e.message).join(', ')}`);
        return;
      }
      setStatus(`ルール作成完了`);
      setShowCreate(false);
      setTriggers(''); setResponse(''); setResponses(''); setSelectedPostId('');
      loadData(selectedAccount);
    } catch {
      setStatus('ルール作成失敗');
    }
  };

  const handleToggle = async (id: string, currentActive: number) => {
    await apiFetch(`/replies/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !currentActive }),
    });
    loadData(selectedAccount);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このルールを削除しますか？')) return;
    await apiFetch(`/replies/rules/${id}`, { method: 'DELETE' });
    loadData(selectedAccount);
  };

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '...' : s;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>リプライルール</h1>

      {accounts.length === 0 ? (
        <p style={{ color: '#999' }}>アカウントを連携してください。</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <select
              value={selectedAccount}
              onChange={(e) => handleAccountChange(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>@{acc.threads_handle}</option>
              ))}
            </select>
          </div>

          {/* ルール一覧 */}
          {rules.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {rules.map((rule) => {
                const post = posts.find((p) => p.threads_id === rule.threads_post_id);
                return (
                  <div key={rule.id} style={{
                    padding: 16, borderRadius: 8, border: '1px solid #eee', background: '#fafafa',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 12, padding: '2px 8px', borderRadius: 4,
                          background: rule.type === 'keyword_match' ? '#3498db' : '#9b59b6', color: '#fff',
                        }}>
                          {rule.type === 'keyword_match' ? 'キーワード' : 'ランダム'}
                        </span>
                        <span style={{
                          fontSize: 12, padding: '2px 8px', borderRadius: 4,
                          background: rule.active ? '#27ae60' : '#95a5a6', color: '#fff',
                        }}>
                          {rule.active ? 'ON' : 'OFF'}
                        </span>
                        <span style={{ fontSize: 13, color: '#999' }}>
                          {rule.reply_count} / {rule.max_replies}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleToggle(rule.id, rule.active)}
                          style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #ddd', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
                          {rule.active ? 'OFF' : 'ON'}
                        </button>
                        <button onClick={() => handleDelete(rule.id)}
                          style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #e74c3c', background: 'transparent', color: '#e74c3c', fontSize: 12, cursor: 'pointer' }}>
                          削除
                        </button>
                      </div>
                    </div>
                    {/* 紐づき投稿表示 */}
                    <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                      対象: {post ? truncate(post.content, 40) : `ID: ${rule.threads_post_id.slice(0, 12)}...`}
                    </p>
                    {rule.type === 'keyword_match' && (
                      <div style={{ fontSize: 14 }}>
                        <p>トリガー: <strong>{(rule.config.triggers || []).join(', ')}</strong></p>
                        <p style={{ color: '#666', marginTop: 4 }}>→ {rule.config.response}</p>
                      </div>
                    )}
                    {rule.type === 'random' && (
                      <p style={{ fontSize: 14 }}>{(rule.config.responses || []).length}件の返信パターン</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ルール作成フォーム */}
          {showCreate ? (
            <div style={{ padding: 20, borderRadius: 8, border: '1px solid #ddd', background: '#f8f9fa', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, marginBottom: 12 }}>新規ルール作成</h3>

              {/* 対象投稿選択（必須） */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>対象投稿（必須）</label>
                {posts.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#e74c3c' }}>投稿済みの投稿がありません。先に投稿してください。</p>
                ) : (
                  <select
                    value={selectedPostId}
                    onChange={(e) => setSelectedPostId(e.target.value)}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                  >
                    <option value="">投稿を選択してください</option>
                    {posts.filter((p) => p.threads_id).map((p) => (
                      <option key={p.id} value={p.threads_id!}>
                        {truncate(p.content, 50)} ({new Date(p.posted_at || p.created_at).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* ルールタイプ */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" checked={ruleType === 'keyword_match'} onChange={() => setRuleType('keyword_match')} />
                    キーワードマッチ
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="radio" checked={ruleType === 'random'} onChange={() => setRuleType('random')} />
                    ランダム返信
                  </label>
                </label>
              </div>

              {ruleType === 'keyword_match' ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>トリガーキーワード（カンマ区切り）</label>
                    <input value={triggers} onChange={(e) => setTriggers(e.target.value)} placeholder="A, a, エー"
                      style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>返信テキスト</label>
                    <textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="あなたの今日の運勢は【大吉】です！"
                      style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, resize: 'vertical' }} />
                  </div>
                </>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>返信パターン（1行1パターン）</label>
                  <textarea value={responses} onChange={(e) => setResponses(e.target.value)} placeholder={"占い結果1\n占い結果2\n占い結果3"}
                    style={{ width: '100%', minHeight: 120, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, resize: 'vertical' }} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>最大返信数</label>
                  <input type="number" value={maxReplies} onChange={(e) => setMaxReplies(Number(e.target.value))}
                    style={{ width: 100, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>クールダウン（秒）</label>
                  <input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))}
                    style={{ width: 100, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreate} disabled={!selectedPostId}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: selectedPostId ? '#1a1a2e' : '#ccc', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
                  作成
                </button>
                <button onClick={() => setShowCreate(false)}
                  style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', fontSize: 14, cursor: 'pointer' }}>
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowCreate(true)}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
              + ルールを追加
            </button>
          )}

          {status && (
            <p style={{ marginTop: 12, fontSize: 14, color: status.includes('失敗') ? '#e74c3c' : '#27ae60' }}>
              {status}
            </p>
          )}
        </>
      )}
    </div>
  );
}
