export type VersionId = string;
export type OrganizationId = string;
export type UserId = string;
export type IsoTimestamp = string; // ISO/timestamptz-compatible string.
export type DatabaseProvider = "sqlite" | "supabase";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonRecord = Record<string, unknown>;

export interface SupabaseDatabaseConfig {
  url: string;
  serviceRoleKey: string;
  schema: string;
  orgId?: OrganizationId;
}

export interface DatabaseConfig {
  provider: DatabaseProvider;
  supabase: SupabaseDatabaseConfig;
}

export interface AssistantVersion {
  id: VersionId;
  name: string;
  description?: string;
  enabled?: boolean;
  sourceDirs?: string[];
  workingDirectory?: string;
  metadata?: JsonRecord;
  created_at?: IsoTimestamp | null;
  updated_at?: IsoTimestamp | null;
}

export interface KnowledgeSource {
  id: string;
  org_id?: OrganizationId | null;
  version_id: VersionId;
  source_key: string;
  source_type: string;
  relative_path?: string | null;
  display_name?: string | null;
  metadata?: JsonRecord;
  created_at?: IsoTimestamp | null;
  updated_at?: IsoTimestamp | null;
}

export interface AskEvent {
  id?: string;
  org_id?: OrganizationId | null;
  event_key: string;
  created_at: IsoTimestamp;
  version_id: VersionId;
  version_name?: string | null;
  operator?: string | null;
  operator_hash?: string | null;
  question: string;
  normalized_question?: string | null;
  question_hash?: string | null;
  answer_preview?: string | null;
  category?: string | null;
  elapsed_ms?: number | null;
  queue_wait_ms?: number | null;
  quick_reply?: boolean;
  history_message_count?: number | null;
  source_count?: number | null;
  model_names_json?: unknown[];
  num_turns?: number | null;
  total_cost_usd?: number | null;
  remote_address_hash?: string | null;
  user_agent_hash?: string | null;
  raw_event_json?: JsonRecord;
}

export interface QuestionInsight {
  id: string;
  org_id?: OrganizationId | null;
  version_id: VersionId;
  version_name?: string | null;
  operator?: string | null;
  operator_hash?: string | null;
  question?: string;
  question_preview?: string | null;
  redacted_question?: string | null;
  normalized_question: string;
  question_hash: string;
  answer_preview?: string | null;
  answer_status?: string | null;
  knowledge_hit_status?: string | null;
  is_knowledge_gap?: boolean;
  category_l1?: string | null;
  category_l2?: string | null;
  intent?: string | null;
  scenario?: string | null;
  is_version_related?: boolean;
  is_platform_improvement_signal?: boolean;
  elapsed_ms?: number | null;
  queue_wait_ms?: number | null;
  source_count?: number | null;
  model_names_json?: unknown[];
  num_turns?: number | null;
  total_cost_usd?: number | null;
  remote_address_hash?: string | null;
  user_agent_hash?: string | null;
  raw_event_json?: JsonRecord;
  asked_at?: IsoTimestamp | null;
  created_at: IsoTimestamp;
}

export interface QuestionCluster {
  cluster_id: string;
  org_id?: OrganizationId | null;
  version_id: VersionId;
  title: string;
  representative_question?: string | null;
  question_hash?: string | null;
  category_l1?: string | null;
  category_l2?: string | null;
  question_count: number;
  first_seen_at?: IsoTimestamp | null;
  last_seen_at?: IsoTimestamp | null;
  versions_json?: unknown[];
  sample_question_ids_json?: string[];
  status?: string | null;
  updated_at?: IsoTimestamp | null;
  created_at?: IsoTimestamp | null;
}

export interface InsightReport {
  report_id: string;
  org_id?: OrganizationId | null;
  type: string;
  title: string;
  version_id?: VersionId | "all";
  range_start?: IsoTimestamp | null;
  range_end?: IsoTimestamp | null;
  status: string;
  llm_enhanced?: boolean;
  llm_status?: string | null;
  generated_at: IsoTimestamp;
  report_json?: JsonRecord;
  markdown?: string;
  metrics_json?: JsonRecord;
  created_at?: IsoTimestamp | null;
  updated_at?: IsoTimestamp | null;
}

export interface ImprovementSuggestion {
  id: string;
  org_id?: OrganizationId | null;
  report_id?: string | null;
  type: string;
  title: string;
  description?: string;
  priority?: string | null;
  priority_score?: number | null;
  status: string;
  status_note?: string | null;
  related_cluster_ids_json?: string[];
  evidence_json?: JsonRecord;
  created_at: IsoTimestamp;
  updated_at?: IsoTimestamp | null;
}

export interface FaqCandidate {
  id: string;
  org_id?: OrganizationId | null;
  report_id?: string | null;
  cluster_id?: string | null;
  question: string;
  answer?: string;
  confidence_score?: number | null;
  status: string;
  evidence_json?: JsonRecord;
  created_at: IsoTimestamp;
  updated_at?: IsoTimestamp | null;
}

export interface SkillCandidate {
  id: string;
  org_id?: OrganizationId | null;
  report_id?: string | null;
  name: string;
  description?: string;
  trigger_examples_json?: string[];
  source_cluster_ids_json?: string[];
  status: string;
  confidence_score?: number | null;
  created_at: IsoTimestamp;
  updated_at?: IsoTimestamp | null;
}

export interface InsightJob {
  id: string;
  org_id?: OrganizationId | null;
  type: string;
  status: string;
  report_id?: string | null;
  version_id?: VersionId | "all";
  range_start?: IsoTimestamp | null;
  range_end?: IsoTimestamp | null;
  requested_at?: IsoTimestamp | null;
  started_at?: IsoTimestamp | null;
  finished_at?: IsoTimestamp | null;
  error_message?: string | null;
  options_json?: JsonRecord;
  created_at: IsoTimestamp;
  updated_at?: IsoTimestamp | null;
}

export interface InsightLlmRun {
  id: string;
  org_id?: OrganizationId | null;
  report_id?: string | null;
  job_id?: string | null;
  provider?: string | null;
  model?: string | null;
  status: string;
  prompt_chars?: number | null;
  completion_chars?: number | null;
  elapsed_ms?: number | null;
  error_message?: string | null;
  metadata_json?: JsonRecord;
  created_at: IsoTimestamp;
}

export interface RunStep {
  id: string;
  org_id?: OrganizationId | null;
  ask_event_id?: string | null;
  step_type: string;
  status: string;
  title?: string | null;
  detail?: string | null;
  payload?: JsonRecord;
  started_at?: IsoTimestamp | null;
  finished_at?: IsoTimestamp | null;
  created_at: IsoTimestamp;
}
