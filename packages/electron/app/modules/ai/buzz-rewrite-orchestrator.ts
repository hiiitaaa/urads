/**
 * バズ自動リライト: 手動トリガーのオーケストレーション
 * scraped_post_id + account_id を受け、Worker から情報取得 → skill 実行 →
 * ガードレール → 下書き保存までを1本で通す。
 */
import { net } from 'electron';
import {
  filterVariantsByGuardrail,
  pickDefaultVariant,
  type BuzzRewriteSkillInput,
  type BuzzRewriteSkillOutput,
  type RewriteMetadata,
  type RewriteRunResult,
} from '@urads/shared';
import type { AiExecutor } from '@urads/shared';
import { getApiBase } from '../config/api-base';
import { createLogger } from '../../unified-logger';

const log = createLogger('ai');

export interface RunBuzzRewriteInput {
  scraped_post_id: string;
  account_id: string;
}

interface ScrapedPostWithBenchmark {
  id: string;
  benchmark_id: string;
  threads_post_id: string;
  content: string | null;
  media_type: string | null;
  likes: number;
  replies: number;
  reposts: number;
  posted_at: number | null;
  benchmark_handle: string;
}

interface PersonaResponse {
  account_id: string;
  content: string;
  schema_version: number;
  hash: string;
  updated_at: number;
  created_at: number;
}

async function fetchJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  try {
    const res = await net.fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, detail: text };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function runBuzzRewrite(
  executor: AiExecutor,
  input: RunBuzzRewriteInput,
): Promise<RewriteRunResult> {
  const apiBase = getApiBase();

  // 1. scraped_post + benchmark 取得
  const spRes = await fetchJson<{ post: ScrapedPostWithBenchmark }>(
    `${apiBase}/research/scraped-posts/${encodeURIComponent(input.scraped_post_id)}`,
  );
  if (!spRes.ok) {
    if (spRes.status === 404) {
      return { ok: false, skipped: false, error: 'scraped_post not found' };
    }
    return { ok: false, skipped: false, error: `scraped_post fetch failed: ${spRes.detail}` };
  }
  const post = spRes.data.post;
  if (!post.content) {
    return { ok: false, skipped: true, reason: 'skill_error', detail: 'post content is empty' };
  }

  // 2. persona 取得
  const personaRes = await fetchJson<PersonaResponse>(
    `${apiBase}/accounts/${encodeURIComponent(input.account_id)}/persona`,
  );
  if (!personaRes.ok) {
    if (personaRes.status === 404) {
      return { ok: false, skipped: true, reason: 'persona_not_set' };
    }
    return { ok: false, skipped: false, error: `persona fetch failed: ${personaRes.detail}` };
  }
  const persona = personaRes.data;

  // 3. buzz-rewrite skill 実行
  const skillInput: BuzzRewriteSkillInput = {
    post: {
      content: post.content,
      likes: post.likes ?? 0,
      replies: post.replies ?? 0,
      reposts: post.reposts ?? 0,
      posted_at: post.posted_at,
      media_type: post.media_type,
      benchmark_handle: post.benchmark_handle,
    },
    persona: persona.content,
  };

  log.info(`runBuzzRewrite start sp=${input.scraped_post_id} acc=${input.account_id}`);
  const skillRes = await executor.runSkill<BuzzRewriteSkillOutput>('buzz-rewrite', skillInput);

  if (!skillRes.ok || !skillRes.data) {
    const code = skillRes.error?.code ?? 'EXEC_ERROR';
    const msg = skillRes.error?.message ?? 'unknown';
    log.warn(`runBuzzRewrite skill failed: ${code} ${msg}`);
    const reason = code === 'INVALID_OUTPUT' ? 'invalid_skill_output' : 'skill_error';
    return { ok: false, skipped: true, reason, detail: `${code}: ${msg}` };
  }

  const out = skillRes.data;
  if (!out.proceed) {
    log.info(`runBuzzRewrite proceed=false: ${out.skip_reason}`);
    return { ok: false, skipped: true, reason: 'ng_violation', detail: out.skip_reason };
  }

  if (!Array.isArray(out.variants) || out.variants.length === 0) {
    return { ok: false, skipped: true, reason: 'invalid_skill_output', detail: 'variants empty' };
  }

  // 4. ガードレール適用
  const { passed, failed } = filterVariantsByGuardrail(out.variants, post.content);
  log.info(`guardrail: passed=${passed.length} failed=${failed.length}`);
  if (passed.length === 0) {
    return {
      ok: false,
      skipped: true,
      reason: 'all_failed_guardrail',
      detail: `${failed.length} variants all rejected`,
    };
  }

  const chosen = pickDefaultVariant(passed);
  if (!chosen) {
    return { ok: false, skipped: true, reason: 'all_failed_guardrail' };
  }

  // 5. rewrite_metadata 組み立て
  const metadata: RewriteMetadata = {
    benchmark_handle: post.benchmark_handle,
    original_preview: post.content.slice(0, 80),
    variants: [...passed, ...failed], // 全結果保存（UI で切り替え可）
    persona_hash: persona.hash,
    persona_schema_version: persona.schema_version,
    theme_remapped: out.theme_remapped ?? false,
    original_theme: out.original_theme,
    target_theme: out.target_theme,
    element_analysis: out.element_analysis,
    generated_at: Date.now(),
  };

  // 6. Worker へ保存
  const saveUrl = `${apiBase}/posts/rewrite-draft`;
  try {
    const res = await net.fetch(saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: input.account_id,
        content: chosen.content,
        source_scraped_post_id: input.scraped_post_id,
        persona_hash: persona.hash,
        rewrite_metadata: metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log.error(`save draft failed: ${res.status} ${text}`);
      return { ok: false, skipped: false, error: `draft save failed: ${res.status}` };
    }
    const saved = (await res.json()) as { id: string; created: boolean };
    log.info(`runBuzzRewrite saved draft=${saved.id} created=${saved.created}`);
    return {
      ok: true,
      draft_id: saved.id,
      already_existed: !saved.created,
      variants_saved: passed.length,
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
