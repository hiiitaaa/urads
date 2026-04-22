import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../config';

interface Preset {
  id: string;
  name: string;
  description: string;
  prompt_template: string;
  variables: string[];
  is_builtin: number;
}

interface Props {
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function AIGenerateModal({ onInsert, onClose }: Props): React.JSX.Element {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    apiFetch('/ai/presets')
      .then((r) => r.json())
      .then((d) => {
        const p = d.presets || [];
        setPresets(p);
        if (p.length > 0) {
          setSelectedPreset(p[0].id);
          initVariables(p[0]);
        }
      })
      .catch(() => {});

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const initVariables = (preset: Preset) => {
    const vars: Record<string, string> = {};
    for (const v of preset.variables) vars[v] = '';
    setVariables(vars);
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = presets.find((p) => p.id === presetId);
    if (preset) initVariables(preset);
    setResult('');
    setError(null);
  };

  const buildPrompt = (): string => {
    const preset = presets.find((p) => p.id === selectedPreset);
    if (!preset) return '';
    let prompt = preset.prompt_template;
    for (const [key, value] of Object.entries(variables)) {
      const sanitized = value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 200);
      prompt = prompt.replaceAll(`{{${key}}}`, sanitized);
    }
    return prompt;
  };

  const handleGenerate = async () => {
    const prompt = buildPrompt();
    if (!prompt.trim()) { setError('プロンプトが空です'); return; }

    setIsGenerating(true);
    setError(null);
    setResult('');
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

    try {
      const res = await apiFetch('/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  const handleInsert = () => {
    if (result.trim()) {
      onInsert(result.trim());
      onClose();
    }
  };

  const currentPreset = presets.find((p) => p.id === selectedPreset);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 700, maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, margin: 0 }}>AI テキスト生成</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {/* 左: 設定 */}
          <div style={{ flex: 1 }}>
            {/* プロバイダー（Web版はClaude APIのみ） */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>プロバイダー</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
                  <input type="radio" checked readOnly /> Claude API
                </label>
                <span style={{ fontSize: 13, color: '#999' }}>
                  (Ollamaはデスクトップ版のみ)
                </span>
              </div>
            </div>

            {/* プリセット */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>プリセット</label>
              <select value={selectedPreset} onChange={(e) => handlePresetChange(e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.is_builtin ? '' : ' (カスタム)'}</option>
                ))}
              </select>
              {currentPreset?.description && (
                <p style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{currentPreset.description}</p>
              )}
            </div>

            {/* 変数入力 */}
            {currentPreset && currentPreset.variables.map((varName) => (
              <div key={varName} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#666', display: 'block', marginBottom: 4 }}>{varName}</label>
                {varName === 'プロンプト' ? (
                  <textarea
                    value={variables[varName] || ''}
                    onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
                    placeholder={`${varName}を入力...`}
                    maxLength={200}
                    style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, resize: 'vertical' }}
                  />
                ) : (
                  <input
                    value={variables[varName] || ''}
                    onChange={(e) => setVariables({ ...variables, [varName]: e.target.value })}
                    placeholder={`${varName}を入力...`}
                    maxLength={200}
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
                  />
                )}
              </div>
            ))}

            {/* 生成ボタン */}
            <div style={{ display: 'flex', gap: 8 }}>
              {isGenerating ? (
                <span style={{ fontSize: 14, color: '#666', padding: '8px 0' }}>生成中... {elapsed}秒</span>
              ) : (
                <button onClick={handleGenerate}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
                  生成
                </button>
              )}
            </div>
          </div>

          {/* 右: 結果 */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 13, color: '#666' }}>生成結果</label>
              {result && <span style={{ fontSize: 12, color: result.length > 500 ? '#e74c3c' : '#999' }}>{result.length}/500</span>}
            </div>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="ここに生成結果が表示されます"
              style={{ width: '100%', minHeight: 200, padding: 8, borderRadius: 6, border: '1px solid #ddd', fontSize: 14, resize: 'vertical' }}
            />

            {error && <p style={{ fontSize: 13, color: '#e74c3c', marginTop: 8 }}>{error}</p>}

            <button onClick={handleInsert} disabled={!result.trim()}
              style={{
                marginTop: 12, padding: '10px 20px', borderRadius: 8, border: 'none', width: '100%',
                background: result.trim() ? '#27ae60' : '#ccc', color: '#fff', fontSize: 14, cursor: 'pointer',
              }}>
              投稿画面に挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
