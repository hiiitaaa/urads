export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ENCRYPTION_KEY: string;
  THREADS_APP_ID: string;
  THREADS_APP_SECRET: string;
  THREADS_REDIRECT_URI: string;
  WEBHOOK_VERIFY_TOKEN?: string;
}
