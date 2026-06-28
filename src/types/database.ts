import type {
  AskEvent,
  FaqCandidate,
  ImprovementSuggestion,
  InsightJob,
  InsightLlmRun,
  InsightReport,
  QuestionCluster,
  QuestionInsight,
  SkillCandidate,
  VersionId
} from "./domain.js";
import type {
  CategoryItem,
  FrequentQuestionItem,
  HistoryItem
} from "./api.js";

export type MaybePromise<T> = T | Promise<T>;
export type StoreResult<T> = T | null;

export interface VersionFilter {
  versionId?: VersionId | "all";
}

export interface HistoryFilter extends VersionFilter {
  limit?: number;
  category?: string;
}

export interface FrequentFilter extends VersionFilter {
  limit?: number;
}

export interface CategoryFilter extends VersionFilter {
  limit?: number;
}

export interface QuestionFilter extends VersionFilter {
  limit?: number;
  rangeStart?: string;
  rangeEnd?: string;
  startAt?: string;
  endAt?: string;
  categoryL1?: string;
}

export interface ClusterFilter extends VersionFilter {
  limit?: number;
  rangeStart?: string;
  rangeEnd?: string;
  startAt?: string;
  endAt?: string;
}

export interface ReportFilter {
  type?: string;
  limit?: number;
}

export interface SuggestionFilter {
  status?: string;
  limit?: number;
}

export interface JobFilter {
  status?: string;
  limit?: number;
}

export interface StoreList<T> {
  enabled: boolean;
  items: T[];
}

export interface HistoryStore {
  enabled: boolean;
  reason?: string;
  record(entry: AskEvent): MaybePromise<boolean>;
  listHistory(filter: HistoryFilter): MaybePromise<StoreList<HistoryItem>>;
  listFrequent(filter: FrequentFilter): MaybePromise<StoreList<FrequentQuestionItem>>;
  listCategories(filter: CategoryFilter): MaybePromise<StoreList<CategoryItem>>;
  close?(): void;
}

export interface InsightStore {
  enabled: boolean;
  reason?: string;
  saveQuestion?(record: QuestionInsight): MaybePromise<StoreResult<QuestionInsight>>;
  upsertCluster?(cluster: QuestionCluster): MaybePromise<StoreResult<QuestionCluster>>;
  listQuestions?(filter?: QuestionFilter): MaybePromise<StoreList<QuestionInsight>>;
  listClusters?(filter?: ClusterFilter): MaybePromise<StoreList<QuestionCluster>>;
  getOverview?(filter?: QuestionFilter): MaybePromise<Record<string, unknown>>;
  saveReport?(report: InsightReport): MaybePromise<InsightReport>;
  listReports?(filter?: ReportFilter): MaybePromise<StoreList<InsightReport>>;
  getReport?(reportId: string): MaybePromise<StoreResult<InsightReport>>;
  saveSuggestion?(suggestion: ImprovementSuggestion): MaybePromise<ImprovementSuggestion>;
  listSuggestions?(filter?: SuggestionFilter): MaybePromise<StoreList<ImprovementSuggestion>>;
  updateSuggestionStatus?(id: string, status: string, note?: string): MaybePromise<StoreResult<ImprovementSuggestion>>;
  saveFaqCandidate?(candidate: FaqCandidate): MaybePromise<FaqCandidate>;
  listFaqCandidates?(filter?: ReportFilter): MaybePromise<StoreList<FaqCandidate>>;
  saveSkillCandidate?(candidate: SkillCandidate): MaybePromise<SkillCandidate>;
  listSkillCandidates?(filter?: ReportFilter): MaybePromise<StoreList<SkillCandidate>>;
  saveJob?(job: InsightJob): MaybePromise<InsightJob>;
  updateJob?(id: string, patch: Partial<InsightJob>): MaybePromise<StoreResult<InsightJob>>;
  getJob?(id: string): MaybePromise<StoreResult<InsightJob>>;
  listJobs?(filter?: JobFilter): MaybePromise<StoreList<InsightJob>>;
  saveLlmRun?(run: InsightLlmRun): MaybePromise<InsightLlmRun>;
  close?(): void;
}
