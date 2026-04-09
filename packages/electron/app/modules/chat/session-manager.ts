/**
 * セッションマネージャー
 * V2 APIでセッション維持、タイムアウト管理、要約生成
 */
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  unstable_v2_prompt,
  type SDKSession,
} from '@anthropic-ai/claude-agent-sdk';
import * as sessionStore from './session-store';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { getApiBase } from '../config/api-base';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30分

let currentSession: SDKSession | null = null;
let currentSessionId: string | null = null;
let lastActivityTimestamp = 0;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let cancelled = false;

/**
 * チャット設定取得（名前+カスタム指示）
 */
async function getChatSettings(): Promise<{ name: string; customInstructions: string }> {
  try {
    const res = await fetch(`${getApiBase()}/chat/settings`);
    const data = await res.json() as { assistant_name: string; custom_instructions: string };
    return {
      name: data.assistant_name || 'Navi',
      customInstructions: data.custom_instructions || '',
    };
  } catch {
    return { name: 'Navi', customInstructions: '' };
  }
}

/**
 * スキルディレクトリ
 */
function getSkillsDir(): string {
  const devPath = join(__dirname, '../../resources/skills');
  if (existsSync(devPath)) return devPath;
  return join(process.resourcesPath || '', 'skills');
}

/**
 * 前回コンテキスト構築（要約 + 直近10件）
 */
function buildContextMessage(): string | null {
  const summary = sessionStore.getLastSummary();
  const recentMessages = sessionStore.getLastNMessages(10);

  if (!summary && recentMessages.length === 0) return null;

  let context = '以下は直前のセッションのコンテキストです。この情報を踏まえて会話を続けてください。\n\n';

  if (summary) {
    context += `## 前回セッションの要約\n${summary}\n\n`;
  }

  if (recentMessages.length > 0) {
    context += `## 直近のメッセージ\n`;
    for (const msg of recentMessages) {
      context += `${msg.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${msg.text.slice(0, 200)}\n`;
    }
  }

  return context;
}

/**
 * システムプロンプト構築
 */
async function buildSystemPrompt(): Promise<string> {
  const { name, customInstructions } = await getChatSettings();
  let prompt = `あなたは${name}、Urads（Threads自動投稿ツール）のAIアシスタントです。

## 利用可能なAPI（全て${getApiBase()}で動作中）
### 投稿: GET /posts, POST /posts, GET /posts/quota
### アカウント: GET /accounts
### リプライ: GET /replies/rules, POST /replies/rules, PUT /replies/rules/{id}, GET /replies/logs
### リサーチ: GET /research/benchmarks, POST /research/benchmarks/{id}/scrape, GET /research/benchmarks/{id}/posts, GET /research/search?q={query}, GET /research/limits
### AI生成: POST /ai/generate, GET /ai/presets

## ルール
- 日本語で簡潔に応答
- BashツールでcurlでAPIを叩く
- 投稿・削除・ルール変更は確認必須。閲覧系はそのまま実行OK`;

  if (customInstructions) {
    prompt += `\n\n## ユーザーのカスタム指示\n${customInstructions}`;
  }

  return prompt;
}

/**
 * セッション作成（コンテキスト注入付き）
 */
async function createSessionWithContext(): Promise<SDKSession> {
  const systemPrompt = await buildSystemPrompt();

  const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    allowedTools: ['Bash', 'WebFetch', 'Read'],
    permissionMode: 'acceptEdits',
  });

  // コンテキスト注入（前回要約 + 直近10件）
  const context = buildContextMessage();
  const initMessage = context
    ? `${systemPrompt}\n\n${context}\n\nコンテキストを理解しました。何をお手伝いしましょうか？`
    : `${systemPrompt}\n\n準備完了です。何をお手伝いしましょうか？`;

  await session.send(initMessage);

  let sessionId = '';
  for await (const msg of session.stream()) {
    if (msg.type === 'result' && 'session_id' in msg) {
      sessionId = (msg as { session_id: string }).session_id || '';
      break;
    }
  }

  currentSessionId = sessionId || `local-${Date.now()}`;
  sessionStore.startSession(currentSessionId);
  lastActivityTimestamp = Date.now();
  resetExpiryTimer();

  return session;
}

/**
 * セッション有効確認 + 取得/作成
 */
async function ensureSession(): Promise<SDKSession> {
  const now = Date.now();

  // アクティブセッションが有効期間内
  if (currentSession && currentSessionId && (now - lastActivityTimestamp) < SESSION_TIMEOUT_MS) {
    lastActivityTimestamp = now;
    resetExpiryTimer();
    return currentSession;
  }

  // 期限切れ → 旧セッション要約
  if (currentSession && currentSessionId) {
    await expireSession();
  }

  // 新セッション作成
  currentSession = await createSessionWithContext();
  return currentSession;
}

