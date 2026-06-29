export type AgentStatus = "draft" | "trained" | "published";
export type ViewName = "matrix" | "matrix-b" | "agents" | "knowledge" | "rules" | "evaluation" | "api" | "detail" | "skills";

export interface FlowItem {
  id: string;
  label: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  tags: string[];
  updatedAt: string;
  snippet: string;
  linkedAgents: string[];
}

export interface RuleItem {
  id: string;
  sourceRuleId?: string;
  title: string;
  description: string;
  priority: "高" | "中" | "低";
  enabled: boolean;
  isolationType?: "binding" | "create" | "content";
  redLineLevel?: "致命" | "严重" | "一般";           // NEW
  detectionSignal?: string;                          // NEW
  certainty?: "confirmed" | "assumed" | "pending";   // NEW
}

export interface RuleLibraryItem {
  id: string;
  title: string;
  description: string;
  priority: "高" | "中" | "低";
  category: string;
  tags: string[];
  updatedAt: string;
}

export interface ConstraintRule {
  id: string;
  ifField: string;
  ifOp: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  ifValue: string | boolean | number;
  thenField: string;
  thenMustBe: string | boolean | number;
}

export interface AnchorField {
  id: string;
  key: string;
  type: "enum" | "bool" | "text" | "number" | "list";
  options?: string[];
  required: boolean;
  description: string;
  constraintDSL?: ConstraintRule[];
}

export interface OutputAnchor {
  fields: AnchorField[];
  strict: boolean;
}

export interface RoutingRule {
  id: string;
  conditionDSL?: {
    field: string;
    op: "eq" | "neq" | "gt" | "lt";
    value: string | boolean | number;
  };
  nextStepId: string;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  skillRef?: string;
  inputFields?: string[];
  anchor?: OutputAnchor;
  routing?: RoutingRule[];
}

export interface TrainingLessonSummary {
  runId: string;
  version: string;
  fixedIssues: string[];
  failedAttempts: string[];
  suggestedFocus: string;
  time: string;
}

export interface ContextDoc {
  id: string;
  name: string;
  status: "indexing" | "ready" | "error";
  uploadedAt: string;
  sizeKB?: number;
}

export interface SkillStep {
  title: string;
  description: string;
  anchor?: OutputAnchor;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  steps: SkillStep[];
  linkedAgentCount: number;
  updatedAt: string;
}

export interface TimelineItem {
  id: string;
  title: string;
  description: string;
  time: string;
  version?: string;
  metrics?: Array<{ label: string; value: string; tone?: "green" | "amber" | "neutral" }>;
  changes?: string[];
  steps?: Array<{ title: string; detail: string; metric: string; status: "完成" | "需关注" | "记录" }>;
}

export interface ApiCall {
  id: string;
  source: string;
  result: string;
  time: string;
}

export interface TestCase {
  id: string;
  name: string;
  input: string;
  expected: string;
  status: "通过" | "待验证" | "需优化";
  judgment?: "pass" | "fail" | null;
  judgmentNote?: string;
  split?: "train" | "holdout";
  type?: "正常" | "异常" | "边界" | "对抗";        // NEW
  difficulty?: "简单" | "中等" | "困难";             // NEW
  ruleRefs?: string[];                               // NEW — RuleItem.id references
}

export interface EvalRun {
  id: string;
  agentId: string;
  suite: string;
  score: number;
  passRate: number;
  cases: number;
  failed: number;
  time: string;
  notes: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  scope: string;
  status: "启用" | "停用";
  lastUsed: string;
}

export interface TrainingReport {
  title: string;
  summary: string;
  score: number;
  bullets: string[];
  meta: Array<{ label: string; value: string }>;
}

// ── Whitebox trainable units ──────────────────────────────────────────────────

export interface InstructionSegment {
  id: string;
  label: "角色" | "任务" | "约束" | "输出格式" | "异常处理" | "处理目标";  // EXPANDED
  content: string;
  certainty?: "confirmed" | "assumed" | "pending";   // NEW
}

export interface FewShotExample {
  id: string;
  input: string;
  output: string;
}

export interface RetrievalConfig {
  topK: number;
  tagFilters: string[];
}

export interface RubricCriterion {
  id: string;
  dimension: string;
  weight: number;
  guide: string;
}

// ── Failure Cluster ────────────────────────────────────────────────────────────

export type ProposalTargetUnit = "few-shot" | "rule" | "retrieval" | "instruction" | "parameter";

export interface FailureCluster {
  id: string;
  label: string;
  caseCount: number;
  diagnosis: string;
  targetUnit: ProposalTargetUnit;
}

// ── Proposal (training diff card) ─────────────────────────────────────────────

export type ProposalStatus = "pending" | "accepted" | "edited" | "rejected";

export interface Proposal {
  id: string;
  unit: ProposalTargetUnit;
  unitLabel: string;
  before: string;
  after: string;
  reason: string;
  triggerCase: string;
  status: ProposalStatus;
  editedContent?: string;
  riskFlag?: boolean;
  clusterId?: string;
  dependsOn?: string[];
  conflictsWith?: string[];
  ruleIsolationType?: "binding" | "create" | "content";
}

// ── Agent ─────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  type: string;
  purpose: string;
  status: AgentStatus;
  version: string;
  score: number;
  matrixCellKey?: string;
  caseUploaded: boolean;
  trainedOnce: boolean;
  feedbackSaved: boolean;
  feedbackScore?: number;
  feedbackNote?: string;
  prompt: string;
  inputSchema?: string[];
  outputSchema?: string[];
  guardrails: string[];
  workflow: WorkflowStep[];
  knowledgeIds: string[];
  rules: RuleItem[];
  contextDocs?: ContextDoc[];
  beforeReport: TrainingReport;
  afterReport: TrainingReport;
  trace: string[];
  timeline: TimelineItem[];
  apiCalls: ApiCall[];
  testCases: TestCase[];
  shallow?: boolean;
  // Whitebox trainable units
  instructionSegments?: InstructionSegment[];
  fewShots?: FewShotExample[];
  retrievalConfig?: RetrievalConfig;
  rubric?: RubricCriterion[];
  judgePhase?: "human" | "parallel" | "auto";
  recentLessons?: TrainingLessonSummary[];
}

export interface AppState {
  agents: Agent[];
  docs: KnowledgeDoc[];
  rules: RuleLibraryItem[];
  evalRuns: EvalRun[];
  apiKeys: ApiKeyRecord[];
  skills: Skill[];
}
