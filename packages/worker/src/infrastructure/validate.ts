/**
 * 軽量バリデーション（Zod不使用）
 */

interface ValidationError {
  field: string;
  message: string;
}

type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

/**
 * 投稿作成のバリデーション
 */
export function validateCreatePost(body: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body.account_id || typeof body.account_id !== 'string') {
    errors.push({ field: 'account_id', message: 'アカウントIDは必須です' });
  }

  if (!body.content || typeof body.content !== 'string') {
    errors.push({ field: 'content', message: '投稿内容は必須です' });
  } else if ((body.content as string).trim().length === 0) {
    errors.push({ field: 'content', message: '投稿内容が空です' });
  } else if ((body.content as string).length > 500) {
    errors.push({ field: 'content', message: '投稿内容は500文字以内にしてください' });
  }

  if (body.scheduled_at !== undefined) {
    if (typeof body.scheduled_at !== 'number') {
      errors.push({ field: 'scheduled_at', message: '予約日時は数値で指定してください' });
    } else {
      const now = Date.now();
      if (body.scheduled_at <= now) {
        errors.push({ field: 'scheduled_at', message: '予約日時は未来の日時を指定してください' });
      }
      const maxFuture = now + 30 * 24 * 60 * 60 * 1000; // 30日先
      if (body.scheduled_at > maxFuture) {
        errors.push({ field: 'scheduled_at', message: '予約日時は30日以内に設定してください' });
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * リプライルール作成のバリデーション
 */
export function validateCreateReplyRule(body: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];

  if (!body.account_id || typeof body.account_id !== 'string') {
    errors.push({ field: 'account_id', message: 'アカウントIDは必須です' });
  }

  if (!body.threads_post_id || typeof body.threads_post_id !== 'string') {
    errors.push({ field: 'threads_post_id', message: '対象投稿の指定は必須です' });
  }

  if (!body.type || !['keyword_match', 'random'].includes(body.type as string)) {
    errors.push({ field: 'type', message: 'typeは keyword_match または random を指定してください' });
  }

  if (!body.config || typeof body.config !== 'object') {
    errors.push({ field: 'config', message: 'configは必須です' });
  } else {
    const config = body.config as Record<string, unknown>;

    if (body.type === 'keyword_match') {
      if (!Array.isArray(config.triggers) || config.triggers.length === 0) {
        errors.push({ field: 'config.triggers', message: 'トリガーキーワードは1つ以上必要です' });
      }
      if (!config.response || typeof config.response !== 'string') {
        errors.push({ field: 'config.response', message: '返信テキストは必須です' });
      }
    }

    if (body.type === 'random') {
      if (!Array.isArray(config.responses) || config.responses.length === 0) {
        errors.push({ field: 'config.responses', message: '返信パターンは1つ以上必要です' });
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
