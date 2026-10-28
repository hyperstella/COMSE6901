import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The prompt chain an upload runs through, as configured in the admin panel
 * (supabase/observability.sql): which chain (picked from prompt_chain_mix by
 * weight), its steps with their prompts and models, and the glossary terms
 * and example profiles the writer step may draw on.
 *
 * Server only (service role). Returns null whenever the tables are missing,
 * no chain has a weight, or anything fails, so callers fall back to the
 * prompts and provider in the code.
 */

export type ProviderConfig = {
  slug: string;
  name: string;
  baseUrl: string;
  authKind: "api_key" | "oidc" | "none";
  apiKeyEnv: string | null;
};

export type ModelConfig = {
  id: string;
  name: string;
  provider: ProviderConfig;
  reasoningEffort: string | null;
  supportsVision: boolean;
};

export type StepConfig = {
  id: string;
  kind: "describe" | "write";
  systemPrompt: string;
  userPrompt: string | null;
  temperature: number;
  maxTokens: number;
  model: ModelConfig | null;
  fallbackModel: ModelConfig | null;
};

export type Term = { term: string; definition: string; category: string };

export type Example = { title: string; notes: string; profile: unknown };

export type ChainConfig = {
  chain: { id: string; slug: string; name: string };
  steps: StepConfig[];
  terms: Term[];
  examples: Example[];
};

type MixRow = { chain_id: string; weight: number };
type ChainRow = { id: string; slug: string; name: string; is_active: boolean };
type StepRow = {
  id: string;
  kind: "describe" | "write";
  position: number;
  system_prompt: string;
  user_prompt: string | null;
  temperature: number;
  max_tokens: number;
  model_id: string | null;
  fallback_model_id: string | null;
};
type ModelRow = {
  id: string;
  name: string;
  supports_vision: boolean;
  reasoning_effort: string | null;
  is_active: boolean;
  llm_providers: {
    slug: string;
    name: string;
    base_url: string;
    auth_kind: "api_key" | "oidc" | "none";
    api_key_env: string | null;
    is_active: boolean;
  } | null;
};

/** Picks one entry with probability weight / total. */
function pickWeighted<T extends { weight: number }>(rows: T[]): T | null {
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const row of rows) {
    r -= row.weight;
    if (r < 0) return row;
  }
  return rows[rows.length - 1] ?? null;
}

function toModel(row: ModelRow | undefined): ModelConfig | null {
  if (!row || !row.is_active || !row.llm_providers || !row.llm_providers.is_active) return null;
  const p = row.llm_providers;
  return {
    id: row.id,
    name: row.name,
    provider: { slug: p.slug, name: p.name, baseUrl: p.base_url, authKind: p.auth_kind, apiKeyEnv: p.api_key_env },
    reasoningEffort: row.reasoning_effort,
    supportsVision: row.supports_vision,
  };
}

export async function loadChain(admin: SupabaseClient): Promise<ChainConfig | null> {
  try {
    const [{ data: mix, error: mixError }, { data: chains, error: chainError }] = await Promise.all([
      admin.from("prompt_chain_mix").select("chain_id, weight").gt("weight", 0).returns<MixRow[]>(),
      admin.from("prompt_chains").select("id, slug, name, is_active").eq("is_active", true).returns<ChainRow[]>(),
    ]);
    if (mixError || chainError || !mix?.length || !chains?.length) return null;

    const byId = new Map(chains.map((c) => [c.id, c]));
    const pick = pickWeighted(mix.filter((m) => byId.has(m.chain_id)));
    if (!pick) return null;
    const chain = byId.get(pick.chain_id)!;

    const [{ data: steps, error: stepError }, { data: models }, { data: terms }, { data: examples }] = await Promise.all([
      admin
        .from("prompt_chain_steps")
        .select("id, kind, position, system_prompt, user_prompt, temperature, max_tokens, model_id, fallback_model_id")
        .eq("chain_id", chain.id)
        .order("position")
        .returns<StepRow[]>(),
      admin
        .from("llm_models")
        .select("id, name, supports_vision, reasoning_effort, is_active, llm_providers(slug, name, base_url, auth_kind, api_key_env, is_active)")
        .returns<ModelRow[]>(),
      admin.from("terms").select("term, definition, category").eq("is_active", true).order("term").returns<Term[]>(),
      admin.from("ai_generation_examples").select("title, notes, profile").eq("is_active", true).order("created_at").returns<Example[]>(),
    ]);
    if (stepError || !steps?.length) return null;

    const modelById = new Map((models ?? []).map((m) => [m.id, m]));
    return {
      chain: { id: chain.id, slug: chain.slug, name: chain.name },
      steps: steps.map((s) => ({
        id: s.id,
        kind: s.kind,
        systemPrompt: s.system_prompt,
        userPrompt: s.user_prompt,
        temperature: s.temperature,
        maxTokens: s.max_tokens,
        model: toModel(s.model_id ? modelById.get(s.model_id) : undefined),
        fallbackModel: toModel(s.fallback_model_id ? modelById.get(s.fallback_model_id) : undefined),
      })),
      terms: terms ?? [],
      examples: examples ?? [],
    };
  } catch (error) {
    console.error("loadChain failed; using the prompts in the code", error);
    return null;
  }
}
