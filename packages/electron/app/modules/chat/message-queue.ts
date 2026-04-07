/**
 * メッセージキュー — 同時送信防止
 * FIFOで順次処理。concurrent send()を防ぐ。
 */

interface ChatResult {
  text: string;
  error?: string;
}

type MessageHandler = (payload: { message?: string; skill?: string }) => Promise<ChatResult>;

interface QueueItem {
  payload: { message?: string; skill?: string };
  resolve: (result: ChatResult) => void;
  reject: (error: Error) => void;
}

export class MessageQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private handler: MessageHandler;

  constructor(handler: MessageHandler) {
    this.handler = handler;
  }

  enqueue(payload: { message?: string; skill?: string }): Promise<ChatResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        const result = await this.handler(item.payload);
        item.resolve(result);
      } catch (err) {
        item.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }
}
