/**
 * 統合ログシステム
 * electron-logをラップし、カテゴリ/レベル付きリングバッファを提供
 */
import log from './logger';
import { readFileSync } from 'fs';

export type LogCategory = 'api' | 'scraper' | 'ipc' | 'auth' | 'app' | 'chat' | 'config' | 'ui' | 'error';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail?: string;
}

// --- リングバッファ ---
const BUFFER_SIZE = 1000;
const buffer: (LogEntry | null)[] = new Array(BUFFER_SIZE).fill(null);
let writeIndex = 0;
let entryCounter = 0;

// --- リアルタイム配信 ---
type EntryListener = (entry: LogEntry) => void;
const listeners: EntryListener[] = [];

export function onEntry(callback: EntryListener): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// --- detail トランケート ---
function truncateDetail(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  try {
    const str = typeof detail === 'string' ? detail : JSON.stringify(detail);
    if (str.length > 2048) return str.slice(0, 2048) + '...[truncated]';
    return str;
  } catch {
    return String(detail).slice(0, 2048);
  }
}

// --- コアログ関数 ---
function addEntry(level: LogLevel, category: LogCategory, message: string, detail?: unknown): void {
  entryCounter++;
  const entry: LogEntry = {
    id: `L${entryCounter}`,
    timestamp: Date.now(),
    level,
    category,
    message,
    detail: truncateDetail(detail),
  };

  // リングバッファに追加
  buffer[writeIndex] = entry;
  writeIndex = (writeIndex + 1) % BUFFER_SIZE;

  // electron-logにも出力
  const formatted = `[${category.toUpperCase()}] ${message}`;
  switch (level) {
    case 'debug': log.debug(formatted); break;
    case 'info': log.info(formatted); break;
    case 'warn': log.warn(formatted); break;
    case 'error': log.error(formatted); break;
  }

  // リスナーに通知
  for (const listener of listeners) {
    try { listener(entry); } catch { /* リスナーエラーは無視 */ }
  }
}

// --- バッファ取得 ---
export interface LogFilter {
  category?: string;
  level?: string;
  since?: number;
  limit?: number;
}

export function getEntries(filter?: LogFilter): LogEntry[] {
  const entries: LogEntry[] = [];
  const limit = filter?.limit || BUFFER_SIZE;

  // リングバッファを古い順に読み出し
  for (let i = 0; i < BUFFER_SIZE; i++) {
    const idx = (writeIndex + i) % BUFFER_SIZE;
    const entry = buffer[idx];
    if (!entry) continue;

    if (filter?.category && entry.category !== filter.category) continue;
    if (filter?.level && entry.level !== filter.level) continue;
    if (filter?.since && entry.timestamp < filter.since) continue;

    entries.push(entry);
  }

  return entries.slice(-limit);
}

// --- 起動時ログファイル復元 ---
export function hydrateFromLogFile(): void {
  try {
    const logPath = log.transports.file.getFile()?.path;
    if (!logPath) return;

    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n').slice(-100);

    for (const line of lines) {
      // フォーマット: 2026-04-10 08:39:32 [info] [CATEGORY] message
      const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)]\s+(?:\[(\w+)]\s+)?(.*)$/);
      if (!match) continue;

      const [, dateStr, level, cat, message] = match;
      const timestamp = new Date(dateStr).getTime();
      if (isNaN(timestamp)) continue;

      const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
      const validCategories: LogCategory[] = ['api', 'scraper', 'ipc', 'auth', 'app', 'chat', 'config', 'ui', 'error'];

      const logLevel = validLevels.includes(level as LogLevel) ? (level as LogLevel) : 'info';
      const logCategory = cat && validCategories.includes(cat.toLowerCase() as LogCategory)
        ? (cat.toLowerCase() as LogCategory)
        : 'app';

      entryCounter++;
      const entry: LogEntry = {
        id: `R${entryCounter}`,
        timestamp,
        level: logLevel,
        category: logCategory,
        message: message.trim(),
      };

      buffer[writeIndex] = entry;
      writeIndex = (writeIndex + 1) % BUFFER_SIZE;
    }
  } catch {
    // ファイル読み込み失敗は無視
  }
}

// --- ログファイルパス取得 ---
export function getLogFilePath(): string {
  try {
    return log.transports.file.getFile()?.path || '';
  } catch {
    return '';
  }
}

// --- ファクトリ ---
export interface ScopedLogger {
  debug: (message: string, detail?: unknown) => void;
  info: (message: string, detail?: unknown) => void;
  warn: (message: string, detail?: unknown) => void;
  error: (message: string, detail?: unknown) => void;
}

export function createLogger(category: LogCategory): ScopedLogger {
  return {
    debug: (message, detail?) => addEntry('debug', category, message, detail),
    info: (message, detail?) => addEntry('info', category, message, detail),
    warn: (message, detail?) => addEntry('warn', category, message, detail),
    error: (message, detail?) => addEntry('error', category, message, detail),
  };
}
