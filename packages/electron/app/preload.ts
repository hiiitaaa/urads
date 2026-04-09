import 'electron-log/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('urads', {
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',

  // Threads OAuth
  threadsAuth: () => ipcRenderer.invoke('threads:auth'),
  getAccounts: () => ipcRenderer.invoke('threads:getAccounts'),
  deleteAccount: (id: string) => ipcRenderer.invoke('threads:deleteAccount', id),

  // AI生成（ollama）
  generateOllama: (opts: { prompt: string; model?: string }) =>
    ipcRenderer.invoke('ai:generate:ollama', opts),
  cancelGeneration: () => ipcRenderer.invoke('ai:generate:cancel'),
  checkOllama: () => ipcRenderer.invoke('ai:ollama:check'),

  // チャットエージェント（V2セッション管理 + スキル）
  chatSendMessage: (payload: { message?: string; skill?: string }) =>
    ipcRenderer.invoke('chat:sendMessage', payload),
  chatListSkills: () => ipcRenderer.invoke('chat:listSkills'),
  chatGetHistory: () => ipcRenderer.invoke('chat:getHistory'),
  chatGetSessionInfo: () => ipcRenderer.invoke('chat:getSessionInfo'),
  chatCancelMessage: () => ipcRenderer.invoke('chat:cancelMessage'),
  chatClearHistory: () => ipcRenderer.invoke('chat:clearHistory'),

  // ファイルパス取得（Electron 32+でfile.pathが削除されたため必要）
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  // メディアアップロード
  mediaPickFiles: () => ipcRenderer.invoke('media:pickFiles'),
  mediaUpload: (filePath: string) => ipcRenderer.invoke('media:upload', filePath),
  mediaDelete: (key: string) => ipcRenderer.invoke('media:delete', key),

  // Insights
  insightsRefresh: (handle: string, accountId: string) =>
    ipcRenderer.invoke('insights:refresh', handle, accountId),

  // スクレイパー
  scraperLogin: () => ipcRenderer.invoke('scraper:login'),
  scraperTrending: () => ipcRenderer.invoke('scraper:trending'),
  scraperSearch: (query: string) => ipcRenderer.invoke('scraper:search', query),
  scraperBenchmark: (handle: string, benchmarkId: string) => ipcRenderer.invoke('scraper:benchmark', handle, benchmarkId),

  // アプリ設定（セットアップウィザード）
  configGetApiBase: () => ipcRenderer.invoke('config:getApiBase'),
  configSetApiBase: (url: string) => ipcRenderer.invoke('config:setApiBase', url),
  configSetSharedServer: () => ipcRenderer.invoke('config:setSharedServer'),
  configIsSharedServer: () => ipcRenderer.invoke('config:isSharedServer'),
  configIsSetupCompleted: () => ipcRenderer.invoke('config:isSetupCompleted'),
  configCompleteSetup: () => ipcRenderer.invoke('config:completeSetup'),
  configTestConnection: (url: string) => ipcRenderer.invoke('config:testConnection', url),
});
