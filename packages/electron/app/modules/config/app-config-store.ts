/**
 * アプリ設定永続化（JSON file ベース）
 * session-store.ts と同じパターン
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { SHARED_API } from './shared-server';

interface AppConfig {
  workersUrl: string | null;
  setupCompleted: boolean;
  isShared: boolean;
}

const CONFIG_PATH = join(app.getPath('userData'), 'urads-app-config.json');

// インメモリキャッシュ（毎回ファイルI/O回避）
let _cache: AppConfig | null = null;

function loadConfig(): AppConfig {
  if (_cache) return _cache;
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      // 旧バージョン互換: isShared が存在しない場合は false
      _cache = {
        workersUrl: raw.workersUrl ?? null,
        setupCompleted: raw.setupCompleted ?? false,
        isShared: raw.isShared ?? false,
      };
      return _cache;
    }
  } catch { /* 読み込み失敗は初期値 */ }
  _cache = { workersUrl: null, setupCompleted: false, isShared: false };
  return _cache;
}

function saveConfig(config: AppConfig): void {
  _cache = config;
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config), { mode: 0o600 });
  } catch (err) {
    console.warn('app-config save failed:', err);
  }
}

/**
 * 起動時マイグレーション（1回だけ実行）
 * 旧バージョンユーザー: workersUrl未設定 + setupCompleted → 共有サーバーに自動移行
 */
export function migrateConfig(): void {
  const config = loadConfig();
  if (config.workersUrl == null && config.setupCompleted) {
    config.workersUrl = SHARED_API;
    config.isShared = true;
    saveConfig(config);
  }
}

export function getWorkersUrl(): string {
  return loadConfig().workersUrl || '';
}

/** 共有サーバーを設定 */
export function setSharedUrl(): void {
  const config = loadConfig();
  config.workersUrl = SHARED_API;
  config.isShared = true;
  saveConfig(config);
}

/** カスタムサーバーを設定 */
export function setCustomUrl(url: string): void {
  const config = loadConfig();
  config.workersUrl = url;
  config.isShared = false;
  saveConfig(config);
}

/** 旧API互換: setWorkersUrl → setCustomUrl に委譲 */
export function setWorkersUrl(url: string): void {
  setCustomUrl(url);
}

export function isSharedServer(): boolean {
  return loadConfig().isShared;
}

export function isSetupCompleted(): boolean {
  return loadConfig().setupCompleted;
}

export function completeSetup(): void {
  const config = loadConfig();
  config.setupCompleted = true;
  saveConfig(config);
}
