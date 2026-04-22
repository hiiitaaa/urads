import type { GuardrailResult } from './guardrail.js';

export interface BuzzRewriteSkillInput {
  post: {
    content: string;
    likes: number;
    replies: number;
    reposts: number;
    posted_at: number | null;
    media_type: string | null;
    benchmark_handle: string;
  };
  persona: string;
}

export interface BuzzRewriteVariant {
  content: string;
  reasoning: string;
  is_default?: boolean;
  self_eval?: {
    plagiarism_score?: number;
    tone_match?: string;
    threads_fit?: string;
  };
}

export interface BuzzRewriteSkillOutput {
  proceed: boolean;
  skip_reason?: string;
  theme_remapped?: boolean;
  original_theme?: string;
  target_theme?: string;
  variants: BuzzRewriteVariant[];
  element_analysis?: Record<string, unknown>;
}

export type SavedRewriteVariant = BuzzRewriteVariant & {
  guardrail: GuardrailResult;
};

export interface RewriteMetadata {
  benchmark_handle: string;
  original_preview: string;
  variants: SavedRewriteVariant[];
  persona_hash: string;
  persona_schema_version: number;
  theme_remapped: boolean;
  original_theme?: string;
  target_theme?: string;
  element_analysis?: Record<string, unknown>;
  generated_at: number;
}

export type RewriteSkipReason =
  | 'persona_not_set'
  | 'ng_violation'
  | 'all_failed_guardrail'
  | 'skill_error'
  | 'invalid_skill_output';

export type RewriteRunResult =
  | { ok: true; draft_id: string; already_existed: boolean; variants_saved: number }
  | { ok: false; skipped: true; reason: RewriteSkipReason; detail?: string }
  | { ok: false; skipped: false; error: string };
