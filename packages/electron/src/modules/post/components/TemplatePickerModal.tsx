import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../../config';

interface Template {
  id: string;
  name: string;
  content: string;
  variables: string | null;
  category: string | null;
  usage_count: number;
}

interface Props {
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function TemplatePickerModal({ onInsert, onClose }: Props): React.JSX.Element {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  // 編集モード
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/posts/templates`);
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleSelect = (t: Template) => {
    setSelected(t);
    setVarValues({});
  };

  const getVariables = (t: Template): string[] => {
    if (!t.variables) return [];
    try { return JSON.parse(t.variables); } catch { return []; }
  };

  const buildContent = (): string => {
    if (!selected) return '';
    let result = selected.content;
    for (const [key, value] of Object.entries(varValues)) {
      result = result.replaceAll(`{{${key}}}`, value);
    }
    return result;
  };

  const handleInsert = () => {
    const text = buildContent();
    onInsert(text);
    onClose();
  };

  const handleSave = async () => {
    if (!editName.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await fetch(`${API_BASE}/posts/templates/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName, content: editContent }),
        });
      } else {
        await fetch(`${API_BASE}/posts/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName, content: editContent }),
        });
      }
      setEditMode(false);
      setEditId(null);
      setEditName('');
      setEditContent('');
      await loadTemplates();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除しますか？')) return;
    await fetch(`${API_BASE}/posts/templates/${id}`, { method: 'DELETE' });
    if (selected?.id === id) setSelected(null);
    await loadTemplates();
  };

  const handleEdit = (t: Template) => {
    setEditMode(true);
    setEditId(t.id);
    setEditName(t.name);
    setEditContent(t.content);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 700, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ヘッダー */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>投稿テンプレート</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setEditMode(true); setEditId(null); setEditName(''); setEditContent(''); }}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #27ae60', background: 'transparent', color: '#27ae60', fontSize: 12, cursor: 'pointer' }}>
              + 新規作成
            </button>
            <button onClick={onClose}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'transparent', color: '#666', fontSize: 12, cursor: 'pointer' }}>
              閉じる
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {/* 編集フォーム */}
          {editMode && (
            <div style={{ marginBottom: 20, padding: 16, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e0e0e0' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>{editId ? 'テンプレート編集' : '新規テンプレート'}</h4>
              <input value={editName} onChange={(e) => setEditName(e.target.value)}
                placeholder="テンプレート名" maxLength={50}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14, marginBottom: 8 }} />
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                placeholder="投稿内容を入力...&#10;{{変数名}} で変数を埋め込めます" maxLength={500}
                style={{ width: '100%', minHeight: 80, padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#999' }}>{editContent.length}/500</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setEditMode(false); setEditId(null); }}
                    style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #ddd', background: 'transparent', color: '#666', fontSize: 13, cursor: 'pointer' }}>
                    キャンセル
                  </button>
                  <button onClick={handleSave} disabled={saving || !editName.trim() || !editContent.trim()}
                    style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* テンプレート一覧 */}
          {loading ? (
            <p style={{ color: '#999', textAlign: 'center' }}>読み込み中...</p>
          ) : templates.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center' }}>テンプレートがありません。「+ 新規作成」で作成してください。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {templates.map((t) => {
                const isSelected = selected?.id === t.id;
                const vars = getVariables(t);
                return (
                  <div key={t.id}>
                    <div
                      onClick={() => handleSelect(t)}
                      style={{
                        padding: 12, borderRadius: 8, cursor: 'pointer',
                        border: isSelected ? '2px solid #9b59b6' : '1px solid #e0e0e0',
                        background: isSelected ? '#faf5ff' : '#fff',
                        transition: 'border 0.15s',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontSize: 14 }}>{t.name}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }}
                            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ddd', background: 'transparent', color: '#666', fontSize: 11, cursor: 'pointer' }}>
                            編集
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #e74c3c', background: 'transparent', color: '#e74c3c', fontSize: 11, cursor: 'pointer' }}>
                            削除
                          </button>
                        </div>
                      </div>
                      <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                        {t.content}
                      </p>
                      {vars.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {vars.map((v) => (
                            <span key={v} style={{ padding: '1px 6px', borderRadius: 4, background: '#e8f0fe', color: '#3498db', fontSize: 11 }}>
                              {`{{${v}}}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 変数入力 + プレビュー */}
                    {isSelected && (
                      <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#f8f9fa', border: '1px solid #e0e0e0' }}>
                        {vars.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <p style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>変数を入力:</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {vars.map((v) => (
                                <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13, color: '#3498db', minWidth: 80 }}>{v}:</span>
                                  <input
                                    value={varValues[v] || ''}
                                    onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                                    placeholder={`${v}を入力...`}
                                    maxLength={200}
                                    style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd', fontSize: 13 }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ padding: 8, borderRadius: 6, background: '#fff', border: '1px solid #eee', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                          {buildContent()}
                        </div>
                        <button onClick={handleInsert}
                          style={{ marginTop: 8, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#9b59b6', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                          この内容を使う
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