/**
 * セッション期限切れ処理（要約生成）
 */
async function expireSession(): Promise<void> {
  if (!currentSessionId) return;

  const messages = sessionStore.getActiveMessages();
  if (messages.length > 0) {
    const messagesText = messages
      .slice(-20)
      .map((m) => `${m.role}: ${m.text.slice(0, 200)}`)
      .join('\n');

    try {
      const result = await unstable_v2_prompt(
        `以下の会話を3文で要約してください。重要な決定事項、作成した成果物、未完了タスクを含めてください。\n\n${messagesText}`,
        { model: 'claude-sonnet-4-6' },
      );

      const summary = (result.subtype === 'success' && result.result) ? result.result : '[要約生成失敗]';
      sessionStore.finalizeSession(currentSessionId, summary);
    } catch {
      sessionStore.finalizeSession(currentSessionId, '[要約生成失敗]');
    }
  }

  if (currentSession) {
    try { currentSession.close(); } catch { /* 無視 */ }
  }
  currentSession = null;
  currentSessionId = null;
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
}

/**
 * タイムアウトタイマーリセット
 */
function resetExpiryTimer(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => {
    expireSession().catch(() => {});
  }, SESSION_TIMEOUT_MS);
}

/**
 * メッセージ処理（メインエントリポイント）
 */
export async function processMessage(payload: { message?: string; skill?: string }): Promise<{ text: string; error?: string }> {
  try {
    const session = await ensureSession();
    let prompt: string;

    if (payload.skill) {
      // スキル実行
      const skillsDir = getSkillsDir();
      const skillFile = join(skillsDir, payload.skill, 'SKILL.md');

      if (!existsSync(skillFile)) {
        return { text: `スキル「${payload.skill}」が見つかりません。` };
      }

      const content = readFileSync(skillFile, 'utf-8');
      // frontmatter除去 + localhost を実際のWorkers URLに置換
      const body = content
        .replace(/^---[\s\S]*?---\n/, '')
        .replace(/http:\/\/localhost:8787/g, getApiBase());
      prompt = `[System: スキル「${payload.skill}」を実行します]\n\n${body}\n\n実行してください。`;
    } else if (payload.message) {
      prompt = payload.message;
    } else {
      return { text: 'メッセージまたはスキル名を指定してください。' };
    }

    // メッセージ保存（ユーザー側）
    sessionStore.addMessage('user', payload.message || `[スキル] ${payload.skill}`);

    // セッションに送信
    cancelled = false;
    await session.send(prompt);

    let fullText = '';
    for await (const msg of session.stream()) {
      if (cancelled) {
        fullText += '\n\n[取り消されました]';
        break;
      }
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if ('text' in block && typeof block.text === 'string') {
            fullText += block.text;
          }
        }
      }
      if (msg.type === 'result') break;
    }

    // メッセージ保存（アシスタント側）
    sessionStore.addMessage('assistant', fullText);

    // メッセージ数上限チェック
    if (sessionStore.getActiveMessageCount() >= sessionStore.MAX_MESSAGES_PER_SESSION) {
      await expireSession();
    }

    // 監査ログ
    try {
      await fetch(`${getApiBase()}/chat/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: payload.skill || 'free_chat',
          tool_input: { skill: payload.skill },
          tool_result: { success: true, length: fullText.length },
          confirmed: true,
        }),
      });
    } catch { /* ログ失敗は無視 */ }

    const { name } = await getChatSettings();
    return { text: fullText || `${name}は応答を生成できませんでした。` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ANTHROPIC_API_KEY')) {
      return { text: 'ANTHROPIC_API_KEY が設定されていません。環境変数に設定してからアプリを再起動してください。', error: msg };
    }
    return { text: `エラー: ${msg}`, error: msg };
  }
}

/**
 * セッション情報取得
 */
export function getSessionInfo(): { sessionId: string | null; isActive: boolean; lastActivity: number } {
  return {
    sessionId: currentSessionId,
    isActive: !!(currentSession && currentSessionId && (Date.now() - lastActivityTimestamp) < SESSION_TIMEOUT_MS),
    lastActivity: lastActivityTimestamp,
  };
}

/**
 * メッセージ取り消し
 */
export function cancelMessage(): void {
  cancelled = true;
}

/**
 * 履歴クリア
 */
export async function clearHistory(): Promise<void> {
  if (currentSession) {
    try { currentSession.close(); } catch { /* 無視 */ }
  }
  currentSession = null;
  currentSessionId = null;
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  sessionStore.clearAll();
}

// Re-export for convenience
export { listSkills } from './agent';
