/**
 * アプリ設定永続化（JSON file ベース）
 * session-store.ts と同じパターン
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { createLogger } from '../../unified-logger';

const log = createLogger('config');

interface AppConfig {
  workersUrl: string | null;
  setupCompleted: boolean;
}

const CONFIG_PATH = join(app.getPath('userData'), 'urads-app-config.json');
const DEFAULT_URL = 'http://localhost:8787';

// インメモリキャッシュ（毎回ファイルI/O回避）
let _cache: AppConfig | null = null;

function loadConfig(): AppConfig {
  if (_cache) return _cache;
  try {
    if (existsSync(CONFIG_PATH)) {
      _cache = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
      return _cache!;
    }
  } catch { /* 読み込み失敗は初期値 */ }
  _cache = { workersUrl: null, setupCompleted: false };
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

export function getWorkersUrl(): string {
  return loadConfig().workersUrl || DEFAULT_URL;
}

export function setWorkersUrl(url: string): void {
  log.info(`Workers URL変更: ${url}`);
  const config = loadConfig();
  config.workersUrl = url;
  saveConfig(config);
}

export function isSetupCompleted(): boolean {
  return loadConfig().setupCompleted;
}

export function completeSetup(): void {
  log.info('セットアップ完了');
  const config = loadConfig();
  config.setupCompleted = true;
  saveConfig(config);
}
