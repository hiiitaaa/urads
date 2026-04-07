/**
 * チャットセッション永続化（JSON file ベース）
 * electron-store v9+のESM問題を回避するためシンプルなファイルIO使用
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface StoredMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

interface SessionRecord {
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  summary: string | null;
  messages: StoredMessage[];
}

interface ChatStoreData {
  activeSessionId: string | null;
  activeSessionLastActivity: number;
  sessions: SessionRecord[];
}

const MAX_SESSIONS = 20;
export const MAX_MESSAGES_PER_SESSION = 50;

const STORE_PATH = join(app.getPath('userData'), 'urads-chat-sessions.json');

function loadData(): ChatStoreData {
  try {
    if (existsSync(STORE_PATH)) {
      return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
    }
  } catch { /* 読み込み失敗は初期値 */ }
  return { activeSessionId: null, activeSessionLastActivity: 0, sessions: [] };
}

function saveData(data: ChatStoreData): void {
  try {
    writeFileSync(STORE_PATH, JSON.stringify(data), { mode: 0o600 });
  } catch { /* 保存失敗は無視 */ }
}

/**
 * アクティブセッションのメッセージ取得
 */
export function getActiveMessages(): StoredMessage[] {
  const data = loadData();
  if (!data.activeSessionId) return [];
  const session = data.sessions.find((s) => s.sessionId === data.activeSessionId);
  return session?.messages || [];
}

/**
 * メッセージ追加
 */
export function addMessage(role: 'user' | 'assistant', text: string): void {
  const data = loadData();
  if (!data.activeSessionId) return;

  const session = data.sessions.find((s) => s.sessionId === data.activeSessionId);
  if (!session) return;

  session.messages.push({ role, text, timestamp: Date.now() });
  session.lastActivity = Date.now();
  data.activeSessionLastActivity = Date.now();
  saveData(data);
}

/**
 * 新セッション開始
 */
export function startSession(sessionId: string): void {
  const data = loadData();

  while (data.sessions.length >= MAX_SESSIONS) {
    data.sessions.shift();
  }

  data.sessions.push({
    sessionId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    summary: null,
    messages: [],
  });

  data.activeSessionId = sessionId;
  data.activeSessionLastActivity = Date.now();
  saveData(data);
}

/**
 * セッション終了（要約保存）
 */
export function finalizeSession(sessionId: string, summary: string): void {
  const data = loadData();
  const session = data.sessions.find((s) => s.sessionId === sessionId);
  if (session) {
    session.summary = summary;
  }
  data.activeSessionId = null;
  saveData(data);
}

/**
 * アクティブセッションID取得
 */
export function getActiveSessionId(): string | null {
  return loadData().activeSessionId;
}

/**
 * 最終操作時刻取得
 */
export function getLastActivity(): number {
  return loadData().activeSessionLastActivity;
}

/**
 * 直近N件のメッセージ取得（セッション横断）
 */
export function getLastNMessages(n: number): StoredMessage[] {
  const data = loadData();
  const allMessages: StoredMessage[] = [];

  for (let i = data.sessions.length - 1; i >= 0 && allMessages.length < n; i--) {
    const msgs = data.sessions[i].messages;
    for (let j = msgs.length - 1; j >= 0 && allMessages.length < n; j--) {
      allMessages.unshift(msgs[j]);
    }
  }

  return allMessages.slice(-n);
}

/**
 * 最後に終了したセッションの要約取得
 */
export function getLastSummary(): string | null {
  const data = loadData();
  for (let i = data.sessions.length - 1; i >= 0; i--) {
    if (data.sessions[i].summary) return data.sessions[i].summary;
  }
  return null;
}

/**
 * アクティブセッションのメッセージ数
 */
export function getActiveMessageCount(): number {
  return getActiveMessages().length;
}

/**
 * 全セッション削除
 */
export function clearAll(): void {
  saveData({ activeSessionId: null, activeSessionLastActivity: 0, sessions: [] });
}
