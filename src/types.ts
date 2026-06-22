export type AgentStatus = "draft" | "trained" | "published";
export type ViewName = "matrix" | "agents" | "knowledge" | "rules" | "tools" | "evaluation" | "api" | "detail";

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

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
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
}

export interface ToolAsset {
  id: string;
  name: string;
  category: "检索" | "规则" | "生成" | "路由" | "人工复核" | "接口";
  description: string;
  status: "启用" | "停用";
  linkedAgentIds: string[];
  endpoint: string;
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
  tools: ToolItem[];
  workflow: WorkflowStep[];
  knowledgeIds: string[];
  rules: RuleItem[];
  beforeReport: TrainingReport;
  afterReport: TrainingReport;
  trace: string[];
  timeline: TimelineItem[];
  apiCalls: ApiCall[];
  testCases: TestCase[];
  shallow?: boolean;
}

export interface AppState {
  agents: Agent[];
  docs: KnowledgeDoc[];
  rules: RuleLibraryItem[];
  tools: ToolAsset[];
  evalRuns: EvalRun[];
  apiKeys: ApiKeyRecord[];
}
