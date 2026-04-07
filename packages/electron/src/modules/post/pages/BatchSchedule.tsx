import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../../config';

interface Account {
  id: string;
  threads_handle: string;
  display_name: string | null;
}

interface BatchRow {
  content: string;
  scheduledAt: string; // ISO datetime string
  valid: boolean;
  error?: string;
}

export function BatchSchedule(): React.JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<Array<{ idx: number; ok: boolean; error?: string }>>([]);
  const [parseMode, setParseMode] = useState<'pipe' | 'tab'>('pipe');

  useEffect(() => {
    fetch(`${API_BASE}/accounts`)
      .then((r) => r.json())
      .then((data) => {
        const accs = data.accounts || [];
        setAccounts(accs);
        if (accs.length > 0) setSelectedAccount(accs[0].id);
      })
      .catch(() => {});
  }, []);

  const parseInput = () => {
    const delimiter = parseMode === 'pipe' ? '|' : '\t';
    const lines = rawInput.split('\n').filter((l) => l.trim());
    const parsed: BatchRow[] = [];

    for (const line of lines) {
      const parts = line.split(delimiter).map((p) => p.trim());
      if (parts.length < 2) {
        parsed.push({ content: parts[0] || '', scheduledAt: '', valid: false, error: '日時が指定されていません' });
        continue;
      }

      const content = parts[0];
      const dateStr = parts[1];

      // バリデーション
      const errors: string[] = [];
      if (!content || content.length === 0) errors.push('投稿内容が空です');
      if (content.length > 500) errors.push(`${content.length}/500文字`);

      // 日時パース
      let scheduledAt = '';
      try {
        const dt = new Date(dateStr.replace(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:00'));
        if (isNaN(dt.getTime())) {
          errors.push('日時の形式が不正です');
        } else if (dt.getTime() <= Date.now()) {
          errors.push('過去の日時です');
        } else {
          scheduledAt = dt.toISOString();
        }
      } catch {
        errors.push('日時の形式が不正です');
      }

      parsed.push({
        content,
        scheduledAt,
        valid: errors.length === 0,
        error: errors.join(', '),
      });
    }

    // 10分間隔チェック
    const times = parsed.filter((r) => r.scheduledAt).map((r) => new Date(r.scheduledAt).getTime()).sort();
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] < 10 * 60 * 1000) {
        const conflictIdx = parsed.findIndex((r) => r.scheduledAt && new Date(r.scheduledAt).getTime() === times[i]);
        if (conflictIdx >= 0 && parsed[conflictIdx].valid) {
          parsed[conflictIdx].valid = false;
          parsed[conflictIdx].error = '前の予約と10分以上の間隔が必要です';
        }
      }
    }

    setRows(parsed);
    setResults([]);
  };

  const handleSubmit = async () => {
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0 || !selectedAccount) return;

    setProcessing(true);
    setProgress({ current: 0, total: validRows.length });
    const newResults: Array<{ idx: number; ok: boolean; error?: string }> = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const originalIdx = rows.indexOf(row);

      try {
        const res = await fetch(`${API_BASE}/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            account_id: selectedAccount,
            content: row.content,
            scheduled_at: new Date(row.scheduledAt).getTime(),
          }),
        });
        const data = await res.json();

        if (data.status === 'scheduled') {
          newResults.push({ idx: originalIdx, ok: true });
        } else {
          newResults.push({ idx: originalIdx, ok: false, error: data.error || '予約失敗' });
        }
      } catch {
        newResults.push({ idx: originalIdx, ok: false, error: 'ネットワークエラー' });
      }

      setProgress({ current: i + 1, total: validRows.length });
      setResults([...newResults]);

      // 次のリクエストまで少し待つ（サーバー負荷軽減）
      if (i < validRows.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    setProcessing(false);
  };

  const validCount = rows.filter((r) => r.valid).length;
  const successCount = results.filter((r) => r.ok).length;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>一括予約</h1>

      {accounts.length === 0 ? (
        <div style={{ padding: 20, background: '#fff3cd', borderRadius: 8 }}>
          <p>アカウントが連携されていません。設定画面からアカウントを連携してください。</p>
        </div>
      ) : (
        <>
          {/* アカウント選択 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 14, color: '#666', marginBottom: 4, display: 'block' }}>投稿アカウント</label>
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>@{acc.threads_handle}</option>
              ))}
            </select>
          </div>

          {/* 区切り文字選択 */}
          <div style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#666' }}>区切り文字:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={parseMode === 'pipe'} onChange={() => setParseMode('pipe')} />
              パイプ（|）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" checked={parseMode === 'tab'} onChange={() => setParseMode('tab')} />
              タブ
            </label>
          </div>

          {/* 入力エリア */}
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={`投稿内容${parseMode === 'pipe' ? '|' : '(タブ)'}日時 の形式で1行ずつ入力\n\n例:\nおはようございます！今日もいい天気ですね${parseMode === 'pipe' ? '|' : '\t'}2026-04-10 09:00\n今日のランチは何にしよう${parseMode === 'pipe' ? '|' : '\t'}2026-04-10 12:00\n夜のリラックスタイム${parseMode === 'pipe' ? '|' : '\t'}2026-04-10 21:00`}
            style={{
              width: '100%', minHeight: 140, padding: 12, fontSize: 13,
              borderRadius: 8, border: '1px solid #ddd', resize: 'vertical',
              fontFamily: 'monospace', lineHeight: 1.6,
            }}
          />

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={parseInput} disabled={!rawInput.trim()}
              style={{
                padding: '8px 20px', borderRadius: 6, border: '1px solid #3498db',
                background: 'transparent', color: '#3498db', fontSize: 14, cursor: 'pointer',
              }}>
              プレビュー
            </button>
          </div>

          {/* プレビューテーブル */}
          {rows.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>
                プレビュー（{validCount}/{rows.length}件 有効）
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 12, color: '#666', width: 30 }}>#</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 12, color: '#666' }}>内容</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 12, color: '#666', width: 150 }}>日時</th>
                    <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 12, color: '#666', width: 80 }}>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const result = results.find((r) => r.idx === idx);
                    return (
                      <tr key={idx} style={{
                        background: result ? (result.ok ? '#f0faf0' : '#fff3f3') : (row.valid ? '#fff' : '#fff8f0'),
                        borderBottom: '1px solid #eee',
                      }}>
                        <td style={{ padding: '6px 10px', color: '#999' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.content}
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 12 }}>
                          {row.scheduledAt ? new Date(row.scheduledAt).toLocaleString('ja-JP') : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          {result ? (
                            result.ok
                              ? <span style={{ color: '#27ae60', fontSize: 12 }}>予約完了</span>
                              : <span style={{ color: '#e74c3c', fontSize: 12 }}>{result.error}</span>
                          ) : row.valid ? (
                            <span style={{ color: '#27ae60', fontSize: 12 }}>OK</span>
                          ) : (
                            <span style={{ color: '#e74c3c', fontSize: 11 }}>{row.error}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* 実行ボタン + プログレス */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={handleSubmit}
                  disabled={processing || validCount === 0}
                  style={{
                    padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: validCount > 0 && !processing ? '#1a1a2e' : '#ccc',
                    color: '#fff', fontSize: 14,
                  }}>
                  {processing ? `予約中... (${progress.current}/${progress.total})` : `${validCount}件を一括予約`}
                </button>

                {processing && (
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#eee', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: '#9b59b6',
                      width: `${(progress.current / progress.total) * 100}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}

                {results.length > 0 && !processing && (
                  <span style={{ fontSize: 13, color: '#27ae60' }}>
                    {successCount}/{results.length}件 予約完了
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
