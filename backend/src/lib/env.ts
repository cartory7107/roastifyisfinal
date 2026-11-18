import { z } from "zod";

/**
 * Runtime configuration, validated once at boot. Optional third-party keys are
 * allowed to be absent — the pipeline degrades gracefully — but a production
 * boot refuses to start without PocketBase, because every audit write would
 * fail anyway.
 */
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),

  POCKETBASE_URL: optionalUrl,
  POCKETBASE_PUBLIC_URL: optionalUrl,
  POCKETBASE_ADMIN_EMAIL: optionalString,
  POCKETBASE_ADMIN_PASSWORD: optionalString,

  WEB_BASE_URL: optionalUrl,
  CORS_ORIGINS: optionalString,

  /** `auto` prefers Ollama Cloud when its key is set, then falls back to Groq. */
  LLM_PROVIDER: z.enum(["auto", "groq", "ollama"]).default("auto"),
  OLLAMA_API_KEY: optionalString,
  OLLAMA_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().default("https://ollama.com/v1"),
  ),
  /** Cloud model id from https://ollama.com/api/tags, e.g. `gemma4:31b`. */
  OLLAMA_MODEL: optionalString,
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: optionalString,
  /** Only applies to Groq's free tier (8K tokens/minute); raise it on a paid plan. */
  LLM_TOKENS_PER_MINUTE: z.coerce.number().int().min(1_000).default(8_000),

  SERPER_API_KEY: optionalString,
  OPENPAGERANK_API_KEY: optionalString,
  /** Optional: seodata.dev also answers anonymous, with a lower daily quota. */
  SEODATA_API_KEY: optionalString,
  /** Two-letter market for keyword volumes; seodata.dev has no `bd` data. */
  SEO_KEYWORD_COUNTRY: z.string().length(2).default("us"),

  /** Set to `true` when the API runs behind a reverse proxy / PaaS load balancer. */
  TRUST_PROXY: z
    .preprocess((value) => value === "true" || value === "1", z.boolean())
    .default(false),
  /**
   * Local development escape hatch: allow audits of localhost / private
   * networks. Must stay off in production, where it would enable SSRF.
   */
  ALLOW_PRIVATE_HOSTS: z
    .preprocess((value) => value === "true" || value === "1", z.boolean())
    .default(false),
  MAX_CONCURRENT_AUDITS: z.coerce.number().int().min(1).max(50).default(2),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${detail}`);
  }
  return Object.freeze(parsed.data);
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === "production";

/** PocketBase is the only hard dependency: without it no audit can be stored. */
export const hasPocketBaseConfig =
  env.POCKETBASE_URL !== undefined &&
  env.POCKETBASE_ADMIN_EMAIL !== undefined &&
  env.POCKETBASE_ADMIN_PASSWORD !== undefined;

export function missingPocketBaseKeys(): string[] {
  const missing: string[] = [];
  if (env.POCKETBASE_URL === undefined) missing.push("POCKETBASE_URL");
  if (env.POCKETBASE_ADMIN_EMAIL === undefined) missing.push("POCKETBASE_ADMIN_EMAIL");
  if (env.POCKETBASE_ADMIN_PASSWORD === undefined) missing.push("POCKETBASE_ADMIN_PASSWORD");
  return missing;
}

/** Browser-facing base URL for screenshot/PDF links. */
export function pocketBasePublicUrl(): string {
  return env.POCKETBASE_PUBLIC_URL ?? env.POCKETBASE_URL ?? "http://127.0.0.1:8090";
}

/**
 * Turn one configured origin into something `@fastify/cors` can match.
 *
 * A `*` wildcard is allowed so deployments can trust a whole PaaS domain
 * without listing every URL, e.g. `https://*.vercel.app` (production and every
 * preview deployment). Everything else is matched literally, so a wildcard can
 * never accidentally widen the allowlist beyond its own host suffix.
 */
export function compileOriginPattern(origin: string): string | RegExp {
  if (!origin.includes("*")) return origin;
  const escaped = origin
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** CORS allowlist: explicit `CORS_ORIGINS`, else the web app's origin. */
export function allowedOrigins(): (string | RegExp)[] {
  const origins =
    env.CORS_ORIGINS !== undefined
      ? env.CORS_ORIGINS.split(",")
      : env.WEB_BASE_URL !== undefined
        ? [env.WEB_BASE_URL.replace(/\/$/, "")]
        : ["http://localhost:3000", "http://127.0.0.1:3000"];

  return origins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(compileOriginPattern);
}

/**
 * Fail fast on misconfiguration. In production a missing PocketBase config (or
 * a wildcard-less CORS setup in dev) is fatal; optional API keys only warn.
 */
export function assertBootConfig(log: (message: string) => void): void {
  if (!hasPocketBaseConfig) {
    const message = `PocketBase is not configured. Missing env: ${missingPocketBaseKeys().join(
      ", ",
    )}. Copy .env.example to .env and fill the PocketBase keys.`;
    if (isProduction) throw new Error(message);
    log(`[config] ${message}`);
  }

  if (env.LLM_PROVIDER === "auto"
    ? env.OLLAMA_API_KEY === undefined && env.GROQ_API_KEY === undefined
    : env[env.LLM_PROVIDER === "ollama" ? "OLLAMA_API_KEY" : "GROQ_API_KEY"] === undefined) {
    log(
      "[config] No LLM API key is set — set OLLAMA_API_KEY and/or GROQ_API_KEY, otherwise AI analyses will degrade gracefully.",
    );
  }

  for (const key of ["SERPER_API_KEY", "OPENPAGERANK_API_KEY"] as const) {
    if (env[key] === undefined) {
      log(`[config] ${key} is not set — related analyses will degrade gracefully.`);
    }
  }

  if (env.SEODATA_API_KEY === undefined) {
    log(
      "[config] SEODATA_API_KEY is not set — keyword research uses the anonymous 20 lookups/day quota.",
    );
  }
}
