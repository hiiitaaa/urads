import React, { useState } from 'react';
import { API_BASE } from '../../../config';

interface Props {
  label: string;
  contextType: string;
  contextData: Record<string, unknown>;
  prompt?: string;
  onResult?: (text: string) => void;
}

export function AIContextButton({ label, contextType, contextData, prompt, onResult }: Props): React.JSX.Element {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_BASE}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt || label,
          context_type: contextType,
          context_data: contextData,
        }),
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data.text);
        setExpanded(true);
        onResult?.(data.text);
      }
    } catch {
      setError('AI生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button onClick={handleClick} disabled={loading}
        style={{
          padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: loading ? 'default' : 'pointer',
          border: '1px solid #9b59b6', background: loading ? '#f3e8ff' : 'transparent',
          color: '#9b59b6', display: 'flex', alignItems: 'center', gap: 4,
        }}>
        {loading ? '分析中...' : `AI ${label}`}
      </button>

      {error && (
        <div style={{ padding: '6px 10px', borderRadius: 6, background: '#fff3f3', border: '1px solid #fcc', fontSize: 12, color: '#c00', maxWidth: 400 }}>
          {error}
        </div>
      )}

      {result && expanded && (
        <div style={{
          padding: 12, borderRadius: 8, background: '#faf5ff', border: '1px solid #e8d5f5',
          fontSize: 13, lineHeight: 1.6, maxWidth: 500, whiteSpace: 'pre-wrap', position: 'relative',
        }}>
          <button onClick={() => setExpanded(false)}
            style={{
              position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%',
              border: 'none', background: '#ddd', color: '#666', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            ×
          </button>
          <div style={{ fontSize: 11, color: '#9b59b6', marginBottom: 4 }}>AI分析結果</div>
          {result}
        </div>
      )}
    </div>
  );
}
