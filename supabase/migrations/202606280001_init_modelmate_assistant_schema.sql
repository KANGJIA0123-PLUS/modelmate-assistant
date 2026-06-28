create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profiles.org_id
  from public.profiles
  where profiles.id = auth.uid()
  limit 1
$$;

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_org_id is not null
    and target_org_id = public.current_profile_org_id()
$$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  slug text unique,
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'operator' check (role in ('admin', 'operator', 'viewer')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.versions (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  description text not null default '',
  status text not null default 'active',
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_sources (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  version_id text not null references public.versions(id) on delete cascade,
  source_key text not null default '',
  source_type text not null default 'local',
  relative_path text not null default '',
  display_name text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, version_id, source_key)
);

create table if not exists public.ask_events (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version_id text not null references public.versions(id) on delete restrict,
  version_name text not null default '',
  operator text not null default '',
  operator_hash text not null default '',
  question text not null default '',
  normalized_question text not null default '',
  question_hash text not null default '',
  answer_preview text not null default '',
  category text not null default '',
  elapsed_ms integer not null default 0,
  quick_reply boolean not null default false,
  history_message_count integer not null default 0,
  source_count integer not null default 0,
  model_names_json jsonb not null default '[]'::jsonb,
  num_turns integer,
  total_cost_usd numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  unique (org_id, event_key)
);

create table if not exists public.run_steps (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  ask_event_id text references public.ask_events(id) on delete cascade,
  step_type text not null default '',
  status text not null default 'pending',
  title text not null default '',
  detail text not null default '',
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  ask_event_id text references public.ask_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version_id text not null references public.versions(id) on delete restrict,
  version_name text not null default '',
  operator text not null default '',
  operator_hash text not null default '',
  question text not null default '',
  question_preview text not null default '',
  redacted_question text not null default '',
  normalized_question text not null default '',
  question_hash text not null default '',
  answer_preview text not null default '',
  answer_status text not null default 'unknown',
  knowledge_hit_status text not null default 'unknown',
  is_knowledge_gap boolean not null default false,
  category_l1 text not null default 'other',
  category_l2 text not null default 'unclear',
  intent text not null default '',
  scenario text not null default '',
  is_version_related boolean not null default false,
  is_platform_improvement_signal boolean not null default false,
  elapsed_ms integer not null default 0,
  queue_wait_ms integer not null default 0,
  source_count integer not null default 0,
  model_names_json jsonb not null default '[]'::jsonb,
  num_turns integer,
  total_cost_usd numeric(12, 6),
  remote_address_hash text not null default '',
  user_agent_hash text not null default '',
  raw_event_json jsonb not null default '{}'::jsonb
);

create table if not exists public.question_clusters (
  cluster_id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  version_id text not null references public.versions(id) on delete restrict,
  title text not null,
  representative_question text not null default '',
  question_hash text not null default '',
  category_l1 text not null default 'other',
  category_l2 text not null default 'unclear',
  question_count integer not null default 0,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  versions_json jsonb not null default '[]'::jsonb,
  sample_question_ids_json jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insight_reports (
  report_id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  version_id text not null default 'all',
  range_start timestamptz not null,
  range_end timestamptz not null,
  status text not null default 'ready',
  llm_enhanced boolean not null default false,
  llm_status text not null default 'disabled',
  generated_at timestamptz not null default now(),
  report_json jsonb not null default '{}'::jsonb,
  markdown text not null default '',
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.improvement_suggestions (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  report_id text references public.insight_reports(report_id) on delete set null,
  type text not null default 'platform',
  title text not null,
  description text not null default '',
  priority text not null default 'P3',
  priority_score double precision not null default 0,
  status text not null default 'open',
  status_note text not null default '',
  related_cluster_ids_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.faq_candidates (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  report_id text references public.insight_reports(report_id) on delete set null,
  cluster_id text references public.question_clusters(cluster_id) on delete set null,
  question text not null,
  answer_summary text not null default '',
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_candidates (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  report_id text references public.insight_reports(report_id) on delete set null,
  title text not null,
  trigger_scenario text not null default '',
  input_summary text not null default '',
  output_summary text not null default '',
  evidence_json jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insight_jobs (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  status text not null,
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.insight_llm_runs (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  purpose text not null,
  input_hash text not null,
  status text not null,
  elapsed_ms integer not null default 0,
  model_names_json jsonb not null default '[]'::jsonb,
  error_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_chunks (
  id text primary key default gen_random_uuid()::text,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  version_id text not null references public.versions(id) on delete cascade,
  source_id text references public.knowledge_sources(id) on delete set null,
  source_path text not null default '',
  title text not null default '',
  content text not null default '',
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_org on public.profiles (org_id);
create index if not exists idx_versions_org_status on public.versions (org_id, status);
create index if not exists idx_knowledge_sources_org_version on public.knowledge_sources (org_id, version_id);
create index if not exists idx_ask_events_org_created on public.ask_events (org_id, created_at desc);
create index if not exists idx_ask_events_version_created on public.ask_events (version_id, created_at desc);
create index if not exists idx_ask_events_version_question_hash on public.ask_events (version_id, question_hash);
create index if not exists idx_ask_events_version_category on public.ask_events (version_id, category);
create index if not exists idx_run_steps_ask_event_created on public.run_steps (ask_event_id, created_at);
create index if not exists idx_questions_org_created on public.questions (org_id, created_at desc);
create index if not exists idx_questions_version_created on public.questions (version_id, created_at desc);
create index if not exists idx_questions_version_question_hash on public.questions (version_id, question_hash);
create index if not exists idx_questions_category on public.questions (category_l1, category_l2);
create index if not exists idx_question_clusters_org_version on public.question_clusters (org_id, version_id);
create index if not exists idx_question_clusters_version_count on public.question_clusters (version_id, question_count desc, last_seen_at desc);
create index if not exists idx_insight_reports_org_created on public.insight_reports (org_id, created_at desc);
create index if not exists idx_insight_reports_type_generated on public.insight_reports (type, generated_at desc);
create index if not exists idx_improvement_suggestions_org_status on public.improvement_suggestions (org_id, status);
create index if not exists idx_improvement_suggestions_status_priority on public.improvement_suggestions (status, priority_score desc, updated_at desc);
create index if not exists idx_faq_candidates_org_status on public.faq_candidates (org_id, status);
create index if not exists idx_skill_candidates_org_status on public.skill_candidates (org_id, status);
create index if not exists idx_insight_jobs_org_status_created on public.insight_jobs (org_id, status, created_at desc);
create index if not exists idx_insight_llm_runs_org_created on public.insight_llm_runs (org_id, created_at desc);
create index if not exists idx_knowledge_chunks_org_version on public.knowledge_chunks (org_id, version_id);
create index if not exists idx_knowledge_chunks_content_hash on public.knowledge_chunks (content_hash);
create index if not exists idx_knowledge_chunks_source_id on public.knowledge_chunks (source_id);
create index if not exists idx_knowledge_chunks_content_trgm on public.knowledge_chunks using gin (content gin_trgm_ops);

drop trigger if exists set_updated_at on public.organizations;
create trigger set_updated_at before update on public.organizations for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.versions;
create trigger set_updated_at before update on public.versions for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.knowledge_sources;
create trigger set_updated_at before update on public.knowledge_sources for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.ask_events;
create trigger set_updated_at before update on public.ask_events for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.run_steps;
create trigger set_updated_at before update on public.run_steps for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.questions;
create trigger set_updated_at before update on public.questions for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.question_clusters;
create trigger set_updated_at before update on public.question_clusters for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.insight_reports;
create trigger set_updated_at before update on public.insight_reports for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.improvement_suggestions;
create trigger set_updated_at before update on public.improvement_suggestions for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.faq_candidates;
create trigger set_updated_at before update on public.faq_candidates for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.skill_candidates;
create trigger set_updated_at before update on public.skill_candidates for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.insight_jobs;
create trigger set_updated_at before update on public.insight_jobs for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.insight_llm_runs;
create trigger set_updated_at before update on public.insight_llm_runs for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.knowledge_chunks;
create trigger set_updated_at before update on public.knowledge_chunks for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.versions enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.ask_events enable row level security;
alter table public.run_steps enable row level security;
alter table public.questions enable row level security;
alter table public.question_clusters enable row level security;
alter table public.insight_reports enable row level security;
alter table public.improvement_suggestions enable row level security;
alter table public.faq_candidates enable row level security;
alter table public.skill_candidates enable row level security;
alter table public.insight_jobs enable row level security;
alter table public.insight_llm_runs enable row level security;
alter table public.knowledge_chunks enable row level security;

drop policy if exists organizations_select_own_org on public.organizations;
create policy organizations_select_own_org
  on public.organizations
  for select
  to authenticated
  using (id = public.current_profile_org_id());

drop policy if exists profiles_select_own_or_org on public.profiles;
create policy profiles_select_own_or_org
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() or org_id = public.current_profile_org_id());

drop policy if exists versions_select_own_org on public.versions;
create policy versions_select_own_org on public.versions for select to authenticated using (public.is_org_member(org_id));

drop policy if exists knowledge_sources_select_own_org on public.knowledge_sources;
create policy knowledge_sources_select_own_org on public.knowledge_sources for select to authenticated using (public.is_org_member(org_id));

drop policy if exists ask_events_select_own_org on public.ask_events;
create policy ask_events_select_own_org on public.ask_events for select to authenticated using (public.is_org_member(org_id));

drop policy if exists run_steps_select_own_org on public.run_steps;
create policy run_steps_select_own_org on public.run_steps for select to authenticated using (public.is_org_member(org_id));

drop policy if exists questions_select_own_org on public.questions;
create policy questions_select_own_org on public.questions for select to authenticated using (public.is_org_member(org_id));

drop policy if exists question_clusters_select_own_org on public.question_clusters;
create policy question_clusters_select_own_org on public.question_clusters for select to authenticated using (public.is_org_member(org_id));

drop policy if exists insight_reports_select_own_org on public.insight_reports;
create policy insight_reports_select_own_org on public.insight_reports for select to authenticated using (public.is_org_member(org_id));

drop policy if exists improvement_suggestions_select_own_org on public.improvement_suggestions;
create policy improvement_suggestions_select_own_org on public.improvement_suggestions for select to authenticated using (public.is_org_member(org_id));

drop policy if exists faq_candidates_select_own_org on public.faq_candidates;
create policy faq_candidates_select_own_org on public.faq_candidates for select to authenticated using (public.is_org_member(org_id));

drop policy if exists skill_candidates_select_own_org on public.skill_candidates;
create policy skill_candidates_select_own_org on public.skill_candidates for select to authenticated using (public.is_org_member(org_id));

drop policy if exists insight_jobs_select_own_org on public.insight_jobs;
create policy insight_jobs_select_own_org on public.insight_jobs for select to authenticated using (public.is_org_member(org_id));

drop policy if exists insight_llm_runs_select_own_org on public.insight_llm_runs;
create policy insight_llm_runs_select_own_org on public.insight_llm_runs for select to authenticated using (public.is_org_member(org_id));

drop policy if exists knowledge_chunks_select_own_org on public.knowledge_chunks;
create policy knowledge_chunks_select_own_org on public.knowledge_chunks for select to authenticated using (public.is_org_member(org_id));
