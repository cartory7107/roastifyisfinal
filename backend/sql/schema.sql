-- Rostify schema (spec v2) — run in Supabase SQL Editor (Phase 1, step 5)

create extension if not exists "pgcrypto";

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  -- 'crawl_target' | 'niche' | 'technical' | 'ai_readiness'
  -- | 'performance' | 'competitor' | 'crawl_competitors'
  -- | 'onpage' | 'content' | 'offpage' | 'vision'
  -- | 'synthesize' | 'pdf'
  current_step text,
  target_url text not null,

  niche jsonb,                    -- { category, location, keywords[] }
  competitors jsonb,              -- [{ url, title, snippet, da }]

  crawl_data jsonb,               -- { target: CrawlData, competitors: CrawlData[] }

  technical_analysis jsonb,       -- CategoryAnalysis
  onpage_analysis jsonb,
  content_analysis jsonb,
  performance_analysis jsonb,
  offpage_analysis jsonb,
  ai_readiness_analysis jsonb,

  final_report jsonb,             -- FinalReport
  pdf_url text,

  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists audits_status_idx on audits(status);

alter table audits enable row level security;
-- No policies on purpose: backend uses the service role key, browsers never touch the DB.

-- Storage buckets to create in the Supabase dashboard:
--   screenshots  -> {audit_id}/{site}-{device}.png
--   reports      -> {audit_id}/report.pdf
