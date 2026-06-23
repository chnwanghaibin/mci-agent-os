import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Edit3,
  FileText,
  Filter,
  GitCompare,
  Grid3X3,
  Layers3,
  PlayCircle,
  Plus,
  PowerOff,
  RefreshCw,
  Rocket,
  Route,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cellKey, defaultState, functionalFlows, skills as defaultSkills, workFlows } from "./data";
import type { Agent, AgentStatus, AnchorField, ApiKeyRecord, AppState, EvalRun, FailureCluster, FewShotExample, InstructionSegment, KnowledgeDoc, Proposal, ProposalStatus, RubricCriterion, RuleItem, RuleLibraryItem, Skill, ToolAsset, ViewName } from "./types";

const STORAGE_KEY = "dgt-agent-platform-demo";

const statusCopy: Record<AgentStatus, string> = {
  draft: "待训练",
  trained: "已训练",
  published: "已发布",
};

const trainingStepCatalog = [
  {
    title: "基线评估",
    description: "在训练集和留出集上运行当前版本，按 Rubric 各维度计算基线分和失败用例列表。",
    system: "Evaluation Harness",
  },
  {
    title: "失败聚类",
    description: "对失败用例进行语义聚类，将零散失败归纳成有意义的失败主题，用于精准定向提案。",
    system: "Cluster Analyzer",
  },
  {
    title: "根因诊断",
    description: "Critic 模型分析每个失败主题的根本原因，定位到具体的白盒配置单元缺失。",
    system: "Critic Model",
  },
  {
    title: "生成改动提案",
    description: "Proposer 针对每个失败主题，生成指向白盒单元的改动 diff，附诊断理由和风险评分。",
    system: "Proposer Model",
  },
  {
    title: "提案质量过滤",
    description: "Critic 过滤低质量、重复或高风险提案，标注依赖关系，输出最终审查列表。",
    system: "Critic Filter",
  },
];
const trainingSteps = trainingStepCatalog.map((step) => step.title);
const evaluationStageCatalog = [
  {
    title: "用例集装载",
    description: "读取当前 Agent 的测试用例、状态标签和预期输出，建立本次评估样本池。",
    system: "Case Loader",
  },
  {
    title: "结构化输出校验",
    description: "检查输出字段、结论格式、风险解释和人工复核提示是否满足契约。",
    system: "Output Contract Check",
  },
  {
    title: "知识与规则命中",
    description: "核验知识片段、启用规则、优先级和工具调用证据是否可追溯。",
    system: "Evidence Auditor",
  },
  {
    title: "回归评分",
    description: "计算通过率、失败用例、质量分、稳定性和发布门槛状态。",
    system: "Regression Scorer",
  },
  {
    title: "生成评估反馈",
    description: "沉淀评估记录、问题发现和下一轮优化建议。",
    system: "Evaluation Reporter",
  },
];
const toolCategoryOptions: ToolAsset["category"][] = ["检索", "规则", "生成", "路由", "人工复核", "接口"];

type TrainingRunResult = {
  runId: string;
  versionBefore: string;
  versionAfter: string;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  passRate: number;
  cases: number;
  failed: number;
  confidence: number;
  knowledgeCoverage: number;
  rulesVerified: number;
  toolsVerified: number;
  changes: string[];
  recommendations: string[];
  steps: Array<{ title: string; detail: string; metric: string; status: "完成" | "需关注" | "记录" }>;
};

type TrainingRunState = {
  agentId: string;
  startedAt: string;
  completed: boolean;
  result: TrainingRunResult;
  proposals: Proposal[];
  clusters: FailureCluster[];
};

type ProposalReviewState = {
  agentId: string;
  proposals: Proposal[];
  clusters: FailureCluster[];
  phase: "review" | "gating" | "done";
  gateResult: {
    passed: boolean;
    trainDelta: number;
    holdoutDelta: number;
    holdoutCount: number;
    autoRejectedIds: string[];
  } | null;
  trainingResult: TrainingRunResult;
};

type EvaluationRunResult = {
  runId: string;
  version: string;
  score: number;
  passRate: number;
  cases: number;
  failed: number;
  structureScore: number;
  evidenceScore: number;
  stabilityScore: number;
  gate: "通过" | "需优化";
  notes: string;
  findings: string[];
  recommendations: string[];
  stages: Array<{ title: string; detail: string; metric: string; status: "完成" | "需关注" | "记录" }>;
};

type EvaluationRunState = {
  agentId: string;
  startedAt: string;
  completed: boolean;
  result: EvaluationRunResult;
};

type AgentBlueprint = {
  id: string;
  name: string;
  type: string;
  purpose: string;
  scenario: string;
  inputSchema: string[];
  outputSchema: string[];
  qualityTarget: number;
  latencyTarget: string;
  knowledgeIds: string[];
  ruleIds: string[];
  prompt: string;
  guardrails: string[];
  tools: Agent["tools"];
  workflow: Agent["workflow"];
  testCases: Agent["testCases"];
  trace: string[];
  beforeReport: Agent["beforeReport"];
  afterReport: Agent["afterReport"];
};

const agentBlueprints: AgentBlueprint[] = [
  {
    id: "contract",
    name: "合同审查 Agent",
    type: "合同审查",
    purpose: "审查门店现金流合约中的收益分配、披露义务、提前终止、数据授权和争议处理条款。",
    scenario: "合同登记前置审查",
    inputSchema: ["合同正文", "门店主体", "现金流口径", "披露材料版本"],
    outputSchema: ["风险等级", "命中条款", "修改建议", "人工复核点"],
    qualityTarget: 92,
    latencyTarget: "< 45s",
    knowledgeIds: ["doc-contract-standard", "doc-cashflow-asset", "doc-compliance-check"],
    ruleIds: ["rule-contract-revenue", "rule-contract-termination", "rule-contract-data-auth"],
    prompt:
      "你是滴灌通合同审查 Agent。请基于统一知识库、合同规则和业务上下文审查合同，必须输出风险等级、命中规则、修改建议和是否需要人工复核。不得生成未经验证的法律结论。",
    guardrails: ["高风险条款必须触发人工复核", "不得引用未关联知识库", "输出必须包含风险等级和修改建议", "不确定时给出缺失字段清单"],
    tools: [
      { id: "search", sourceToolId: "tool-knowledge-search", name: "知识检索", description: "检索合同审查标准、现金流资产规则和披露清单。", enabled: true },
      { id: "rule", sourceToolId: "tool-rule-check", name: "规则校验", description: "逐条命中收益分配、终止条款、数据授权等规则。", enabled: true },
      { id: "report", sourceToolId: "tool-report", name: "报告生成", description: "生成风险等级、修改建议和审查结论。", enabled: true },
      { id: "handoff", sourceToolId: "tool-human-review", name: "人工复核", description: "高风险或低置信度条款进入人工复核队列。", enabled: true },
    ],
    workflow: [
      {
        id: "w1", title: "解析合同材料", description: "抽取主体、收益口径、终止条款、授权范围和附件版本。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w1f1", key: "contract_type", type: "enum", options: ["现金流收益权", "融资租赁", "供应链票据", "其他"], required: true, description: "合同类型" },
            { id: "w1f2", key: "parties", type: "list", required: true, description: "合同各方主体名称列表" },
            { id: "w1f3", key: "key_clauses", type: "list", required: true, description: "提取到的关键条款列表（收益分配/终止/授权等）" },
            { id: "w1f4", key: "doc_version", type: "text", required: false, description: "合同/披露材料版本号" },
          ],
        },
      },
      {
        id: "w2", title: "检索业务标准", description: "按节点、条款类型和标签检索统一知识库。", enabled: true,
        anchor: {
          strict: false,
          fields: [
            { id: "w2f1", key: "matched_docs", type: "list", required: true, description: "命中知识库文档 ID 列表" },
            { id: "w2f2", key: "relevance", type: "enum", options: ["高", "中", "低"], required: true, description: "整体检索相关性评级" },
            { id: "w2f3", key: "coverage_gap", type: "bool", required: true, description: "是否存在知识库未覆盖的条款类型" },
          ],
        },
      },
      {
        id: "w3", title: "执行规则校验", description: "对收益分配、披露一致性、提前终止、争议处理逐项打标。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w3f1", key: "violated_rules", type: "list", required: true, description: "命中的规则 ID 和名称列表" },
            { id: "w3f2", key: "risk_level", type: "enum", options: ["低", "中", "高"], required: true, description: "综合规则校验后的风险等级" },
            { id: "w3f3", key: "requires_human_review", type: "bool", required: true, description: "是否需要进入人工复核队列", constraint: "若 risk_level=高 则必须为 true" },
          ],
        },
      },
      {
        id: "w4", title: "生成审查报告", description: "输出风险、证据、修改建议和人工复核建议。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w4f1", key: "conclusion", type: "enum", options: ["通过", "需关注", "拒绝"], required: true, description: "最终审查结论" },
            { id: "w4f2", key: "risk_level", type: "enum", options: ["低", "中", "高"], required: true, description: "最终风险等级" },
            { id: "w4f3", key: "modification_suggestions", type: "list", required: true, description: "具体修改建议列表，每条一句话" },
            { id: "w4f4", key: "human_review_points", type: "list", required: false, description: "需人工核实的疑点清单" },
            { id: "w4f5", key: "human_review_required", type: "bool", required: true, description: "是否提交人工复核" },
          ],
        },
      },
    ],
    testCases: [
      {
        id: "tc-contract-revenue",
        name: "收益分配口径缺失",
        input: "合同约定按经营收入分配，但未说明扣除项和周期。",
        expected: "识别为高风险，要求补充扣除项、分配周期和披露一致性。",
        status: "待验证",
        split: "train" as const,
      },
      {
        id: "tc-contract-termination",
        name: "提前终止条款过宽",
        input: "发行方可单方提前终止且未写投资者保护安排。",
        expected: "命中提前终止规则，建议人工复核。",
        status: "待验证",
        split: "holdout" as const,
      },
    ],
    trace: ["解析合同输入", "检索合同审查标准", "命中收益分配规则", "调用报告生成", "输出人工复核建议"],
    beforeReport: {
      title: "训练前输出",
      summary: "只能给出笼统风险提示，缺少命中规则和可执行修改建议。",
      score: 66,
      bullets: ["风险解释不稳定", "条款证据引用不足", "人工复核边界不清"],
      meta: [
        { label: "风险识别", value: "中" },
        { label: "建议可执行性", value: "弱" },
      ],
    },
    afterReport: {
      title: "训练后输出",
      summary: "能按规则输出风险、证据、建议和复核动作，适合进入发布前评审。",
      score: 92,
      bullets: ["收益分配与终止条款识别稳定", "报告结构完整", "高风险可自动进入复核队列"],
      meta: [
        { label: "风险识别", value: "高" },
        { label: "建议可执行性", value: "强" },
      ],
    },
  },
  {
    id: "ticket",
    name: "系统工单分诊 Agent",
    type: "系统分诊",
    purpose: "识别 COP、结算、门店数据、账户权限等系统问题，并给出优先级、责任方和处理摘要。",
    scenario: "COP 工单入口",
    inputSchema: ["工单标题", "问题描述", "影响门店", "业务环节"],
    outputSchema: ["分类", "优先级", "责任团队", "处理摘要"],
    qualityTarget: 89,
    latencyTarget: "< 20s",
    knowledgeIds: ["doc-cop-ticket", "doc-settlement"],
    ruleIds: ["rule-ticket-settlement", "rule-ticket-batch-store", "rule-required-fields"],
    prompt:
      "你是系统工单分诊 Agent。请根据工单影响范围、业务环节和结算影响输出分类、优先级、责任团队和处理摘要。P0/P1 必须提示人工确认。",
    guardrails: ["不得承诺修复时间", "P0/P1 必须人工确认", "责任团队必须来自已配置范围"],
    tools: [
      { id: "classify", sourceToolId: "tool-knowledge-search", name: "工单分类", description: "识别 COP、结算、门店数据、账户权限等问题类型。", enabled: true },
      { id: "route", sourceToolId: "tool-ticket-route", name: "责任方路由", description: "根据业务域和影响范围推荐处理团队。", enabled: true },
      { id: "sla", sourceToolId: "tool-rule-check", name: "优先级判断", description: "结合现金流影响、门店范围和阻塞程度给出 P 级。", enabled: true },
      { id: "summary", sourceToolId: "tool-report", name: "摘要生成", description: "将原始工单改写为可执行处理摘要。", enabled: true },
    ],
    workflow: [
      {
        id: "w1", title: "读取工单", description: "提取问题类型、影响范围和业务环节。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w1f1", key: "ticket_type", type: "enum", options: ["COP", "结算", "门店数据", "账户权限", "其他"], required: true, description: "工单问题类型分类" },
            { id: "w1f2", key: "affected_stores", type: "number", required: true, description: "受影响门店数量" },
            { id: "w1f3", key: "business_domain", type: "text", required: true, description: "所属业务域（如结算/COP/数据平台）" },
            { id: "w1f4", key: "blocks_settlement", type: "bool", required: true, description: "是否阻塞当日结算" },
          ],
        },
      },
      {
        id: "w2", title: "判断优先级", description: "结合结算影响、门店数量和阻塞程度打 P 级。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w2f1", key: "priority", type: "enum", options: ["P0", "P1", "P2", "P3"], required: true, description: "工单处理优先级", constraint: "若 blocks_settlement=true 且 affected_stores≥5 则 priority 必须为 P0 或 P1" },
            { id: "w2f2", key: "priority_reason", type: "text", required: true, description: "优先级判断依据说明" },
            { id: "w2f3", key: "requires_immediate_action", type: "bool", required: true, description: "是否需要立即人工介入" },
          ],
        },
      },
      {
        id: "w3", title: "推荐责任方", description: "给出系统、数据、结算或业务运营团队。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w3f1", key: "team", type: "enum", options: ["结算支持", "数据平台", "系统运营", "业务运营", "产品研发"], required: true, description: "推荐处理责任团队" },
            { id: "w3f2", key: "routing_reason", type: "text", required: true, description: "路由理由" },
          ],
        },
      },
      {
        id: "w4", title: "生成处理摘要", description: "输出可直接转派的简洁说明。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w4f1", key: "summary", type: "text", required: true, description: "可直接转派的处理摘要（2-3句话）" },
            { id: "w4f2", key: "suggested_actions", type: "list", required: false, description: "建议处理步骤列表" },
            { id: "w4f3", key: "escalate_to_human", type: "bool", required: true, description: "是否需升级人工处理" },
          ],
        },
      },
    ],
    testCases: [
      {
        id: "tc-ticket-settlement",
        name: "结算状态阻塞",
        input: "12 家门店结算状态停留在待确认，影响当日结算。",
        expected: "分类为结算异常，优先级至少 P1，责任方为结算支持。",
        status: "待验证",
        split: "train" as const,
      },
      {
        id: "tc-ticket-cop",
        name: "COP 数据同步延迟",
        input: "单门店 COP 今日流水未同步，暂未影响结算。",
        expected: "分类为数据同步，优先级 P2 或 P3，建议数据平台排查。",
        status: "待验证",
        split: "holdout" as const,
      },
    ],
    trace: ["读取工单描述", "提取影响范围", "命中结算优先级规则", "路由责任团队", "生成摘要"],
    beforeReport: {
      title: "训练前输出",
      summary: "能识别问题大类，但优先级和责任方解释不足。",
      score: 64,
      bullets: ["P1/P2 边界不稳定", "责任团队理由偏弱", "摘要不够可转派"],
      meta: [
        { label: "分类", value: "可用" },
        { label: "路由", value: "待强化" },
      ],
    },
    afterReport: {
      title: "训练后输出",
      summary: "能稳定输出分类、优先级、责任方和处理摘要。",
      score: 89,
      bullets: ["结算影响会自动提升优先级", "批量门店异常可识别", "摘要适合直接转派"],
      meta: [
        { label: "分类", value: "稳定" },
        { label: "路由", value: "清晰" },
      ],
    },
  },
  {
    id: "compliance",
    name: "披露合规检查 Agent",
    type: "合规检查",
    purpose: "检查披露材料是否覆盖资产口径、历史回款、风险提示、投资者适当性和关键假设。",
    scenario: "发行前材料复核",
    inputSchema: ["披露材料", "资产包说明", "历史回款", "风险提示"],
    outputSchema: ["缺口清单", "风险等级", "补充建议", "复核结论"],
    qualityTarget: 88,
    latencyTarget: "< 35s",
    knowledgeIds: ["doc-compliance-check", "doc-cashflow-asset"],
    ruleIds: ["rule-required-fields", "rule-contract-data-auth"],
    prompt:
      "你是披露合规检查 Agent。请检查材料是否覆盖资产口径、历史回款、风险提示、投资者适当性和关键假设，并输出缺口清单与补充建议。",
    guardrails: ["不得替代合规负责人最终判断", "缺少证据必须列为缺口", "涉及投资者适当性必须提示复核"],
    tools: [
      { id: "checklist", sourceToolId: "tool-rule-check", name: "清单核对", description: "逐项核对披露与合规检查清单。", enabled: true },
      { id: "evidence", sourceToolId: "tool-knowledge-search", name: "证据定位", description: "定位材料中的资产口径、历史回款和风险提示证据。", enabled: true },
      { id: "gap", sourceToolId: "tool-report", name: "缺口生成", description: "生成缺失信息和补充建议。", enabled: true },
    ],
    workflow: [
      {
        id: "w1", title: "材料分段", description: "识别资产说明、回款记录、风险提示和适当性章节。", enabled: true,
        anchor: {
          strict: false,
          fields: [
            { id: "w1f1", key: "sections_found", type: "list", required: true, description: "识别到的章节列表（如资产口径/历史回款/风险提示）" },
            { id: "w1f2", key: "sections_missing", type: "list", required: true, description: "未找到的必要章节列表" },
            { id: "w1f3", key: "investor_suitability_present", type: "bool", required: true, description: "是否包含投资者适当性章节" },
          ],
        },
      },
      {
        id: "w2", title: "清单核对", description: "逐项比对统一检查清单。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w2f1", key: "items_checked", type: "number", required: true, description: "已核对的清单项总数" },
            { id: "w2f2", key: "items_passed", type: "number", required: true, description: "通过核对的清单项数" },
            { id: "w2f3", key: "items_failed", type: "list", required: true, description: "未通过的清单项名称列表" },
            { id: "w2f4", key: "compliance_rate", type: "number", required: true, description: "合规率（百分比，如 85 表示 85%）" },
          ],
        },
      },
      {
        id: "w3", title: "输出缺口与建议", description: "按风险等级输出缺口和补充建议。", enabled: true,
        anchor: {
          strict: true,
          fields: [
            { id: "w3f1", key: "gaps", type: "list", required: true, description: "发现的信息缺口列表，每条一句话" },
            { id: "w3f2", key: "risk_level", type: "enum", options: ["低", "中", "高"], required: true, description: "整体合规风险等级" },
            { id: "w3f3", key: "conclusion", type: "enum", options: ["通过", "需关注", "拒绝发行"], required: true, description: "最终复核结论" },
            { id: "w3f4", key: "reviewer_required", type: "bool", required: true, description: "是否需要合规负责人人工复核", constraint: "若 risk_level=高 或 investor_suitability_present=false 则必须为 true" },
            { id: "w3f5", key: "suggestions", type: "list", required: true, description: "补充建议列表，每条对应一个缺口" },
          ],
        },
      },
    ],
    testCases: [
      {
        id: "tc-compliance-risk",
        name: "风险提示缺失",
        input: "披露材料包含资产口径和历史回款，但未列关键风险提示。",
        expected: "识别为高优先级缺口，建议补充风险提示章节。",
        status: "待验证",
        split: "train" as const,
      },
      {
        id: "tc-compliance-suitability",
        name: "适当性章节缺失",
        input: "材料包含风险提示但未单独列出投资者适当性评估章节。",
        expected: "识别为必要缺口，reviewer_required 为 true，建议补充适当性章节。",
        status: "待验证",
        split: "holdout" as const,
      },
    ],
    trace: ["读取披露材料", "检索合规清单", "定位证据片段", "生成缺口清单"],
    beforeReport: {
      title: "训练前输出",
      summary: "能发现明显缺口，但证据定位和风险分级较弱。",
      score: 63,
      bullets: ["缺口分类不稳定", "证据引用不足", "复核建议不明确"],
      meta: [{ label: "结论", value: "待训练" }],
    },
    afterReport: {
      title: "训练后输出",
      summary: "能输出清晰的缺口清单、证据位置和补充建议。",
      score: 88,
      bullets: ["检查清单覆盖完整", "证据定位清晰", "适当性材料会触发复核"],
      meta: [{ label: "结论", value: "可复核" }],
    },
  },
];

const emptyState = {
  title: "待规划",
  text: "该节点尚未配置主 Agent，可从 Agent 管理页创建，或在此选择已有 Agent 放置。",
};

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState;
    const parsed = JSON.parse(saved) as Partial<AppState>;
    return migrateState(parsed);
  } catch {
    return defaultState;
  }
}

function migrateState(partial: Partial<AppState>): AppState {
  const defaultAgentsById = Object.fromEntries(defaultState.agents.map((agent) => [agent.id, agent])) as Record<string, Agent>;
  const mergedRules = partial.rules ?? defaultState.rules;
  return {
    agents: (partial.agents ?? defaultState.agents).map((agent) => ({
      ...defaultAgentsById[agent.id],
      ...agent,
      name: cleanDemoText(agent.name ?? defaultAgentsById[agent.id]?.name ?? ""),
      type: cleanDemoText(agent.type ?? defaultAgentsById[agent.id]?.type ?? ""),
      purpose: cleanDemoText(agent.purpose ?? defaultAgentsById[agent.id]?.purpose ?? ""),
      prompt: cleanDemoText(agent.prompt ?? defaultAgentsById[agent.id]?.prompt ?? ""),
      inputSchema: agent.inputSchema ?? defaultAgentsById[agent.id]?.inputSchema,
      outputSchema: agent.outputSchema ?? defaultAgentsById[agent.id]?.outputSchema,
      tools: agent.tools ?? defaultAgentsById[agent.id]?.tools ?? [],
      workflow: agent.workflow ?? defaultAgentsById[agent.id]?.workflow ?? [],
      knowledgeIds: agent.knowledgeIds ?? defaultAgentsById[agent.id]?.knowledgeIds ?? [],
      rules: normalizeAgentRules(agent.rules ?? defaultAgentsById[agent.id]?.rules ?? [], mergedRules),
      timeline: (agent.timeline ?? defaultAgentsById[agent.id]?.timeline ?? []).map((item) => ({
        ...item,
        title: cleanDemoText(item.title),
        description: cleanDemoText(item.description),
      })),
      apiCalls: agent.apiCalls ?? defaultAgentsById[agent.id]?.apiCalls ?? [],
      testCases: agent.testCases ?? defaultAgentsById[agent.id]?.testCases ?? [],
      instructionSegments: agent.instructionSegments ?? defaultAgentsById[agent.id]?.instructionSegments,
      fewShots: agent.fewShots ?? defaultAgentsById[agent.id]?.fewShots,
      retrievalConfig: agent.retrievalConfig ?? defaultAgentsById[agent.id]?.retrievalConfig,
      rubric: agent.rubric ?? defaultAgentsById[agent.id]?.rubric,
    })),
    docs: partial.docs ?? defaultState.docs,
    rules: mergedRules,
    tools: partial.tools ?? defaultState.tools,
    evalRuns: partial.evalRuns ?? defaultState.evalRuns,
    apiKeys: partial.apiKeys ?? defaultState.apiKeys,
    skills: partial.skills ?? defaultSkills,
  };
}

function cleanDemoText(value: string) {
  return value.replace(/业务模板/g, "业务蓝图").replace(/模板/g, "蓝图").replace(/模版/g, "蓝图");
}

function normalizeAgentRules(agentRules: RuleItem[], library: RuleLibraryItem[]) {
  return agentRules.map((rule) => {
    const source = rule.sourceRuleId
      ? library.find((item) => item.id === rule.sourceRuleId)
      : library.find((item) => item.title === rule.title);
    if (!source) return rule;
    return {
      ...rule,
      sourceRuleId: source.id,
      title: source.title,
      description: source.description,
      priority: source.priority,
    };
  });
}

function nextVersion(version: string) {
  const match = version.match(/^v(\d+)\.(\d+)$/);
  if (!match) return "v0.2";
  return `v${match[1]}.${Number(match[2]) + 1}`;
}

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function rulesFromBlueprint(ruleIds: string[]): RuleItem[] {
  return ruleIds
    .map((ruleId) => defaultState.rules.find((rule) => rule.id === ruleId))
    .filter((rule): rule is RuleLibraryItem => Boolean(rule))
    .map((rule) => ({
      id: `local-${rule.id}-${Date.now()}`,
      sourceRuleId: rule.id,
      title: rule.title,
      description: rule.description,
      priority: rule.priority,
      enabled: true,
    }));
}

function inferAgentBlueprint(name: string, type: string, purpose: string): AgentBlueprint {
  const text = `${name} ${type} ${purpose}`.toLowerCase();
  if (/(工单|cop|系统|结算|分诊|ticket)/i.test(text)) return agentBlueprints.find((item) => item.id === "ticket") ?? agentBlueprints[0];
  if (/(合同|合约|条款|现金流|contract)/i.test(text)) return agentBlueprints.find((item) => item.id === "contract") ?? agentBlueprints[0];
  if (/(合规|披露|风控|检查|compliance)/i.test(text)) return agentBlueprints.find((item) => item.id === "compliance") ?? agentBlueprints[0];
  return agentBlueprints.find((item) => item.id === "contract") ?? agentBlueprints[0];
}

function schemaToText(items: string[]) {
  return items.join("\n");
}

function parseSchemaText(value: string, fallback: string[]) {
  const parsed = value
    .split(/\n|,|，|、/)
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function getAgentInputSchema(agent: Agent, blueprint = inferAgentBlueprint(agent.name, agent.type, agent.purpose)) {
  return agent.inputSchema?.length ? agent.inputSchema : blueprint.inputSchema;
}

function getAgentOutputSchema(agent: Agent, blueprint = inferAgentBlueprint(agent.name, agent.type, agent.purpose)) {
  return agent.outputSchema?.length ? agent.outputSchema : blueprint.outputSchema;
}

function buildTrainingRunResult(agent: Agent): TrainingRunResult {
  const blueprint = inferAgentBlueprint(agent.name, agent.type, agent.purpose);
  const enabledRules = agent.rules.filter((rule) => rule.enabled).length;
  const enabledTools = agent.tools.filter((tool) => tool.enabled).length;
  const passedCases = agent.testCases.filter((testCase) => testCase.status === "通过").length;
  const cases = Math.max(agent.testCases.length, 1);
  const passRate = Math.min(98, Math.round(((passedCases + Math.max(1, enabledRules)) / (cases + Math.max(1, enabledRules))) * 100));
  const computedScore = Math.round((agent.afterReport.score + passRate + enabledTools * 2) / 2);
  const incrementalLift = agent.score < 90 ? 6 : agent.score < 96 ? 3 : agent.score < 99 ? 1 : 0;
  const scoreAfter = Math.min(99, Math.max(agent.afterReport.score, computedScore, agent.score + incrementalLift));
  const versionAfter = nextVersion(agent.version);
  const knowledgeCoverage = Math.min(100, Math.round((agent.knowledgeIds.length / Math.max(blueprint.knowledgeIds.length, 1)) * 100));
  const ruleCoverage = Math.min(100, Math.round((enabledRules / Math.max(blueprint.ruleIds.length, 1)) * 100));
  const toolCoverage = Math.min(100, Math.round((enabledTools / Math.max(agent.tools.length, 1)) * 100));
  const confidence = Math.min(99, Math.round((scoreAfter + passRate + knowledgeCoverage + ruleCoverage + toolCoverage) / 5));
  const delta = scoreAfter - agent.score;
  const failed = Math.max(0, cases - Math.max(passedCases + 1, scoreAfter >= 90 ? cases : passedCases));
  const toolsVerified = Math.max(enabledTools, agent.tools.length ? enabledTools : 1);
  const primaryRule = agent.rules.find((rule) => rule.enabled)?.title ?? "关键业务规则";
  const primaryDoc = agent.knowledgeIds.length ? `${agent.knowledgeIds.length} 份关联知识` : "待补充知识库";

  const changes = [
    `Prompt 对齐：强化“${blueprint.scenario}”场景下的输入解析、输出字段和人工复核边界。`,
    `知识检索：校准 ${primaryDoc} 的召回顺序，优先引用与 ${agent.type} 直接相关的标准片段。`,
    `规则边界：验证 ${enabledRules} 条启用规则，重点加固“${primaryRule}”的触发解释。`,
    `工具链路：完成 ${toolsVerified}/${Math.max(agent.tools.length, 1)} 个工具的 Dry-run，确认结构化报告链路可执行。`,
    `评测回归：运行 ${cases} 个用例，通过率 ${passRate}%，输出质量分从 ${agent.score} 提升至 ${scoreAfter}。`,
  ];

  const recommendations = [
    failed > 0 ? `补充 ${failed} 条失败或低置信度用例，覆盖边界输入和反例。` : "将当前评测集固化为发布前回归基线。",
    knowledgeCoverage < 100 ? "继续补齐知识库标签，提升跨业务节点召回稳定性。" : "保持知识库版本同步，后续重点监控新增规则漂移。",
    enabledRules < blueprint.ruleIds.length ? "将缺失规则补入统一规则库，并在 Agent 详情页选择启用。" : "把高优先级规则纳入人工复核抽检清单。",
  ];

  return {
    runId: `run-${Date.now()}`,
    versionBefore: agent.version,
    versionAfter,
    scoreBefore: agent.score,
    scoreAfter,
    delta,
    passRate,
    cases,
    failed,
    confidence,
    knowledgeCoverage,
    rulesVerified: enabledRules,
    toolsVerified,
    changes,
    recommendations,
    steps: [
      {
        title: trainingStepCatalog[0].title,
        detail: `在 ${cases} 个用例（训练 + 留出）上跑当前版本，基线质量分 ${agent.score}，失败 ${failed} 个。`,
        metric: `${cases} cases`,
        status: failed ? "需关注" : "完成",
      },
      {
        title: trainingStepCatalog[1].title,
        detail: failed > 0
          ? `对 ${failed} 个失败用例进行语义聚类，识别出 ${Math.min(failed, 3)} 个主要失败主题。`
          : "无失败用例，跳过聚类步骤。",
        metric: failed > 0 ? `${Math.min(failed, 3)} clusters` : "0 clusters",
        status: "完成",
      },
      {
        title: trainingStepCatalog[2].title,
        detail: `Critic 模型对各失败主题进行根因分析，定位到 ${Math.min(failed + 1, 3)} 个白盒单元缺失。`,
        metric: `${Math.min(failed + 1, 3)} issues`,
        status: "完成",
      },
      {
        title: trainingStepCatalog[3].title,
        detail: `Proposer 针对各失败主题生成改动 diff，共 ${Math.min(failed + 2, 4)} 条候选提案，附风险评分。`,
        metric: `${Math.min(failed + 2, 4)} proposals`,
        status: "完成",
      },
      {
        title: trainingStepCatalog[4].title,
        detail: `Critic 过滤并标注依赖关系，输出 ${Math.min(failed + 2, 4)} 条进入人工审查闸门的最终提案。`,
        metric: `${agent.version} -> ${versionAfter}`,
        status: "记录",
      },
    ],
  };
}

function buildEvaluationRunResult(agent: Agent): EvaluationRunResult {
  const blueprint = inferAgentBlueprint(agent.name, agent.type, agent.purpose);
  const outputSchema = getAgentOutputSchema(agent, blueprint);
  const cases = Math.max(agent.testCases?.length ?? 1, 1);
  const failed = agent.testCases?.filter((item) => item.status !== "通过").length ?? 0;
  const passed = Math.max(0, cases - failed);
  const passRate = Math.round((passed / cases) * 100);
  const enabledRules = agent.rules.filter((rule) => rule.enabled).length;
  const enabledTools = agent.tools.filter((tool) => tool.enabled).length;
  const knowledgeCoverage = Math.min(100, Math.round((agent.knowledgeIds.length / Math.max(blueprint.knowledgeIds.length, 1)) * 100));
  const ruleCoverage = Math.min(100, Math.round((enabledRules / Math.max(blueprint.ruleIds.length, 1)) * 100));
  const toolCoverage = Math.min(100, Math.round((enabledTools / Math.max(agent.tools.length, 1)) * 100));
  const structureScore = Math.min(99, Math.round((agent.score + passRate + (agent.prompt.length > 180 ? 95 : 78)) / 3));
  const evidenceScore = Math.min(99, Math.round((knowledgeCoverage + ruleCoverage + toolCoverage) / 3));
  const stabilityScore = Math.min(99, Math.round((passRate + agent.score + (agent.trainedOnce ? 94 : 72)) / 3));
  const score = Math.min(99, Math.max(60, Math.round((structureScore + evidenceScore + stabilityScore + agent.score) / 4)));
  const gate: EvaluationRunResult["gate"] = failed === 0 && score >= 88 ? "通过" : "需优化";
  const firstFailedCase = agent.testCases.find((item) => item.status !== "通过");
  const notes =
    gate === "通过"
      ? "全部核心样例通过，可作为发布前或发布后回归基线。"
      : `仍有 ${failed} 个样例需要补充规则、知识或 Prompt 约束。`;

  const findings = [
    `测试用例：共运行 ${cases} 个样例，通过 ${passed} 个，失败/需优化 ${failed} 个，通过率 ${passRate}%。`,
    `结构契约：输出字段、结论格式和人工复核提示评分 ${structureScore}。`,
    `证据链路：知识覆盖 ${knowledgeCoverage}%，规则覆盖 ${ruleCoverage}%，工具可用 ${toolCoverage}%。`,
    firstFailedCase ? `重点关注：${firstFailedCase.name} 仍处于“${firstFailedCase.status}”，建议补充反例或规则解释。` : "当前用例库未发现阻塞项，可固化为回归基线。",
  ];

  const recommendations = [
    failed > 0 ? "优先处理失败用例，补充输入边界、命中规则和期望输出。" : "将本次评估结果标记为稳定基线，后续训练后自动对比。",
    evidenceScore < 88 ? "补强知识库标签和规则启用范围，避免输出无法追溯。" : "保持知识、规则、工具三类资产同步评估，监控配置漂移。",
    stabilityScore < 90 ? "增加跨节点或跨业务线样例，提升发布后稳定性判断。" : "可进入发布前抽检或接口调用灰度验证。",
  ];

  return {
    runId: `eval-${Date.now()}`,
    version: agent.version,
    score,
    passRate,
    cases,
    failed,
    structureScore,
    evidenceScore,
    stabilityScore,
    gate,
    notes,
    findings,
    recommendations,
    stages: [
      {
        title: evaluationStageCatalog[0].title,
        detail: `装载 ${cases} 个测试用例，包含 ${passed} 个已通过样例和 ${failed} 个待优化样例。`,
        metric: `${cases} cases`,
        status: "完成",
      },
      {
        title: evaluationStageCatalog[1].title,
        detail: `检查 ${outputSchema.join("、")} 等输出字段，结构化契约评分 ${structureScore}。`,
        metric: `${structureScore} score`,
        status: structureScore >= 88 ? "完成" : "需关注",
      },
      {
        title: evaluationStageCatalog[2].title,
        detail: `核验 ${agent.knowledgeIds.length} 份知识、${enabledRules} 条规则和 ${enabledTools} 个工具的可追溯证据。`,
        metric: `${evidenceScore} evidence`,
        status: evidenceScore >= 88 ? "完成" : "需关注",
      },
      {
        title: evaluationStageCatalog[3].title,
        detail: `通过率 ${passRate}%，质量分 ${score}，稳定性评分 ${stabilityScore}，门槛状态：${gate}。`,
        metric: `${passRate}% pass`,
        status: gate === "通过" ? "完成" : "需关注",
      },
      {
        title: evaluationStageCatalog[4].title,
        detail: "生成评估记录、问题发现和下一轮优化建议，并写入 Agent 版本时间线。",
        metric: agent.version,
        status: "记录",
      },
    ],
  };
}

function buildMockClusters(agent: Agent): FailureCluster[] {
  const failedCases = agent.testCases.filter((c) => c.status !== "通过");
  const isContract = /(合同|合规|contract)/i.test(`${agent.name} ${agent.type}`);
  const ts = Date.now();
  const clusters: FailureCluster[] = [];

  if (failedCases.length > 0) {
    clusters.push({
      id: `cl-${ts}-1`,
      label: isContract ? "数据授权条款遗漏" : "批量异常处理缺失",
      caseCount: Math.max(1, Math.floor(failedCases.length * 0.5)),
      diagnosis: isContract
        ? "Agent 在含数据授权条款的合同中未主动比对授权范围与披露口径，导致高风险项被漏判。"
        : "Agent 在涉及批量门店异常时未触发升级处理逻辑，仅给出通用建议。",
      targetUnit: "instruction",
    });
    clusters.push({
      id: `cl-${ts}-2`,
      label: isContract ? "规则优先级判断错误" : "知识片段召回不足",
      caseCount: Math.max(1, Math.floor(failedCases.length * 0.35)),
      diagnosis: isContract
        ? "相关规则存在但优先级设置偏低，Agent 指令未明确要求规则检查，导致低优先级规则漏触发。"
        : "检索 top_k 不足，关键知识片段未被纳入上下文，Agent 只能凭通用知识作答。",
      targetUnit: isContract ? "rule" : "retrieval",
    });
  }

  if (agent.score < 85) {
    clusters.push({
      id: `cl-${ts}-3`,
      label: "示范覆盖缺口",
      caseCount: 1,
      diagnosis: "当前 Few-shot 示例未覆盖边界场景，模型在陌生输入结构下输出不稳定。",
      targetUnit: "few-shot",
    });
  }

  return clusters;
}

function buildMockProposals(agent: Agent, clusters: FailureCluster[]): Proposal[] {
  const failedCase = agent.testCases.find((c) => c.status !== "通过");
  const currentTopK = agent.retrievalConfig?.topK ?? 4;
  const ts = Date.now();
  const isContract = /(合同|合规|contract)/i.test(`${agent.name} ${agent.type}`);
  const proposals: Proposal[] = [];

  const cl1 = clusters[0];
  const cl2 = clusters[1];
  const cl3 = clusters[2];
  const idFs = `p-fs-${ts}`;
  const idRet = `p-ret-${ts + 2}`;

  if (failedCase) {
    proposals.push({
      id: idFs,
      unit: "few-shot",
      unitLabel: "Few-shot 示范",
      before: "（当前无该场景示例）",
      after: `输入：${failedCase.input.slice(0, 72)}\n期望输出：${failedCase.expected.slice(0, 60)}`,
      reason: `"${failedCase.name}"场景下 Agent 输出不稳定，补充示范例子可固化该场景的正确输出模式，避免下次遗漏。`,
      triggerCase: failedCase.name,
      status: "pending",
      riskFlag: false,
      clusterId: cl3?.id,
    });
  }

  proposals.push({
    id: `p-rule-${ts + 1}`,
    unit: "rule",
    unitLabel: "规则绑定",
    before: isContract ? "「数据授权口径一致性」规则：当前停用" : "「批量异常升级处理」规则：当前停用",
    after: isContract ? "「数据授权口径一致性」规则：启用，优先级高" : "「批量异常升级处理」规则：启用，优先级高",
    reason: "失败用例中该规则未触发，检查发现规则存在于规则库但当前 Agent 未启用，直接启用即可。",
    triggerCase: failedCase?.name ?? "边界判断未覆盖",
    status: "pending",
    riskFlag: false,
    clusterId: cl2?.id,
    ruleIsolationType: "binding",
  });

  proposals.push({
    id: `p-rule-new-${ts + 1}`,
    unit: "rule",
    unitLabel: "新建私有草稿规则",
    before: "（规则库中无对应规则）",
    after: isContract
      ? "新建草稿：「披露材料版本与合同签署日期需在同一报告期」，优先级中，仅当前 Agent 可见"
      : "新建草稿：「跨节点异常影响范围需说明受影响门店数量」，优先级中，仅当前 Agent 可见",
    reason: "规则库中无覆盖该场景的标准规则，建议新建私有草稿规则。成熟后可由资产维护者提升为共享规则。",
    triggerCase: failedCase?.name ?? "规则库覆盖缺口",
    status: "pending",
    riskFlag: false,
    clusterId: cl1?.id,
    ruleIsolationType: "create",
  });

  proposals.push({
    id: idRet,
    unit: "retrieval",
    unitLabel: "检索配置",
    before: `top_k = ${currentTopK}，标签过滤：${agent.retrievalConfig?.tagFilters?.join("、") ?? "当前配置"}`,
    after: `top_k = ${currentTopK + 2}，标签过滤：补充"${isContract ? "数据授权、披露口径" : "批量异常、结算影响"}"`,
    reason: "相关知识片段召回不足，增大 top_k 并补充标签过滤可提升知识命中率。",
    triggerCase: failedCase?.name ?? "知识检索未命中",
    status: "pending",
    riskFlag: false,
    clusterId: cl2?.id,
  });

  if (agent.score < 85) {
    const taskSeg = agent.instructionSegments?.find((s) => s.label === "任务");
    proposals.push({
      id: `p-inst-${ts + 3}`,
      unit: "instruction",
      unitLabel: "指令分段（任务段）",
      before: taskSeg ? taskSeg.content.slice(0, 80) + (taskSeg.content.length > 80 ? "…" : "") : "（当前任务段）",
      after: (taskSeg?.content ?? "当前任务描述") + `\n同时，必须比对${isContract ? "数据授权范围与披露材料口径是否一致" : "影响门店范围与报告口径是否统一"}，不一致时标注为高风险。`,
      reason: "当前任务指令未明确要求该关键检查项，失败用例中该场景被遗漏。",
      triggerCase: failedCase?.name ?? "关键检查遗漏",
      status: "pending",
      riskFlag: false,
      clusterId: cl1?.id,
      dependsOn: failedCase ? [idFs] : undefined,
      conflictsWith: [idRet],
    });
  }

  return proposals;
}

function makeNewAgent(name: string, purpose: string, type: string, inputSchema?: string[], outputSchema?: string[]): Agent {
  const blueprint = inferAgentBlueprint(name, type, purpose);
  return {
    id: `agent-${Date.now()}`,
    name,
    type,
    purpose,
    status: "draft",
    version: "v0.1",
    score: 60,
    caseUploaded: false,
    trainedOnce: false,
    feedbackSaved: false,
    prompt: blueprint.prompt.replace(blueprint.name, name),
    inputSchema: inputSchema?.length ? inputSchema : [...blueprint.inputSchema],
    outputSchema: outputSchema?.length ? outputSchema : [...blueprint.outputSchema],
    guardrails: [...blueprint.guardrails],
    tools: blueprint.tools.map((tool) => ({ ...tool, id: `${tool.id}-${Date.now()}` })),
    workflow: blueprint.workflow.map((step) => ({ ...step, id: `${step.id}-${Date.now()}` })),
    knowledgeIds: [...blueprint.knowledgeIds],
    rules: rulesFromBlueprint(blueprint.ruleIds),
    beforeReport: blueprint.beforeReport,
    afterReport: blueprint.afterReport,
    trace: blueprint.trace,
    timeline: [
      { id: "created", title: "生成 Agent 蓝图", description: "已根据业务职责生成能力、工具、规则和评测集。", time: nowLabel() },
    ],
    apiCalls: [],
    testCases: blueprint.testCases.map((testCase) => ({ ...testCase, id: `${testCase.id}-${Date.now()}` })),
    instructionSegments: [],
    fewShots: [],
    retrievalConfig: { topK: 4, tagFilters: [] },
    rubric: [],
    judgePhase: "human",
  };
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [view, setView] = useState<ViewName>("matrix");
  const [selectedAgentId, setSelectedAgentId] = useState("contract-review");
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [highlightedCell, setHighlightedCell] = useState<string | null>(null);
  const [trainingAgentId, setTrainingAgentId] = useState<string | null>(null);
  const [trainingStep, setTrainingStep] = useState(0);
  const [trainingRun, setTrainingRun] = useState<TrainingRunState | null>(null);
  const [evaluationAgentId, setEvaluationAgentId] = useState<string | null>(null);
  const [evaluationStep, setEvaluationStep] = useState(0);
  const [evaluationRun, setEvaluationRun] = useState<EvaluationRunState | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [proposalReview, setProposalReview] = useState<ProposalReviewState | null>(null);

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => {
      setNotice((current) => (current === message ? null : current));
    }, 2400);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const agentsById = useMemo(() => {
    return Object.fromEntries(state.agents.map((agent) => [agent.id, agent])) as Record<string, Agent>;
  }, [state.agents]);

  const selectedAgent = agentsById[selectedAgentId] ?? state.agents[0];
  const trainingRunAgent = trainingRun ? agentsById[trainingRun.agentId] : undefined;
  const evaluationRunAgent = evaluationRun ? agentsById[evaluationRun.agentId] : undefined;

  const updateAgent = (agentId: string, updater: (agent: Agent) => Agent) => {
    setState((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.id === agentId ? updater(agent) : agent)),
    }));
  };

  const openAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedCellKey(null);
    setView("detail");
  };

  const findAgentByCell = (key: string) => state.agents.find((agent) => agent.matrixCellKey === key);

  const openCell = (key: string) => {
    const agent = findAgentByCell(key);
    if (agent && !agent.shallow) {
      openAgent(agent.id);
      return;
    }
    setSelectedCellKey(key);
  };

  const completeTraining = (agentId: string, result: TrainingRunResult, appliedLabels?: string[]) => {
    setState((current) => {
      const target = current.agents.find((agent) => agent.id === agentId);
      if (!target) return current;
      return {
        ...current,
        agents: current.agents.map((agent) =>
          agent.id === agentId
            ? {
                ...agent,
                status: agent.status === "published" ? "published" : "trained",
                version: result.versionAfter,
                score: result.scoreAfter,
                caseUploaded: true,
                trainedOnce: true,
                testCases: agent.testCases.map((testCase, index) => ({
                  ...testCase,
                  status: index === 0 || result.scoreAfter >= 90 ? "通过" : testCase.status,
                })),
                timeline: [
                  {
                    id: `train-${result.runId}`,
                    title: `训练运行报告 ${result.versionAfter}`,
                    description: `完成 ${trainingSteps.length} 个训练阶段，质量分 ${result.scoreBefore} -> ${result.scoreAfter}（${result.delta >= 0 ? "+" : ""}${result.delta}），通过率 ${result.passRate}%，置信度 ${result.confidence}%。${appliedLabels?.length ? ` 已应用改动：${appliedLabels.join("、")}。` : ""}`,
                    time: nowLabel(),
                    version: result.versionAfter,
                    metrics: [
                      { label: "质量分", value: `${result.scoreBefore} -> ${result.scoreAfter}`, tone: "green" },
                      { label: "提升点", value: `${result.delta >= 0 ? "+" : ""}${result.delta}`, tone: result.delta >= 0 ? "green" : "amber" },
                      { label: "通过率", value: `${result.passRate}%`, tone: result.passRate >= 90 ? "green" : "amber" },
                      { label: "置信度", value: `${result.confidence}%`, tone: result.confidence >= 88 ? "green" : "amber" },
                      { label: "知识覆盖", value: `${result.knowledgeCoverage}%`, tone: result.knowledgeCoverage >= 80 ? "green" : "amber" },
                      { label: "版本", value: `${result.versionBefore} -> ${result.versionAfter}`, tone: "neutral" },
                    ],
                    changes: [...result.changes, ...result.recommendations.map((item) => `下一轮建议：${item}`)],
                    steps: result.steps,
                  },
                  ...agent.timeline,
                ],
              }
            : agent,
        ),
        evalRuns: [
          {
            id: `eval-train-${result.runId}`,
            agentId,
            suite: `${target.type} 训练回归集`,
            score: result.scoreAfter,
            passRate: result.passRate,
            cases: result.cases,
            failed: result.failed,
            time: nowLabel(),
            notes: `训练运行自动生成：${result.changes.slice(0, 2).join("；")}。`,
          },
          ...current.evalRuns,
        ],
      };
    });
    setTrainingRun(null);
    notify("训练完成，版本报告和评估记录已生成");
  };

  const startTraining = (agentId: string) => {
    if (trainingAgentId) {
      notify("已有训练任务运行中，请稍后再试");
      return;
    }
    const target = agentsById[agentId];
    if (!target) return;
    const result = buildTrainingRunResult(target);
    const clusters = buildMockClusters(target);
    const proposals = buildMockProposals(target, clusters);
    setTrainingAgentId(agentId);
    setTrainingStep(0);
    setTrainingRun({
      agentId,
      startedAt: nowLabel(),
      completed: false,
      result,
      proposals,
      clusters,
    });
    trainingSteps.forEach((_, index) => {
      window.setTimeout(() => {
        setTrainingStep(index);
        if (index === trainingSteps.length - 1) {
          window.setTimeout(() => {
            // Mark complete but do NOT upgrade version yet — wait for proposal review
            setTrainingRun((current) =>
              current?.agentId === agentId ? { ...current, completed: true } : current,
            );
          }, 520);
        }
      }, index * 780);
    });
  };

  const openProposalReview = () => {
    if (!trainingRun?.completed) return;
    setProposalReview({
      agentId: trainingRun.agentId,
      proposals: trainingRun.proposals,
      clusters: trainingRun.clusters,
      phase: "review",
      gateResult: null,
      trainingResult: trainingRun.result,
    });
    setTrainingRun(null);
    setTrainingAgentId(null);
  };

  const updateProposal = (proposalId: string, patch: Partial<Proposal>) => {
    setProposalReview((current) =>
      current
        ? {
            ...current,
            proposals: current.proposals.map((p) => (p.id === proposalId ? { ...p, ...patch } : p)),
          }
        : null,
    );
  };

  const submitProposalReview = () => {
    if (!proposalReview) return;
    const accepted = proposalReview.proposals.filter((p) => p.status === "accepted" || p.status === "edited");
    const rejected = proposalReview.proposals.filter((p) => p.status === "rejected");
    const agentForReview = agentsById[proposalReview.agentId];
    const holdoutCount = agentForReview?.testCases.filter((c) => c.split === "holdout").length ?? 0;
    setProposalReview((current) => current ? { ...current, phase: "gating" } : null);

    window.setTimeout(() => {
      const trainDelta = accepted.length * 4 - rejected.length;
      const holdoutDelta = accepted.length * 3;
      const autoRejectedIds: string[] = [];
      setProposalReview((current) =>
        current
          ? {
              ...current,
              phase: "done",
              gateResult: {
                passed: trainDelta > 0 && holdoutDelta >= 0,
                trainDelta,
                holdoutDelta,
                holdoutCount,
                autoRejectedIds,
              },
            }
          : null,
      );
    }, 2200);
  };

  const finalizeTraining = () => {
    if (!proposalReview) return;
    const { agentId, trainingResult, proposals } = proposalReview;
    const accepted = proposals.filter((p) => p.status === "accepted" || p.status === "edited");

    // Apply accepted few-shot proposals to the agent
    const newFewShots: FewShotExample[] = accepted
      .filter((p) => p.unit === "few-shot")
      .map((p) => ({
        id: `fs-applied-${p.id}`,
        input: p.triggerCase,
        output: p.editedContent ?? p.after,
      }));

    // Apply accepted retrieval config proposals
    const retProposal = accepted.find((p) => p.unit === "retrieval");
    const newTopK = retProposal ? (agentsById[agentId]?.retrievalConfig?.topK ?? 4) + 2 : undefined;

    if (newFewShots.length > 0 || newTopK !== undefined) {
      updateAgent(agentId, (agent) => ({
        ...agent,
        fewShots: [...(agent.fewShots ?? []), ...newFewShots],
        retrievalConfig: newTopK !== undefined
          ? { ...agent.retrievalConfig, topK: newTopK, tagFilters: agent.retrievalConfig?.tagFilters ?? [] }
          : agent.retrievalConfig,
      }));
    }

    completeTraining(agentId, trainingResult, accepted.map((p) => p.unitLabel));
    setProposalReview(null);
  };

  const submitFeedback = (agentId: string, score: number, note: string) => {
    updateAgent(agentId, (agent) => ({
      ...agent,
      feedbackSaved: true,
      feedbackScore: score,
      feedbackNote: note,
      score: Math.min(99, Math.max(agent.score, agent.afterReport.score + score - 4)),
      version: nextVersion(agent.version),
      timeline: [
        {
          id: `feedback-${Date.now()}`,
          title: "反馈已纳入下一轮优化",
          description: `评分 ${score}/5：${note || "输出符合预期，进入下一轮优化样本。"}`,
          time: nowLabel(),
        },
        ...agent.timeline,
      ],
    }));
    notify("反馈已纳入下一轮优化");
  };

  const placeAgent = (agentId: string, targetCellKey: string, navigateAfterPublish = false) => {
    const targetAgent = agentsById[agentId];
    const occupant = state.agents.find((agent) => agent.matrixCellKey === targetCellKey && agent.id !== agentId);
    if (occupant) {
      const confirmed = window.confirm(`${targetCellKey.replace(":", " x ")} 已有 ${occupant.name}。确认替换后，原 Agent 将变为已训练但未发布。`);
      if (!confirmed) return;
    }

    setState((current) => ({
      ...current,
      agents: current.agents.map((agent) => {
        if (agent.id === agentId) {
          return {
            ...agent,
            status: "published",
            matrixCellKey: targetCellKey,
            trainedOnce: true,
            caseUploaded: true,
            score: Math.max(agent.score, agent.afterReport.score),
            timeline: [
              {
                id: `publish-${Date.now()}`,
                title: "发布到矩阵节点",
                description: `已发布至 ${describeCell(targetCellKey)}，接口调用已开放。`,
                time: nowLabel(),
              },
              ...agent.timeline,
            ],
          };
        }
        if (agent.matrixCellKey === targetCellKey && agent.id !== agentId) {
          return {
            ...agent,
            status: "trained",
            matrixCellKey: undefined,
            timeline: [
              {
                id: `replace-${Date.now()}`,
                title: "节点被替换",
                description: `${targetAgent?.name ?? "新 Agent"} 已成为该节点主 Agent。`,
                time: nowLabel(),
              },
              ...agent.timeline,
            ],
          };
        }
        return agent;
      }),
    }));

    setHighlightedCell(targetCellKey);
    setSelectedCellKey(null);
    if (navigateAfterPublish) setView("matrix");
    notify("Agent 已发布到矩阵节点");
  };

  const createAgent = (name: string, purpose: string, type: string, inputSchema: string[], outputSchema: string[]) => {
    const agent = makeNewAgent(name, purpose, type, inputSchema, outputSchema);
    setState((current) => ({
      ...current,
      agents: [agent, ...current.agents],
      docs: current.docs.map((doc) =>
        agent.knowledgeIds.includes(doc.id) && !doc.linkedAgents.includes(agent.id)
          ? { ...doc, linkedAgents: [...doc.linkedAgents, agent.id], updatedAt: "2026-06-21" }
          : doc,
      ),
    }));
    setSelectedAgentId(agent.id);
    setCreateOpen(false);
    setView("detail");
    notify("Agent 蓝图已生成，已进入训练工作台");
  };

  const addKnowledgeDoc = () => {
    const id = `doc-${Date.now()}`;
    setState((current) => ({
      ...current,
      docs: [
        {
          id,
          title: "新增标准文档",
          category: "业务",
          tags: ["模拟上传", "待标注"],
          updatedAt: "2026-06-21",
          snippet: "这是一份模拟上传的标准文档，可用于展示统一知识库的入库、标签和 Agent 关联流程。",
          linkedAgents: [],
        },
        ...current.docs,
      ],
    }));
    notify("文档已模拟上传到知识库");
  };

  const updateKnowledgeDoc = (docId: string, patch: Partial<KnowledgeDoc>) => {
    setState((current) => ({
      ...current,
      docs: current.docs.map((doc) => (doc.id === docId ? { ...doc, ...patch, updatedAt: "2026-06-21" } : doc)),
    }));
  };

  const deleteKnowledgeDoc = (docId: string) => {
    setState((current) => ({
      ...current,
      docs: current.docs.filter((doc) => doc.id !== docId),
      agents: current.agents.map((agent) => ({
        ...agent,
        knowledgeIds: agent.knowledgeIds.filter((id) => id !== docId),
      })),
    }));
    notify("知识文档已删除并解除 Agent 关联");
  };

  const toggleDocAgentLink = (docId: string, agentId: string) => {
    setState((current) => ({
      ...current,
      docs: current.docs.map((doc) => {
        if (doc.id !== docId) return doc;
        const linked = doc.linkedAgents.includes(agentId);
        return {
          ...doc,
          linkedAgents: linked ? doc.linkedAgents.filter((id) => id !== agentId) : [...doc.linkedAgents, agentId],
          updatedAt: "2026-06-21",
        };
      }),
      agents: current.agents.map((agent) => {
        if (agent.id !== agentId) return agent;
        const linked = agent.knowledgeIds.includes(docId);
        return {
          ...agent,
          knowledgeIds: linked ? agent.knowledgeIds.filter((id) => id !== docId) : [...agent.knowledgeIds, docId],
        };
      }),
    }));
    notify("知识库关联已更新");
  };

  const updateRuleEverywhere = (ruleId: string, patch: Partial<Pick<RuleLibraryItem, "title" | "description" | "priority" | "category" | "tags">>) => {
    const libraryPatch = {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    };
    setState((current) => ({
      ...current,
      rules: current.rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...patch,
              updatedAt: "2026-06-21",
            }
          : rule,
      ),
      agents: current.agents.map((agent) => ({
        ...agent,
        rules: agent.rules.map((rule) => (rule.sourceRuleId === ruleId ? { ...rule, ...libraryPatch } : rule)),
      })),
    }));
  };

  const deleteRuleEverywhere = (ruleId: string) => {
    setState((current) => ({
      ...current,
      rules: current.rules.filter((rule) => rule.id !== ruleId),
      agents: current.agents.map((agent) => ({
        ...agent,
        rules: agent.rules.filter((rule) => rule.sourceRuleId !== ruleId),
      })),
    }));
    notify("规则已删除并解除引用");
  };

  const updateAgentRule = (agentId: string, localRuleId: string, patch: Partial<RuleItem>) => {
    const targetAgent = agentsById[agentId];
    const targetRule = targetAgent?.rules.find((rule) => rule.id === localRuleId);
    const globalPatch = {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    };
    const hasGlobalPatch = Object.keys(globalPatch).length > 0;

    setState((current) => ({
      ...current,
      rules:
        targetRule?.sourceRuleId && hasGlobalPatch
          ? current.rules.map((rule) => (rule.id === targetRule.sourceRuleId ? { ...rule, ...globalPatch, updatedAt: "2026-06-21" } : rule))
          : current.rules,
      agents: current.agents.map((agent) => ({
        ...agent,
        rules: agent.rules.map((rule) => {
          if (targetRule?.sourceRuleId && hasGlobalPatch && rule.sourceRuleId === targetRule.sourceRuleId) {
            return { ...rule, ...globalPatch };
          }
          if (agent.id === agentId && rule.id === localRuleId) {
            return { ...rule, ...patch };
          }
          return rule;
        }),
      })),
    }));
  };

  const attachRuleToAgent = (agentId: string, ruleId: string) => {
    const sourceRule = state.rules.find((rule) => rule.id === ruleId);
    if (!sourceRule) return;
    updateAgent(agentId, (agent) => {
      if (agent.rules.some((rule) => rule.sourceRuleId === ruleId)) return agent;
      return {
        ...agent,
        rules: [
          ...agent.rules,
          {
            id: `local-rule-${Date.now()}`,
            sourceRuleId: sourceRule.id,
            title: sourceRule.title,
            description: sourceRule.description,
            priority: sourceRule.priority,
            enabled: true,
          },
        ],
      };
    });
    notify("规则已关联到当前 Agent");
  };

  const createRuleForAgent = (agentId?: string) => {
    if (agentId) {
      // Agent 视角下新增 → 私有草稿，不写入共享规则库
      updateAgent(agentId, (agent) => ({
        ...agent,
        rules: [
          ...agent.rules,
          {
            id: `draft-rule-${Date.now()}`,
            title: "新增私有草稿规则",
            description: "填写规则适用条件、处理方式和人工复核边界。仅该 Agent 可见，可提升为共享规则。",
            priority: "中" as const,
            enabled: true,
          },
        ],
      }));
      notify("私有草稿规则已新增，仅当前 Agent 可见");
    } else {
      // 从规则库页面新增 → 写入共享库
      const id = `rule-${Date.now()}`;
      const newRule: RuleLibraryItem = {
        id,
        title: "新增业务规则",
        description: "填写规则适用条件、处理方式和人工复核边界。",
        priority: "中",
        category: "业务",
        tags: ["新增规则", "待完善"],
        updatedAt: nowLabel(),
      };
      setState((current) => ({ ...current, rules: [newRule, ...current.rules] }));
      notify("规则已新增到统一规则库");
    }
  };

  const promoteRuleToLibrary = (agentId: string, localRuleId: string) => {
    const agent = agentsById[agentId];
    const localRule = agent?.rules.find((r) => r.id === localRuleId);
    if (!localRule) return;
    const libraryId = `rule-promoted-${Date.now()}`;
    const newSharedRule: RuleLibraryItem = {
      id: libraryId,
      title: localRule.title,
      description: localRule.description,
      priority: localRule.priority,
      category: "业务",
      tags: ["从草稿提升"],
      updatedAt: nowLabel(),
    };
    setState((current) => ({
      ...current,
      rules: [newSharedRule, ...current.rules],
      agents: current.agents.map((a) =>
        a.id === agentId
          ? {
              ...a,
              rules: a.rules.map((r) =>
                r.id === localRuleId ? { ...r, sourceRuleId: libraryId } : r,
              ),
            }
          : a,
      ),
    }));
    notify("草稿规则已提升为共享规则，所有 Agent 可引用");
  };

  const detachRuleFromAgent = (agentId: string, localRuleId: string) => {
    updateAgent(agentId, (agent) => ({
      ...agent,
      rules: agent.rules.filter((rule) => rule.id !== localRuleId),
    }));
    notify("规则已从当前 Agent 移除");
  };

  const attachToolToAgent = (agentId: string, toolAssetId: string) => {
    const asset = state.tools.find((t) => t.id === toolAssetId);
    if (!asset) return;
    updateAgent(agentId, (agent) => {
      if (agent.tools.some((t) => t.sourceToolId === toolAssetId)) return agent;
      return {
        ...agent,
        tools: [
          ...agent.tools,
          {
            id: `tool-${Date.now()}`,
            sourceToolId: asset.id,
            name: asset.name,
            description: asset.description,
            enabled: asset.status === "启用",
          },
        ],
      };
    });
    notify("工具已从工具库关联至当前 Agent");
  };

  const detachToolFromAgent = (agentId: string, toolItemId: string) => {
    updateAgent(agentId, (agent) => ({
      ...agent,
      tools: agent.tools.filter((t) => t.id !== toolItemId),
    }));
    notify("工具已从当前 Agent 移除");
  };

  const duplicateAgent = (agentId: string) => {
    const source = agentsById[agentId];
    if (!source) return;
    const clone: Agent = {
      ...source,
      id: `agent-copy-${Date.now()}`,
      name: `${source.name} 副本`,
      status: "draft",
      matrixCellKey: undefined,
      version: "v0.1",
      score: Math.max(60, source.score - 8),
      apiCalls: [],
      timeline: [
        {
          id: `copy-${Date.now()}`,
          title: "复制 Agent",
          description: `基于 ${source.name} 创建副本，等待训练和发布。`,
          time: nowLabel(),
        },
      ],
    };
    setState((current) => ({ ...current, agents: [clone, ...current.agents] }));
    setSelectedAgentId(clone.id);
    setView("detail");
    notify("已复制 Agent 配置");
  };

  const deleteAgent = (agentId: string) => {
    const target = agentsById[agentId];
    if (!target) return;
    if (target.status === "published") {
      const confirmed = window.confirm(`确认删除已发布的 ${target.name}？删除后会解除矩阵节点、暂停接口调用，并清理知识库、工具库和评估记录中的关联。`);
      if (!confirmed) return;
    }

    setState((current) => {
      const nextAgents = current.agents.filter((agent) => agent.id !== agentId);
      return {
        ...current,
        agents: nextAgents,
        docs: current.docs.map((doc) => ({
          ...doc,
          linkedAgents: doc.linkedAgents.filter((id) => id !== agentId),
        })),
        tools: current.tools.map((tool) => ({
          ...tool,
          linkedAgentIds: tool.linkedAgentIds.filter((id) => id !== agentId),
        })),
        evalRuns: current.evalRuns.filter((run) => run.agentId !== agentId),
      };
    });

    if (selectedAgentId === agentId) {
      const fallbackAgent = state.agents.find((agent) => agent.id !== agentId);
      if (fallbackAgent) {
        setSelectedAgentId(fallbackAgent.id);
      }
      setView("agents");
    }
    if (trainingAgentId === agentId) {
      setTrainingAgentId(null);
      setTrainingRun(null);
    }
    if (evaluationAgentId === agentId) {
      setEvaluationAgentId(null);
      setEvaluationRun(null);
    }
    notify(target.status === "published" ? "已删除 Agent，并清理发布与关联记录" : "Agent 已删除");
  };

  const unpublishAgent = (agentId: string) => {
    updateAgent(agentId, (agent) => ({
      ...agent,
      status: agent.trainedOnce ? "trained" : "draft",
      matrixCellKey: undefined,
      timeline: [
        {
          id: `offline-${Date.now()}`,
          title: "从矩阵下线",
          description: "该 Agent 已从节点移除，接口调用暂停。",
          time: nowLabel(),
        },
        ...agent.timeline,
      ],
    }));
    notify("Agent 已从矩阵下线");
  };

  const runEvaluation = (agentId: string) => {
    const agent = agentsById[agentId];
    if (!agent) return;
    if (evaluationAgentId) {
      notify("已有评估任务运行中，请稍后再试");
      return;
    }
    const result = buildEvaluationRunResult(agent);
    setEvaluationAgentId(agentId);
    setEvaluationStep(0);
    setEvaluationRun({
      agentId,
      startedAt: nowLabel(),
      completed: false,
      result,
    });

    evaluationStageCatalog.forEach((_, index) => {
      window.setTimeout(() => {
        setEvaluationStep(index);
        if (index === evaluationStageCatalog.length - 1) {
          window.setTimeout(() => {
            setState((current) => ({
              ...current,
              agents: current.agents.map((item) =>
                item.id === agentId
                  ? {
                      ...item,
                      timeline: [
                        {
                          id: `eval-timeline-${result.runId}`,
                          title: `评估反馈报告 ${result.version}`,
                          description: `完成 ${evaluationStageCatalog.length} 个评估阶段，质量分 ${result.score}，通过率 ${result.passRate}%，门槛状态：${result.gate}。`,
                          time: nowLabel(),
                          version: result.version,
                          metrics: [
                            { label: "质量分", value: String(result.score), tone: result.score >= 88 ? "green" : "amber" },
                            { label: "通过率", value: `${result.passRate}%`, tone: result.passRate >= 90 ? "green" : "amber" },
                            { label: "失败用例", value: String(result.failed), tone: result.failed ? "amber" : "green" },
                            { label: "结构评分", value: String(result.structureScore), tone: result.structureScore >= 88 ? "green" : "amber" },
                            { label: "证据评分", value: String(result.evidenceScore), tone: result.evidenceScore >= 88 ? "green" : "amber" },
                            { label: "门槛", value: result.gate, tone: result.gate === "通过" ? "green" : "amber" },
                          ],
                          steps: result.stages,
                          changes: [...result.findings, ...result.recommendations.map((item) => `评估建议：${item}`)],
                        },
                        ...item.timeline,
                      ],
                    }
                  : item,
              ),
              evalRuns: [
                {
                  id: result.runId,
                  agentId,
                  suite: `${agent.type} 回归评估`,
                  score: result.score,
                  passRate: result.passRate,
                  cases: result.cases,
                  failed: result.failed,
                  time: nowLabel(),
                  notes: result.notes,
                },
                ...current.evalRuns,
              ],
            }));
            setEvaluationRun((current) => (current?.agentId === agentId ? { ...current, completed: true, result } : current));
            setEvaluationAgentId(null);
            notify("评估反馈报告已生成");
          }, 480);
        }
      }, index * 620);
    });
  };

  const invokeAgent = (agentId: string, source: string, payload: string) => {
    const agent = agentsById[agentId];
    if (!agent) return;
    const invokedAt = nowLabel();
    const result = `200 / 已返回 ${payload.length > 24 ? payload.slice(0, 24) : payload || "模拟请求"} 的结构化结果`;
    setState((current) => ({
      ...current,
      agents: current.agents.map((item) =>
        item.id === agentId
          ? {
              ...item,
              apiCalls: [
                {
                  id: `call-${Date.now()}`,
                  source,
                  result,
                  time: invokedAt,
                },
                ...item.apiCalls,
              ],
            }
          : item,
      ),
      apiKeys: current.apiKeys.map((key) => (key.name === source ? { ...key, status: "启用", lastUsed: invokedAt } : key)),
    }));
    notify("模拟请求已发送");
  };

  const toggleTool = (toolId: string) => {
    setState((current) => ({
      ...current,
      tools: current.tools.map((tool) => (tool.id === toolId ? { ...tool, status: tool.status === "启用" ? "停用" : "启用" } : tool)),
    }));
    notify("工具状态已更新");
  };

  const createTool = () => {
    setState((current) => ({
      ...current,
      tools: [
        {
          id: `tool-${Date.now()}`,
          name: "新增工具",
          category: "生成",
          description: "填写工具用途、输入输出和适用 Agent。",
          status: "启用",
          linkedAgentIds: [],
          endpoint: "/tools/new-tool",
        },
        ...current.tools,
      ],
    }));
    notify("工具已新增");
  };

  const updateTool = (toolId: string, patch: Partial<ToolAsset>) => {
    setState((current) => ({
      ...current,
      tools: current.tools.map((tool) => (tool.id === toolId ? { ...tool, ...patch } : tool)),
    }));
  };

  const deleteTool = (toolId: string) => {
    setState((current) => ({
      ...current,
      tools: current.tools.filter((tool) => tool.id !== toolId),
    }));
    notify("工具已删除");
  };

  const toggleApiKey = (keyId: string) => {
    setState((current) => ({
      ...current,
      apiKeys: current.apiKeys.map((key) => (key.id === keyId ? { ...key, status: key.status === "启用" ? "停用" : "启用" } : key)),
    }));
    notify("API Key 状态已更新");
  };

  const createApiKey = () => {
    setState((current) => ({
      ...current,
      apiKeys: [
        {
          id: `key-${Date.now()}`,
          name: "新增调用方",
          scope: "agent:invoke",
          status: "启用",
          lastUsed: "尚未使用",
        },
        ...current.apiKeys,
      ],
    }));
    notify("API Key 已新增");
  };

  const deleteApiKey = (keyId: string) => {
    setState((current) => ({
      ...current,
      apiKeys: current.apiKeys.filter((key) => key.id !== keyId),
    }));
    notify("API Key 已删除");
  };

  const updateApiKey = (keyId: string, patch: Partial<ApiKeyRecord>) => {
    setState((current) => ({
      ...current,
      apiKeys: current.apiKeys.map((key) => (key.id === keyId ? { ...key, ...patch } : key)),
    }));
  };

  const resetDemo = () => {
    const confirmed = window.confirm("确认重置演示数据？训练、发布和反馈状态会恢复到初始版本。");
    if (!confirmed) return;
    setState(defaultState);
    setSelectedAgentId("contract-review");
    setSelectedCellKey(null);
    setHighlightedCell(null);
    setView("matrix");
    notify("演示数据已重置");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MC</div>
          <div>
            <div className="brand-title">滴灌通Agent平台</div>
            <div className="brand-subtitle">Work / Functional Flow</div>
          </div>
        </div>

        <nav className="nav-stack" aria-label="主导航">
          <NavButton icon={<Grid3X3 />} label="矩阵看板" active={view === "matrix"} onClick={() => setView("matrix")} />
          <NavButton icon={<Bot />} label="Agent 管理" active={view === "agents" || view === "detail"} onClick={() => setView("agents")} />
          <NavButton icon={<Database />} label="知识库" active={view === "knowledge"} onClick={() => setView("knowledge")} />
          <NavButton icon={<Settings2 />} label="规则库" active={view === "rules"} onClick={() => setView("rules")} />
          <NavButton icon={<Wrench />} label="工具库" active={view === "tools"} onClick={() => setView("tools")} />
          <NavButton icon={<Layers3 />} label="Skill 库" active={view === "skills"} onClick={() => setView("skills")} />
          <NavButton icon={<CheckCircle2 />} label="评估追踪" active={view === "evaluation"} onClick={() => setView("evaluation")} />
          <NavButton icon={<Code2 />} label="接口中心" active={view === "api"} onClick={() => setView("api")} />
        </nav>

        <div className="sidebar-footer">
          <div className="demo-badge">演示数据</div>
          <button className="ghost-button reset-button" onClick={resetDemo} type="button">
            <RefreshCw size={15} />
            重置
          </button>
        </div>
      </aside>

      <main className="main">
        {view === "matrix" && (
          <MatrixPage
            agents={state.agents}
            tools={state.tools}
            apiKeys={state.apiKeys}
            highlightedCell={highlightedCell}
            selectedCellKey={selectedCellKey}
            onOpenCell={openCell}
            onCloseCell={() => setSelectedCellKey(null)}
            onOpenAgent={openAgent}
            onPlaceAgent={placeAgent}
          />
        )}

        {view === "agents" && (
          <AgentsPage
            agents={state.agents}
            onOpenAgent={openAgent}
            onDuplicateAgent={duplicateAgent}
            onDeleteAgent={deleteAgent}
            onUnpublishAgent={unpublishAgent}
            createOpen={createOpen}
            onOpenCreate={() => setCreateOpen(true)}
            onCloseCreate={() => setCreateOpen(false)}
            onCreateAgent={createAgent}
          />
        )}

        {view === "knowledge" && (
          <KnowledgePage
            docs={state.docs}
            agents={state.agents}
            onOpenAgent={openAgent}
            onAddDoc={addKnowledgeDoc}
            onUpdateDoc={updateKnowledgeDoc}
            onDeleteDoc={deleteKnowledgeDoc}
            onToggleDocAgent={toggleDocAgentLink}
          />
        )}

        {view === "rules" && (
          <RulesPage
            rules={state.rules}
            agents={state.agents}
            onUpdateRule={updateRuleEverywhere}
            onCreateRule={() => createRuleForAgent()}
            onDeleteRule={deleteRuleEverywhere}
            onOpenAgent={openAgent}
          />
        )}

        {view === "tools" && (
          <ToolsPage
            tools={state.tools}
            agents={state.agents}
            onToggleTool={toggleTool}
            onCreateTool={createTool}
            onUpdateTool={updateTool}
            onDeleteTool={deleteTool}
            onOpenAgent={openAgent}
          />
        )}

        {view === "evaluation" && (
          <EvaluationPage agents={state.agents} evalRuns={state.evalRuns} onRunEvaluation={runEvaluation} onOpenAgent={openAgent} />
        )}

        {view === "skills" && (
          <SkillLibraryPage
            skills={state.skills}
            onCreateSkill={() => {
              setState((s) => ({
                ...s,
                skills: [
                  {
                    id: `skill-${Date.now()}`,
                    name: "新建 Skill",
                    version: "v0.1",
                    description: "填写该 Skill 的用途和适用场景。",
                    category: "通用",
                    steps: [],
                    linkedAgentCount: 0,
                    updatedAt: nowLabel(),
                  },
                  ...s.skills,
                ],
              }));
              notify("Skill 已创建");
            }}
            onUpdateSkill={(skillId, patch) => {
              setState((s) => ({
                ...s,
                skills: s.skills.map((sk) => sk.id === skillId ? { ...sk, ...patch, updatedAt: nowLabel() } : sk),
              }));
            }}
            onDeleteSkill={(skillId) => {
              setState((s) => ({ ...s, skills: s.skills.filter((sk) => sk.id !== skillId) }));
              notify("Skill 已删除");
            }}
          />
        )}

        {view === "api" && (
          <ApiCenterPage
            agents={state.agents}
            apiKeys={state.apiKeys}
            onInvokeAgent={invokeAgent}
            onToggleApiKey={toggleApiKey}
            onCreateApiKey={createApiKey}
            onUpdateApiKey={updateApiKey}
            onDeleteApiKey={deleteApiKey}
            onOpenAgent={openAgent}
          />
        )}

        {view === "detail" && selectedAgent && (
          <AgentDetailPage
            agent={selectedAgent}
            docs={state.docs}
            agents={state.agents}
            trainingAgentId={trainingAgentId}
            trainingStep={trainingStep}
            onBack={() => setView("agents")}
            onUpdateAgent={updateAgent}
            onTrain={startTraining}
            onFeedback={submitFeedback}
            onPublish={placeAgent}
            onOpenKnowledge={() => setView("knowledge")}
            onToggleKnowledgeLink={toggleDocAgentLink}
            onUnpublishAgent={unpublishAgent}
            onRunEvaluation={runEvaluation}
            onNotify={notify}
            ruleLibrary={state.rules}
            onAttachRule={attachRuleToAgent}
            onCreateRule={createRuleForAgent}
            onUpdateAgentRule={updateAgentRule}
            onDetachRule={detachRuleFromAgent}
            toolLibrary={state.tools}
            onAttachTool={attachToolToAgent}
            onDetachTool={detachToolFromAgent}
            onPromoteRule={promoteRuleToLibrary}
            skills={state.skills}
          />
        )}
      </main>
      {notice && <div className="toast">{notice}</div>}
      {trainingRun && trainingRunAgent && (
        <TrainingRunModal
          agent={trainingRunAgent}
          run={trainingRun}
          trainingStep={trainingStep}
          onClose={() => { setTrainingRun(null); setTrainingAgentId(null); }}
          onEnterReview={openProposalReview}
        />
      )}
      {proposalReview && (
        <ProposalReviewModal
          agent={agentsById[proposalReview.agentId]}
          review={proposalReview}
          onUpdateProposal={updateProposal}
          onSubmit={submitProposalReview}
          onFinalize={finalizeTraining}
          onClose={() => setProposalReview(null)}
        />
      )}
      {evaluationRun && evaluationRunAgent && (
        <EvaluationRunModal
          agent={evaluationRunAgent}
          run={evaluationRun}
          evaluationStep={evaluationStep}
          onClose={() => setEvaluationRun(null)}
        />
      )}
    </div>
  );
}

function TrainingRunModal({
  agent,
  run,
  trainingStep,
  onClose,
  onEnterReview,
}: {
  agent: Agent;
  run: TrainingRunState;
  trainingStep: number;
  onClose: () => void;
  onEnterReview: () => void;
}) {
  const activeIndex = run.completed ? trainingSteps.length - 1 : Math.min(trainingStep, trainingSteps.length - 1);
  const progress = run.completed ? 100 : Math.round(((activeIndex + 1) / trainingSteps.length) * 100);
  const activeStep = run.result.steps[activeIndex] ?? run.result.steps[0];
  const visibleSteps = run.completed ? run.result.steps : run.result.steps.slice(0, activeIndex + 1);
  const deltaLabel = `${run.result.delta >= 0 ? "+" : ""}${run.result.delta}`;

  return (
    <div className="training-modal-backdrop" role="dialog" aria-modal="true" aria-label="训练运行中心">
      <div className="training-modal">
        <div className="training-modal-hero">
          <button
            className="icon-button training-modal-close"
            type="button"
            onClick={onClose}
            disabled={!run.completed}
            aria-label={run.completed ? "关闭训练报告" : "训练结束后可关闭"}
            title={run.completed ? "关闭" : "训练结束后可关闭"}
          >
            <X size={17} />
          </button>
          <div>
            <div className="eyebrow">Agent Training Run Center</div>
            <h2>{run.completed ? "训练完成，改动提案已就绪" : "训练运行中"}</h2>
            <p>
              {run.completed
                ? `基线评估 → 失败聚类（${run.clusters.length} 个主题）→ 根因诊断 → 提案生成 → 质量过滤，共生成 ${run.proposals.length} 条改动建议。`
                : `${agent.name} 正在执行基线评估、失败聚类、根因诊断、提案生成和质量过滤。`}
            </p>
          </div>
          <div className="training-modal-status">
            <span>{run.completed ? "Completed" : "Live"}</span>
            <strong>{progress}%</strong>
            <small>{run.completed ? "可关闭" : "训练结束后可关闭"}</small>
          </div>
        </div>

        <div className="training-modal-progress">
          <div className="training-modal-progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="training-modal-steps">
            {trainingStepCatalog.map((step, index) => {
              const state = run.completed || index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
              return (
                <div className={`training-modal-step ${state}`} key={step.title}>
                  <span>{index + 1}</span>
                  <strong>{step.title}</strong>
                  <small>{step.system}</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="training-modal-grid">
          <section className="training-live-panel">
            <div className="run-config-head">
              <div>
                <div className="eyebrow">Current Stage</div>
                <h3>{activeStep.title}</h3>
              </div>
              <span>{activeStep.metric}</span>
            </div>
            <p>{activeStep.detail}</p>
            <div className="training-terminal">
              {visibleSteps.map((step, index) => (
                <div key={step.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step.title}</strong>
                  <em>{step.status}</em>
                  <p>{step.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="training-result-panel">
            <div className="modal-score-ring">
              <strong>{run.result.scoreAfter}</strong>
              <span>质量分</span>
            </div>
            <div className="modal-metric-grid">
              <div>
                <span>版本</span>
                <strong>{`${run.result.versionBefore} -> ${run.result.versionAfter}`}</strong>
              </div>
              <div>
                <span>提升点</span>
                <strong>{deltaLabel}</strong>
              </div>
              <div>
                <span>通过率</span>
                <strong>{run.result.passRate}%</strong>
              </div>
              <div>
                <span>置信度</span>
                <strong>{run.result.confidence}%</strong>
              </div>
              <div>
                <span>规则验证</span>
                <strong>{run.result.rulesVerified} 条</strong>
              </div>
              <div>
                <span>工具调用</span>
                <strong>{run.result.toolsVerified} 个</strong>
              </div>
            </div>
          </section>
        </div>

        {run.completed && run.clusters.length > 0 && (
          <div className="training-cluster-summary">
            <div className="section-title small">
              <Filter size={16} />
              失败聚类结果
            </div>
            <div className="cluster-card-list">
              {run.clusters.map((cluster) => (
                <div className="cluster-card" key={cluster.id}>
                  <div className="cluster-card-header">
                    <span className={`proposal-unit-pill ${unitColors[cluster.targetUnit] ?? ""}`}>
                      {cluster.targetUnit === "few-shot" ? "Few-shot" : cluster.targetUnit === "rule" ? "规则" : cluster.targetUnit === "retrieval" ? "检索" : cluster.targetUnit === "instruction" ? "指令" : "参数"}
                    </span>
                    <strong>{cluster.label}</strong>
                    <span className="cluster-case-count">{cluster.caseCount} 个用例</span>
                  </div>
                  <p>{cluster.diagnosis}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="training-report-grid">
          <section>
            <div className="section-title small">
              <Sparkles size={16} />
              本轮改动点
            </div>
            <ul className="modal-change-list">
              {run.result.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="section-title small">
              <ShieldCheck size={16} />
              下一轮建议
            </div>
            <ul className="modal-change-list">
              {run.result.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className={`training-modal-footer ${run.completed ? "complete" : ""}`}>
          <span>
            {run.completed
              ? `系统生成了 ${run.proposals.length} 条改动建议，请进入审查闸门逐条确认。`
              : `开始时间 ${run.startedAt}，正在采集训练指标。`}
          </span>
          {run.completed && (
            <div className="training-footer-actions">
              <button className="ghost-button" type="button" onClick={onClose}>
                跳过审查
              </button>
              <button className="primary-button" type="button" onClick={onEnterReview}>
                <GitCompare size={16} />
                进入审查闸门 ({run.proposals.length} 条)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EvaluationRunModal({
  agent,
  run,
  evaluationStep,
  onClose,
}: {
  agent: Agent;
  run: EvaluationRunState;
  evaluationStep: number;
  onClose: () => void;
}) {
  const activeIndex = run.completed ? evaluationStageCatalog.length - 1 : Math.min(evaluationStep, evaluationStageCatalog.length - 1);
  const progress = run.completed ? 100 : Math.round(((activeIndex + 1) / evaluationStageCatalog.length) * 100);
  const activeStage = run.result.stages[activeIndex] ?? run.result.stages[0];
  const visibleStages = run.completed ? run.result.stages : run.result.stages.slice(0, activeIndex + 1);

  return (
    <div className="training-modal-backdrop" role="dialog" aria-modal="true" aria-label="评估反馈中心">
      <div className="training-modal evaluation-modal">
        <div className="training-modal-hero">
          <button
            className="icon-button training-modal-close"
            type="button"
            onClick={onClose}
            disabled={!run.completed}
            aria-label={run.completed ? "关闭评估反馈" : "评估结束后可关闭"}
            title={run.completed ? "关闭" : "评估结束后可关闭"}
          >
            <X size={17} />
          </button>
          <div>
            <div className="eyebrow">Evaluation Feedback Center</div>
            <h2>{run.completed ? "评估完成，反馈报告已生成" : "评估运行中"}</h2>
            <p>
              {agent.name} 正在执行用例集装载、结构化输出校验、知识规则证据审计、回归评分和评估反馈生成。
            </p>
          </div>
          <div className="training-modal-status">
            <span>{run.completed ? run.result.gate : "Live"}</span>
            <strong>{progress}%</strong>
            <small>{run.completed ? "可关闭" : "评估结束后可关闭"}</small>
          </div>
        </div>

        <div className="training-modal-progress">
          <div className="training-modal-progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="training-modal-steps eval-steps">
            {evaluationStageCatalog.map((stage, index) => {
              const state = run.completed || index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
              return (
                <div className={`training-modal-step ${state}`} key={stage.title}>
                  <span>{index + 1}</span>
                  <strong>{stage.title}</strong>
                  <small>{stage.system}</small>
                </div>
              );
            })}
          </div>
        </div>

        <div className="training-modal-grid">
          <section className="training-live-panel">
            <div className="run-config-head">
              <div>
                <div className="eyebrow">Current Check</div>
                <h3>{activeStage.title}</h3>
              </div>
              <span>{activeStage.metric}</span>
            </div>
            <p>{activeStage.detail}</p>
            <div className="training-terminal">
              {visibleStages.map((stage, index) => (
                <div key={stage.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage.title}</strong>
                  <em>{stage.status}</em>
                  <p>{stage.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="training-result-panel">
            <div className="modal-score-ring">
              <strong>{run.result.score}</strong>
              <span>评估分</span>
            </div>
            <div className="modal-metric-grid">
              <div>
                <span>门槛状态</span>
                <strong>{run.result.gate}</strong>
              </div>
              <div>
                <span>通过率</span>
                <strong>{run.result.passRate}%</strong>
              </div>
              <div>
                <span>失败用例</span>
                <strong>{run.result.failed}</strong>
              </div>
              <div>
                <span>结构评分</span>
                <strong>{run.result.structureScore}</strong>
              </div>
              <div>
                <span>证据评分</span>
                <strong>{run.result.evidenceScore}</strong>
              </div>
              <div>
                <span>稳定性</span>
                <strong>{run.result.stabilityScore}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className="training-report-grid">
          <section>
            <div className="section-title small">
              <Activity size={16} />
              评估发现
            </div>
            <ul className="modal-change-list">
              {run.result.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="section-title small">
              <ShieldCheck size={16} />
              优化建议
            </div>
            <ul className="modal-change-list">
              {run.result.recommendations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className={`training-modal-footer ${run.completed ? "complete" : ""}`}>
          <span>{run.completed ? "评估记录、发现与优化建议已写入版本时间线。" : `开始时间 ${run.startedAt}，正在采集评估反馈。`}</span>
          {run.completed && (
            <button className="primary-button" type="button" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const unitColors: Record<string, string> = {
  "few-shot": "pill-fewshot",
  rule: "pill-rule",
  retrieval: "pill-retrieval",
  instruction: "pill-instruction",
  parameter: "pill-parameter",
};

function ProposalReviewModal({
  agent,
  review,
  onUpdateProposal,
  onSubmit,
  onFinalize,
  onClose,
}: {
  agent: Agent;
  review: ProposalReviewState;
  onUpdateProposal: (id: string, patch: Partial<Proposal>) => void;
  onSubmit: () => void;
  onFinalize: () => void;
  onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const pendingCount = review.proposals.filter((p) => p.status === "pending").length;
  const acceptedCount = review.proposals.filter((p) => p.status === "accepted" || p.status === "edited").length;
  const rejectedCount = review.proposals.filter((p) => p.status === "rejected").length;
  const allDecided = pendingCount === 0;

  const clusterMap = new Map(review.clusters.map((c) => [c.id, c]));
  const grouped = new Map<string | undefined, Proposal[]>();
  for (const p of review.proposals) {
    const key = p.clusterId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }
  const orderedGroupKeys = [
    ...review.clusters.map((c) => c.id as string | undefined),
    undefined,
  ].filter((k) => grouped.has(k));

  const getDepLabel = (depId: string) => {
    const dep = review.proposals.find((p) => p.id === depId);
    return dep?.unitLabel ?? depId;
  };

  const startEdit = (proposal: Proposal) => {
    setEditingId(proposal.id);
    setEditDraft(proposal.editedContent ?? proposal.after);
  };

  const saveEdit = (id: string) => {
    onUpdateProposal(id, { status: "edited", editedContent: editDraft });
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  return (
    <div className="training-modal-backdrop proposal-backdrop" role="dialog" aria-modal="true" aria-label="审查改动建议">
      <div className="training-modal proposal-modal">
        <div className="training-modal-hero">
          <button
            className="icon-button training-modal-close"
            type="button"
            onClick={onClose}
            disabled={review.phase === "gating"}
            aria-label="关闭"
          >
            <X size={17} />
          </button>
          <div>
            <div className="eyebrow">Human Review Gate</div>
            <h2>
              {review.phase === "review" && "审查 Agent 改动建议"}
              {review.phase === "gating" && "回归守门中…"}
              {review.phase === "done" && (review.gateResult?.passed ? "守门通过，可升版" : "守门未通过")}
            </h2>
            <p>
              {review.phase === "review" &&
                `系统根据失败用例分析生成了 ${review.proposals.length} 条改动建议。请逐条审查，这是本轮训练唯一需要你动手的地方。`}
              {review.phase === "gating" &&
                "正在对候选版本跑训练集和留出集，验证改动没有引起回归退步…"}
              {review.phase === "done" &&
                (review.gateResult?.passed
                  ? `训练集 +${review.gateResult.trainDelta}，留出集 +${review.gateResult.holdoutDelta}，守门通过，可提交升版。`
                  : "留出集得分下降，部分改动已被自动剔除，请重新审查。")}
            </p>
          </div>
          <div className="training-modal-status">
            <span>{review.phase === "review" ? "Review" : review.phase === "gating" ? "Gating" : review.gateResult?.passed ? "Passed" : "Failed"}</span>
            <strong>
              {review.phase === "review"
                ? `${acceptedCount + rejectedCount}/${review.proposals.length}`
                : review.phase === "gating"
                ? "…"
                : review.gateResult?.passed
                ? "✓"
                : "✗"}
            </strong>
            <small>
              {review.phase === "review" ? (allDecided ? "全部审查完毕" : `待审查 ${pendingCount} 条`) : review.phase === "gating" ? "守门中" : "守门完成"}
            </small>
          </div>
        </div>

        {review.phase === "gating" && (
          <div className="proposal-gating-bar">
            <div className="proposal-gating-progress" />
            <p>在 train 集和 holdout 集上重跑候选版本，验证训练集提升且留出集未退步…</p>
          </div>
        )}

        {review.phase !== "gating" && (
          <div className="proposal-list">
            {orderedGroupKeys.map((groupKey) => {
              const cluster = groupKey ? clusterMap.get(groupKey) : undefined;
              const groupProposals = grouped.get(groupKey) ?? [];
              return (
                <div className="proposal-cluster-group" key={groupKey ?? "__unclustered__"}>
                  {cluster && (
                    <div className="proposal-cluster-header">
                      <span className={`proposal-unit-pill ${unitColors[cluster.targetUnit] ?? ""}`}>
                        {cluster.targetUnit === "few-shot" ? "Few-shot" : cluster.targetUnit === "rule" ? "规则" : cluster.targetUnit === "retrieval" ? "检索" : cluster.targetUnit === "instruction" ? "指令" : "参数"}
                      </span>
                      <strong>{cluster.label}</strong>
                      <span className="cluster-case-count">{cluster.caseCount} 个失败用例</span>
                    </div>
                  )}
                  {!cluster && groupProposals.length > 0 && (
                    <div className="proposal-cluster-header unclustered">
                      <strong>其他改动建议</strong>
                    </div>
                  )}
                  {groupProposals.map((proposal) => {
                    const isEditing = editingId === proposal.id;
                    const isAutoRejected = review.gateResult?.autoRejectedIds.includes(proposal.id);
                    return (
                      <div
                        className={`proposal-card ${proposal.status !== "pending" ? `proposal-${proposal.status}` : ""} ${isAutoRejected ? "proposal-auto-rejected" : ""}`}
                        key={proposal.id}
                      >
                        <div className="proposal-card-header">
                          <span className={`proposal-unit-pill ${unitColors[proposal.unit] ?? ""}`}>{proposal.unitLabel}</span>
                          {proposal.unit === "rule" && proposal.ruleIsolationType && (
                            <span className={`rule-isolation-pill isolation-${proposal.ruleIsolationType}`}>
                              {proposal.ruleIsolationType === "binding" ? "启/停绑定" : proposal.ruleIsolationType === "create" ? "新建草稿" : "修改共享规则"}
                            </span>
                          )}
                          {proposal.unit === "rule" && proposal.ruleIsolationType === "content" && (
                            <span className="proposal-risk-flag">
                              <AlertTriangle size={13} />
                              高风险·影响所有引用方
                            </span>
                          )}
                          {proposal.riskFlag && proposal.ruleIsolationType !== "content" && (
                            <span className="proposal-risk-flag">
                              <AlertTriangle size={13} />
                              过拟合风险
                            </span>
                          )}
                          {isAutoRejected && <span className="proposal-risk-flag">⚙ 守门自动剔除</span>}
                          {proposal.status !== "pending" && !isAutoRejected && (
                            <span className={`proposal-decision-badge proposal-decision-${proposal.status}`}>
                              {proposal.status === "accepted" ? "✓ 已接受" : proposal.status === "edited" ? "✎ 已编辑" : "✗ 已拒绝"}
                            </span>
                          )}
                        </div>

                        {(proposal.dependsOn?.length || proposal.conflictsWith?.length) && (
                          <div className="proposal-dep-row">
                            {proposal.dependsOn?.map((depId) => (
                              <span className="proposal-dep-badge dep" key={depId}>
                                依赖 · {getDepLabel(depId)}
                              </span>
                            ))}
                            {proposal.conflictsWith?.map((conId) => (
                              <span className="proposal-dep-badge conflict" key={conId}>
                                冲突 · {getDepLabel(conId)}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="proposal-diff">
                          <div className="proposal-diff-before">
                            <span>改前</span>
                            <p>{proposal.before}</p>
                          </div>
                          <div className="proposal-diff-arrow">→</div>
                          <div className="proposal-diff-after">
                            <span>改后</span>
                            {isEditing ? (
                              <textarea
                                className="proposal-edit-textarea"
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                autoFocus
                              />
                            ) : (
                              <p>{proposal.editedContent ?? proposal.after}</p>
                            )}
                          </div>
                        </div>

                        <div className="proposal-meta">
                          <div className="proposal-reason">
                            <span>诊断原因</span>
                            <p>{proposal.reason}</p>
                          </div>
                          <div className="proposal-trigger">
                            <span>触发用例</span>
                            <strong>{proposal.triggerCase}</strong>
                          </div>
                        </div>

                        {review.phase === "review" && (
                          <div className="proposal-actions">
                            {proposal.unit === "rule" && proposal.ruleIsolationType === "content" ? (
                              <>
                                <span className="rule-content-notice">修改共享规则内容需资产维护者审批，业务训练者只能提交申请。</span>
                                <button
                                  className="proposal-btn-edit"
                                  type="button"
                                  onClick={() => onUpdateProposal(proposal.id, { status: "accepted" })}
                                >
                                  <Save size={13} />
                                  提交变更申请
                                </button>
                                <button
                                  className={`proposal-btn-reject ${proposal.status === "rejected" ? "active" : ""}`}
                                  type="button"
                                  onClick={() => onUpdateProposal(proposal.id, { status: "rejected" })}
                                >
                                  <ThumbsDown size={13} />
                                  拒绝
                                </button>
                              </>
                            ) : isEditing ? (
                              <>
                                <button className="proposal-btn-accept" type="button" onClick={() => saveEdit(proposal.id)}>
                                  <Save size={13} />
                                  保存编辑
                                </button>
                                <button className="proposal-btn-reject" type="button" onClick={cancelEdit}>
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className={`proposal-btn-accept ${proposal.status === "accepted" ? "active" : ""}`}
                                  type="button"
                                  onClick={() => onUpdateProposal(proposal.id, { status: "accepted" })}
                                >
                                  <ThumbsUp size={13} />
                                  接受
                                </button>
                                <button
                                  className={`proposal-btn-edit ${proposal.status === "edited" ? "active" : ""}`}
                                  type="button"
                                  onClick={() => startEdit(proposal)}
                                >
                                  <Edit3 size={13} />
                                  编辑后接受
                                </button>
                                <button
                                  className={`proposal-btn-reject ${proposal.status === "rejected" ? "active" : ""}`}
                                  type="button"
                                  onClick={() => onUpdateProposal(proposal.id, { status: "rejected" })}
                                >
                                  <ThumbsDown size={13} />
                                  拒绝
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div className={`training-modal-footer ${review.phase !== "review" ? "complete" : ""}`}>
          {review.phase === "review" && (
            <>
              <span>
                {allDecided
                  ? `已审查全部 ${review.proposals.length} 条改动（接受 ${acceptedCount} 条，拒绝 ${rejectedCount} 条）。`
                  : `还有 ${pendingCount} 条未审查，全部决定后可提交。`}
              </span>
              <button className="primary-button" type="button" onClick={onSubmit} disabled={!allDecided || acceptedCount === 0}>
                <ShieldCheck size={16} />
                提交审查 · 运行回归守门
              </button>
            </>
          )}
          {review.phase === "gating" && (
            <span>正在跑训练集与留出集，请稍候…</span>
          )}
          {review.phase === "done" && review.gateResult && (
            <>
              <div className="gate-result-block">
                <span>
                  训练集质量分 {review.trainingResult.scoreBefore}→+{review.gateResult.trainDelta}，
                  留出集 {review.gateResult.holdoutDelta >= 0 ? `+${review.gateResult.holdoutDelta}` : review.gateResult.holdoutDelta}，
                  {review.gateResult.passed ? "守门通过。" : "留出集未提升，部分改动已自动剔除。"}
                </span>
                {review.gateResult.holdoutCount < 10 && (
                  <span className="gate-reliability-note">
                    <AlertTriangle size={12} />
                    {review.gateResult.holdoutCount === 0
                      ? "留出集为空，守门结论仅供参考，建议补充留出用例后重新评估。"
                      : `留出集仅 ${review.gateResult.holdoutCount} 条，样本量偏少，结论可信度有限。`}
                  </span>
                )}
              </div>
              <div className="training-footer-actions">
                <button className="ghost-button" type="button" onClick={onClose}>
                  放弃本轮
                </button>
                {review.gateResult.passed && (
                  <button className="primary-button" type="button" onClick={onFinalize}>
                    <Rocket size={16} />
                    升版提交 ({review.trainingResult.versionBefore} → {review.trainingResult.versionAfter})
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function describeCell(key: string) {
  const [workId, funcId] = key.split(":");
  const work = workFlows.find((item) => item.id === workId)?.label ?? workId;
  const func = functionalFlows.find((item) => item.id === funcId)?.label ?? funcId;
  return `${work} x ${func}`;
}

function getCellState(agent?: Agent) {
  if (!agent) return { label: "待规划", className: "planned" };
  if (agent.status === "published") return { label: "已发布", className: "published" };
  return { label: "待训练", className: "training" };
}

function MatrixPage({
  agents,
  tools,
  apiKeys,
  highlightedCell,
  selectedCellKey,
  onOpenCell,
  onCloseCell,
  onOpenAgent,
  onPlaceAgent,
}: {
  agents: Agent[];
  tools: ToolAsset[];
  apiKeys: ApiKeyRecord[];
  highlightedCell: string | null;
  selectedCellKey: string | null;
  onOpenCell: (key: string) => void;
  onCloseCell: () => void;
  onOpenAgent: (agentId: string) => void;
  onPlaceAgent: (agentId: string, targetCellKey: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "training" | "planned">("all");
  const [workFilter, setWorkFilter] = useState("all");
  const [heatmap, setHeatmap] = useState(false);

  const agentByCell = useMemo(() => {
    const entries = agents.filter((agent) => agent.matrixCellKey).map((agent) => [agent.matrixCellKey!, agent]);
    return Object.fromEntries(entries) as Record<string, Agent>;
  }, [agents]);

  const counts = useMemo(() => {
    const placed = agents.filter((agent) => agent.matrixCellKey);
    const published = agents.filter((agent) => agent.status === "published");
    const avgScore = Math.round(agents.reduce((sum, agent) => sum + agent.score, 0) / Math.max(agents.length, 1));
    return {
      total: 80,
      agentTotal: agents.length,
      placed: placed.length,
      published: placed.filter((agent) => agent.status === "published").length,
      publishedAgents: published.length,
      training: placed.filter((agent) => agent.status !== "published").length,
      planned: 80 - placed.length,
      avgScore,
      enabledTools: tools.filter((tool) => tool.status === "启用").length,
      activeApiKeys: apiKeys.filter((key) => key.status === "启用").length,
    };
  }, [agents, apiKeys, tools]);

  const selectedAgent = selectedCellKey ? agentByCell[selectedCellKey] : undefined;

  const visibleWorkFlows = workFlows.filter((work) => workFilter === "all" || work.id === workFilter);
  const matchesCell = (key: string, agent?: Agent) => {
    const state = getCellState(agent).className;
    const hitStatus = statusFilter === "all" || statusFilter === state;
    const text = `${describeCell(key)} ${agent?.name ?? "待规划"} ${agent?.type ?? ""}`.toLowerCase();
    const hitQuery = text.includes(query.toLowerCase());
    return hitStatus && hitQuery;
  };

  return (
    <section className="page page-matrix">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="Work Flow x Functional Flow"
          title="矩阵看板"
        />

        <div className="metric-row wide-metrics">
          <Metric icon={<Bot />} label="Agent 总数" value={counts.agentTotal.toString()} />
          <Metric icon={<Grid3X3 />} label="已落位节点" value={`${counts.placed}/${counts.total}`} />
          <Metric icon={<Rocket />} label="已发布 Agent" value={counts.publishedAgents.toString()} tone="green" />
          <Metric icon={<Star />} label="平均质量分" value={counts.avgScore.toString()} tone={counts.avgScore >= 86 ? "green" : "amber"} />
          <Metric icon={<Wrench />} label="启用工具" value={counts.enabledTools.toString()} />
          <Metric icon={<Code2 />} label="接口密钥" value={counts.activeApiKeys.toString()} />
        </div>

        <div className="matrix-control-bar">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点、Agent、类型" />
          </label>
          <label className="select-box">
            <Filter size={16} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "published" | "training" | "planned")}>
              <option value="all">全部节点</option>
              <option value="published">已发布</option>
              <option value="training">待训练</option>
              <option value="planned">待规划</option>
            </select>
          </label>
          <label className="select-box">
            <Route size={16} />
            <select value={workFilter} onChange={(event) => setWorkFilter(event.target.value)}>
              <option value="all">全部 Work Flow</option>
              {workFlows.map((work) => (
                <option key={work.id} value={work.id}>
                  {work.label}
                </option>
              ))}
            </select>
          </label>
          <button className={`secondary-button ${heatmap ? "active-toggle" : ""}`} type="button" onClick={() => setHeatmap((value) => !value)}>
            <Activity size={16} />
            热力视图
          </button>
        </div>
      </div>

      <div className="matrix-wrap">
        <div className={`matrix-table ${heatmap ? "heatmap" : ""}`} role="grid" aria-label="Work Flow x Functional Flow 矩阵">
          <div className="matrix-corner">
            <span className="corner-functional">Functional Flow</span>
            <span className="corner-work">Work Flow</span>
          </div>
          {functionalFlows.map((flow) => (
            <div className="matrix-header" key={flow.id}>
              {flow.label}
            </div>
          ))}
          {visibleWorkFlows.map((work) => (
            <div className="matrix-row" key={work.id}>
              <div className="matrix-side">{work.label}</div>
              {functionalFlows.map((func) => {
                const key = cellKey(work.id, func.id);
                const agent = agentByCell[key];
                const state = getCellState(agent);
                const visible = matchesCell(key, agent);
                return (
                  <button
                    className={`matrix-cell ${state.className} ${highlightedCell === key ? "highlight" : ""} ${visible ? "" : "dimmed"}`}
                    key={key}
                    type="button"
                    onClick={() => onOpenCell(key)}
                    aria-label={`${work.label} ${func.label} ${agent?.name ?? "待规划"}`}
                  >
                    <span className={`status-dot ${state.className}`} />
                    <span className="cell-status">{state.label}</span>
                    <span className="cell-agent">{agent?.name ?? "待规划"}</span>
                    {agent && <span className="cell-score">{agent.version} / {agent.score}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedCellKey && (
        <NodePanel
          cellKeyValue={selectedCellKey}
          agent={selectedAgent}
          agents={agents}
          onClose={onCloseCell}
          onOpenAgent={onOpenAgent}
          onPlaceAgent={onPlaceAgent}
        />
      )}
    </section>
  );
}

function NodePanel({
  cellKeyValue,
  agent,
  agents,
  onClose,
  onOpenAgent,
  onPlaceAgent,
}: {
  cellKeyValue: string;
  agent?: Agent;
  agents: Agent[];
  onClose: () => void;
  onOpenAgent: (agentId: string) => void;
  onPlaceAgent: (agentId: string, targetCellKey: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(agent?.id ?? agents[0]?.id ?? "");

  useEffect(() => {
    setSelectedId(agent?.id ?? agents[0]?.id ?? "");
  }, [agent?.id, agents]);

  const cellState = getCellState(agent);

  return (
    <aside className="node-panel" aria-label="节点详情">
      <div className="panel-header">
        <div>
          <div className="eyebrow">节点详情</div>
          <h2>{describeCell(cellKeyValue)}</h2>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      {agent ? (
        <div className="agent-summary-block">
          <span className={`pill ${cellState.className}`}>{cellState.label}</span>
          <h3>{agent.name}</h3>
          <p>{agent.purpose}</p>
          <div className="mini-grid">
            <span>类型</span>
            <strong>{agent.type}</strong>
            <span>版本</span>
            <strong>{agent.version}</strong>
            <span>评分</span>
            <strong>{agent.score}</strong>
          </div>
          <button className="secondary-button" type="button" onClick={() => onOpenAgent(agent.id)}>
            <ArrowRight size={16} />
            进入 Agent 管理
          </button>
        </div>
      ) : (
        <div className="agent-summary-block muted">
          <span className="pill planned">{emptyState.title}</span>
          <h3>{emptyState.title}</h3>
          <p>{emptyState.text}</p>
        </div>
      )}

      <div className="placement-box">
        <div className="section-title">
          <Route size={16} />
          轻量放置 / 替换
        </div>
        <label className="field-label" htmlFor="placement-agent">
          选择 Agent
        </label>
        <select id="placement-agent" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {agents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} / {statusCopy[item.status]}
            </option>
          ))}
        </select>
        <button className="primary-button full" type="button" onClick={() => onPlaceAgent(selectedId, cellKeyValue)}>
          <Save size={16} />
          放置到该节点
        </button>
      </div>
    </aside>
  );
}

function AgentsPage({
  agents,
  onOpenAgent,
  onDuplicateAgent,
  onDeleteAgent,
  onUnpublishAgent,
  createOpen,
  onOpenCreate,
  onCloseCreate,
  onCreateAgent,
}: {
  agents: Agent[];
  onOpenAgent: (agentId: string) => void;
  onDuplicateAgent: (agentId: string) => void;
  onDeleteAgent: (agentId: string) => void;
  onUnpublishAgent: (agentId: string) => void;
  createOpen: boolean;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onCreateAgent: (name: string, purpose: string, type: string, inputSchema: string[], outputSchema: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | AgentStatus>("all");
  const [type, setType] = useState("all");

  const types = useMemo(() => Array.from(new Set(agents.map((agent) => agent.type))), [agents]);
  const filtered = agents.filter((agent) => {
    const hitQuery = `${agent.name}${agent.type}${agent.purpose}`.toLowerCase().includes(query.toLowerCase());
    const hitStatus = status === "all" || agent.status === status;
    const hitType = type === "all" || agent.type === type;
    return hitQuery && hitStatus && hitType;
  });

  return (
    <section className="page">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="Agent Management"
          title="Agent 管理"
          description="统一管理 Agent 的定义、训练、测试、发布和接口开放状态。"
          actions={
            <button className="primary-button" type="button" onClick={onOpenCreate}>
              <Plus size={16} />
              新建 Agent
            </button>
          }
        />

        <div className="filter-bar">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Agent、类型或用途" />
          </label>
          <label className="select-box">
            <Filter size={16} />
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | AgentStatus)}>
              <option value="all">全部状态</option>
              <option value="draft">待训练</option>
              <option value="trained">已训练</option>
              <option value="published">已发布</option>
            </select>
          </label>
          <label className="select-box">
            <Bot size={16} />
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">全部类型</option>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {createOpen && <CreateAgentPanel onClose={onCloseCreate} onCreate={onCreateAgent} />}

      <div className="agent-table">
        <div className="table-head">
          <span>Agent</span>
          <span>类型</span>
          <span>状态</span>
          <span>矩阵节点</span>
          <span>评分</span>
          <span>操作</span>
        </div>
        {filtered.map((agent) => (
          <div className="table-row" key={agent.id}>
            <div>
              <strong>{agent.name}</strong>
              <p>{agent.purpose}</p>
            </div>
            <span>{agent.type}</span>
            <span className={`pill ${agent.status === "published" ? "published" : agent.status === "trained" ? "training" : "planned"}`}>
              {statusCopy[agent.status]}
            </span>
            <span className="muted-text">{agent.matrixCellKey ? describeCell(agent.matrixCellKey) : "未放置"}</span>
            <span>{agent.score}</span>
            <div className="row-actions">
              <button className="icon-button agent-action-button" type="button" onClick={() => onOpenAgent(agent.id)} aria-label={`管理 ${agent.name}`} title="管理">
                <Settings2 size={15} />
              </button>
              <button className="icon-button agent-action-button" type="button" onClick={() => onDuplicateAgent(agent.id)} aria-label={`复制 ${agent.name}`} title="复制">
                <Copy size={15} />
              </button>
              <button
                className="icon-button agent-action-button"
                type="button"
                onClick={() => onUnpublishAgent(agent.id)}
                disabled={agent.status !== "published"}
                aria-label={agent.status === "published" ? `下线 ${agent.name}` : `${agent.name} 尚未发布，无法下线`}
                title={agent.status === "published" ? "下线" : "未发布，无法下线"}
              >
                <PowerOff size={15} />
              </button>
              <button
                className="icon-button agent-action-button danger-button"
                type="button"
                onClick={() => onDeleteAgent(agent.id)}
                aria-label={`删除 ${agent.name}`}
                title="删除"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CreateAgentPanel({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, purpose: string, type: string, inputSchema: string[], outputSchema: string[]) => void;
}) {
  const [name, setName] = useState("合同审查 Agent");
  const [type, setType] = useState("合同审查");
  const [purpose, setPurpose] = useState("审查门店现金流合约中的收益分配、披露义务、提前终止、数据授权和争议处理条款。");
  const suggestedBlueprint = inferAgentBlueprint(name, type, purpose);
  const [schemaEdited, setSchemaEdited] = useState(false);
  const [inputSchemaText, setInputSchemaText] = useState(() => schemaToText(suggestedBlueprint.inputSchema));
  const [outputSchemaText, setOutputSchemaText] = useState(() => schemaToText(suggestedBlueprint.outputSchema));

  useEffect(() => {
    if (schemaEdited) return;
    setInputSchemaText(schemaToText(suggestedBlueprint.inputSchema));
    setOutputSchemaText(schemaToText(suggestedBlueprint.outputSchema));
  }, [schemaEdited, suggestedBlueprint]);

  const inputSchema = parseSchemaText(inputSchemaText, suggestedBlueprint.inputSchema);
  const outputSchema = parseSchemaText(outputSchemaText, suggestedBlueprint.outputSchema);

  return (
    <div className="create-panel studio-create-panel">
      <div className="panel-header inline">
        <div>
          <div className="eyebrow">Agent Studio</div>
          <h2>创建业务 Agent 蓝图</h2>
          <p>填写 Agent 要解决的业务问题，系统会生成初始 Prompt、工具链、知识关联、规则和评测集，后续都可继续调整。</p>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="关闭">
          <X size={18} />
        </button>
      </div>

      <div className="create-stepper">
        {["定义职责", "确认输入输出", "装配能力", "生成工作台"].map((step, index) => (
          <div className="create-step active" key={step}>
            <span>{index + 1}</span>
            {step}
          </div>
        ))}
      </div>

      <div className="studio-create-grid direct-create-grid">
        <div className="blueprint-editor">
          <div className="section-title">
            <Bot size={16} />
            Agent 定义
          </div>
          <div className="form-grid">
            <label>
              <span>Agent 名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>能力类型</span>
              <input value={type} onChange={(event) => setType(event.target.value)} />
            </label>
            <label className="wide">
              <span>业务职责</span>
              <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} />
            </label>
          </div>

          <div className="schema-preview-grid">
            <label className="schema-card editable-schema-card">
              <div className="section-title small">
                <Upload size={15} />
                输入契约
              </div>
              <textarea
                value={inputSchemaText}
                onChange={(event) => {
                  setSchemaEdited(true);
                  setInputSchemaText(event.target.value);
                }}
                rows={5}
              />
            </label>
            <label className="schema-card editable-schema-card">
              <div className="section-title small">
                <FileText size={15} />
                输出契约
              </div>
              <textarea
                value={outputSchemaText}
                onChange={(event) => {
                  setSchemaEdited(true);
                  setOutputSchemaText(event.target.value);
                }}
                rows={5}
              />
            </label>
          </div>
        </div>

        <aside className="blueprint-summary">
          <div className="readiness-ring">
            <strong>{suggestedBlueprint.qualityTarget}</strong>
            <span>目标质量分</span>
          </div>
          <div className="blueprint-stat-list">
            <div>
              <span>知识文档</span>
              <strong>{suggestedBlueprint.knowledgeIds.length}</strong>
            </div>
            <div>
              <span>规则卡片</span>
              <strong>{suggestedBlueprint.ruleIds.length}</strong>
            </div>
            <div>
              <span>工具能力</span>
              <strong>{suggestedBlueprint.tools.length}</strong>
            </div>
            <div>
              <span>评测样例</span>
              <strong>{suggestedBlueprint.testCases.length}</strong>
            </div>
          </div>
          <div className="blueprint-hint">
            <strong>系统建议蓝图</strong>
            <span>{suggestedBlueprint.scenario}</span>
          </div>
          <div className="deployment-chip">
            <Rocket size={15} />
            发布门槛：质量分 {suggestedBlueprint.qualityTarget}+ / 延迟 {suggestedBlueprint.latencyTarget}
          </div>
        </aside>
      </div>

      <div className="form-actions">
        <button className="ghost-button" type="button" onClick={onClose}>
          取消
        </button>
        <button className="primary-button" type="button" onClick={() => onCreate(name, purpose, type, inputSchema, outputSchema)}>
          <Sparkles size={16} />
          生成 Agent 工作台
        </button>
      </div>
    </div>
  );
}

function KnowledgePage({
  docs,
  agents,
  onOpenAgent,
  onAddDoc,
  onUpdateDoc,
  onDeleteDoc,
  onToggleDocAgent,
}: {
  docs: KnowledgeDoc[];
  agents: Agent[];
  onOpenAgent: (agentId: string) => void;
  onAddDoc: () => void;
  onUpdateDoc: (docId: string, patch: Partial<KnowledgeDoc>) => void;
  onDeleteDoc: (docId: string) => void;
  onToggleDocAgent: (docId: string, agentId: string) => void;
}) {
  const [selectedDocId, setSelectedDocId] = useState(docs[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [testQuery, setTestQuery] = useState("合同收益分配口径");
  const categories = Array.from(new Set(docs.map((doc) => doc.category)));
  const visibleDocs = docs.filter((doc) => {
    const hitCategory = category === "all" || doc.category === category;
    const haystack = `${doc.title}${doc.category}${doc.tags.join("")}${doc.snippet}`.toLowerCase();
    const hitQuery = haystack.includes(query.toLowerCase());
    return hitCategory && hitQuery;
  });
  useEffect(() => {
    if (!visibleDocs.some((doc) => doc.id === selectedDocId)) {
      setSelectedDocId(visibleDocs[0]?.id ?? docs[0]?.id ?? "");
    }
  }, [docs, selectedDocId, visibleDocs]);
  const selectedDoc = docs.find((doc) => doc.id === selectedDocId) ?? docs[0];
  const searchResults = docs
    .map((doc) => {
      const text = `${doc.title} ${doc.tags.join(" ")} ${doc.snippet}`;
      const score = testQuery
        .split(/\s+/)
        .filter(Boolean)
        .reduce((sum, word) => sum + (text.toLowerCase().includes(word.toLowerCase()) ? 1 : 0), 0);
      return { doc, score };
    })
    .filter((item) => item.score > 0 || item.doc.title.includes("合同"))
    .slice(0, 4);

  return (
    <section className="page">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="Knowledge Base"
          title="统一知识库"
          description="以统一文档、标签和片段预览支撑 Agent 训练、检索和规则解释。"
          actions={
            <button className="primary-button" type="button" onClick={onAddDoc}>
              <Upload size={16} />
              模拟上传文档
            </button>
          }
        />

        <div className="filter-bar knowledge-filter">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文档、标签、片段" />
          </label>
          <label className="select-box">
            <Database size={16} />
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">全部分类</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="knowledge-layout">
        <div className="doc-list">
          {visibleDocs.map((doc) => (
            <button
              className={`doc-item ${doc.id === selectedDoc?.id ? "active" : ""}`}
              type="button"
              key={doc.id}
              onClick={() => setSelectedDocId(doc.id)}
            >
              <FileText size={17} />
              <span>
                <strong>{doc.title}</strong>
                <small>{doc.category} / {doc.updatedAt}</small>
              </span>
            </button>
          ))}
        </div>

        {selectedDoc && (
          <div className="doc-preview">
            <div className="doc-preview-header">
              <div className="doc-edit-head">
                <span className="pill published">{selectedDoc.category}</span>
                <button className="ghost-button compact danger-button" type="button" onClick={() => onDeleteDoc(selectedDoc.id)}>
                  删除文档
                </button>
              </div>
              <div className="form-grid">
                <label>
                  <span>文档标题</span>
                  <input value={selectedDoc.title} onChange={(event) => onUpdateDoc(selectedDoc.id, { title: event.target.value })} />
                </label>
                <label>
                  <span>分类</span>
                  <input value={selectedDoc.category} onChange={(event) => onUpdateDoc(selectedDoc.id, { category: event.target.value })} />
                </label>
                <label className="wide">
                  <span>标签</span>
                  <input
                    value={selectedDoc.tags.join("，")}
                    onChange={(event) =>
                      onUpdateDoc(selectedDoc.id, {
                        tags: event.target.value
                          .split(/[，,]/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="wide">
                  <span>片段预览</span>
                  <textarea value={selectedDoc.snippet} onChange={(event) => onUpdateDoc(selectedDoc.id, { snippet: event.target.value })} rows={4} />
                </label>
              </div>
            </div>
            <div className="tag-row">
              {selectedDoc.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <div className="retrieval-box">
              <div className="section-title">
                <Search size={16} />
                检索测试
              </div>
              <input value={testQuery} onChange={(event) => setTestQuery(event.target.value)} />
              <div className="retrieval-results">
                {searchResults.map(({ doc, score }) => (
                  <div key={doc.id}>
                    <strong>{doc.title}</strong>
                    <span>相关度 {Math.min(99, 72 + score * 9)}%</span>
                    <p>{doc.snippet}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="linked-agents">
              <div className="section-title">
                <Bot size={16} />
                Agent 关联
              </div>
              <div className="doc-agent-link-grid">
                {agents.slice(0, 12).map((agent) => (
                  <div className="doc-agent-link" key={agent.id}>
                    <label className="link-check-body">
                      <input
                        type="checkbox"
                        checked={selectedDoc.linkedAgents.includes(agent.id)}
                        onChange={() => onToggleDocAgent(selectedDoc.id, agent.id)}
                      />
                      <span>
                        <strong>{agent.name}</strong>
                        <small>{agent.type} / {statusCopy[agent.status]}</small>
                      </span>
                    </label>
                    <button className="ghost-button compact" type="button" onClick={() => onOpenAgent(agent.id)}>
                      详情
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function RulesPage({
  rules,
  agents,
  onUpdateRule,
  onCreateRule,
  onDeleteRule,
  onOpenAgent,
}: {
  rules: RuleLibraryItem[];
  agents: Agent[];
  onUpdateRule: (ruleId: string, patch: Partial<Pick<RuleLibraryItem, "title" | "description" | "priority" | "category" | "tags">>) => void;
  onCreateRule: () => void;
  onDeleteRule: (ruleId: string) => void;
  onOpenAgent: (agentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = Array.from(new Set(rules.map((rule) => rule.category)));
  const visibleRules = rules.filter((rule) => {
    const haystack = `${rule.title}${rule.description}${rule.category}${rule.tags.join("")}`.toLowerCase();
    const hitQuery = haystack.includes(query.toLowerCase());
    const hitCategory = category === "all" || rule.category === category;
    return hitQuery && hitCategory;
  });

  const getLinkedAgents = (ruleId: string) => agents.filter((agent) => agent.rules.some((rule) => rule.sourceRuleId === ruleId));

  return (
    <section className="page">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="Rule Library"
          title="统一规则库"
          description="统一维护业务规则资产。Agent 详情页只选择和启停规则；名称、说明、优先级。"
          actions={
            <button className="primary-button" type="button" onClick={onCreateRule}>
              <Plus size={16} />
              新增规则
            </button>
          }
        />

        <div className="filter-bar knowledge-filter">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则、标签、说明" />
          </label>
          <label className="select-box">
            <Settings2 size={16} />
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">全部分类</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rule-library-grid">
        {visibleRules.map((rule) => {
          const linkedAgents = getLinkedAgents(rule.id);
          return (
            <div className="rule-library-card" key={rule.id}>
              <div className="rule-library-head">
                <span className="pill published">{rule.category}</span>
                <div className="inline-actions">
                  <span className="muted-text">更新：{rule.updatedAt}</span>
                  <button className="ghost-button compact danger-button" type="button" onClick={() => onDeleteRule(rule.id)}>
                    删除
                  </button>
                </div>
              </div>
              <label>
                <span>规则名称</span>
                <input value={rule.title} onChange={(event) => onUpdateRule(rule.id, { title: event.target.value })} />
              </label>
              <label>
                <span>规则说明</span>
                <textarea value={rule.description} onChange={(event) => onUpdateRule(rule.id, { description: event.target.value })} rows={3} />
              </label>
              <div className="rule-meta-grid">
                <label>
                  <span>优先级</span>
                  <select value={rule.priority} onChange={(event) => onUpdateRule(rule.id, { priority: event.target.value as "高" | "中" | "低" })}>
                    <option value="高">高</option>
                    <option value="中">中</option>
                    <option value="低">低</option>
                  </select>
                </label>
                <label>
                  <span>分类</span>
                  <input value={rule.category} onChange={(event) => onUpdateRule(rule.id, { category: event.target.value })} />
                </label>
              </div>
              <label>
                <span>标签</span>
                <input value={rule.tags.join("，")} onChange={(event) => onUpdateRule(rule.id, { tags: event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) })} />
              </label>
              <div className="linked-agents-compact">
                <strong>引用 Agent：{linkedAgents.length}</strong>
                <div>
                  {linkedAgents.slice(0, 5).map((agent) => (
                    <button type="button" key={agent.id} onClick={() => onOpenAgent(agent.id)}>
                      {agent.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ToolsPage({
  tools,
  agents,
  onToggleTool,
  onCreateTool,
  onUpdateTool,
  onDeleteTool,
  onOpenAgent,
}: {
  tools: ToolAsset[];
  agents: Agent[];
  onToggleTool: (toolId: string) => void;
  onCreateTool: () => void;
  onUpdateTool: (toolId: string, patch: Partial<ToolAsset>) => void;
  onDeleteTool: (toolId: string) => void;
  onOpenAgent: (agentId: string) => void;
}) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const categories = Array.from(new Set(tools.map((tool) => tool.category)));
  const visibleTools = tools.filter((tool) => {
    const hitCategory = category === "all" || tool.category === category;
    const hitQuery = `${tool.name}${tool.description}${tool.category}`.toLowerCase().includes(query.toLowerCase());
    return hitCategory && hitQuery;
  });

  return (
    <section className="page">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="Tool Registry"
          title="工具库"
          description="把检索、规则、生成、路由、人工复核和接口网关沉淀成可复用工具，供不同 Agent 编排使用。"
          actions={
            <button className="primary-button" type="button" onClick={onCreateTool}>
              <Plus size={16} />
              新增工具
            </button>
          }
        />

        <div className="filter-bar">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具名称、能力说明" />
          </label>
          <label className="select-box">
            <Wrench size={16} />
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="all">全部工具</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="tool-registry-grid">
        {visibleTools.map((tool) => (
          <div className="tool-asset-card" key={tool.id}>
            <div className="tool-asset-head">
              <span className={`pill ${tool.status === "启用" ? "published" : "planned"}`}>{tool.status}</span>
              <div className="inline-actions">
                <button className="ghost-button compact" type="button" onClick={() => onToggleTool(tool.id)}>
                  {tool.status === "启用" ? "停用" : "启用"}
                </button>
                <button className="ghost-button compact danger-button" type="button" onClick={() => onDeleteTool(tool.id)}>
                  删除
                </button>
              </div>
            </div>
            <div className="tool-edit-form">
              <label>
                <span>工具名称</span>
                <input value={tool.name} onChange={(event) => onUpdateTool(tool.id, { name: event.target.value })} />
              </label>
              <label>
                <span>分类</span>
                <select value={tool.category} onChange={(event) => onUpdateTool(tool.id, { category: event.target.value as ToolAsset["category"] })}>
                  {toolCategoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>能力说明</span>
                <textarea value={tool.description} onChange={(event) => onUpdateTool(tool.id, { description: event.target.value })} rows={3} />
              </label>
              <label className="wide">
                <span>Endpoint</span>
                <input value={tool.endpoint} onChange={(event) => onUpdateTool(tool.id, { endpoint: event.target.value })} />
              </label>
            </div>
            <div className="tag-row compact-tags">
              <span className="tag">{tool.category}</span>
              <span className="tag">{tool.linkedAgentIds.length} 个 Agent</span>
            </div>
            <div className="tool-agent-links">
              {agents.slice(0, 6).map((agent) => {
                const linked = tool.linkedAgentIds.includes(agent.id);
                return (
                  <div className="mini-check-row" key={agent.id}>
                    <label className="link-check-body">
                      <input
                        type="checkbox"
                        checked={linked}
                        onChange={() =>
                          onUpdateTool(tool.id, {
                            linkedAgentIds: linked ? tool.linkedAgentIds.filter((id) => id !== agent.id) : [...tool.linkedAgentIds, agent.id],
                          })
                        }
                      />
                      <span>{agent.name}</span>
                    </label>
                    <button className="ghost-button compact" type="button" onClick={() => onOpenAgent(agent.id)}>
                      详情
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Skill Library Page ────────────────────────────────────────────────────────

function AnchorFieldBadge({ field }: { field: import("./types").AnchorField }) {
  const typeColor: Record<string, string> = {
    enum: "#7c3aed",
    bool: "#0369a1",
    text: "#065f46",
    number: "#92400e",
    list: "#9f1239",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "2px 7px",
        borderRadius: 20,
        background: typeColor[field.type] + "18",
        color: typeColor[field.type],
        fontWeight: 600,
        border: `1px solid ${typeColor[field.type]}30`,
      }}
    >
      <span style={{ opacity: 0.7 }}>{field.key}</span>
      <span>·</span>
      <span>{field.type}</span>
      {field.required && <span style={{ color: "#ef4444", fontSize: 10 }}>*</span>}
    </span>
  );
}

function SkillCard({
  skill,
  onUpdate,
  onDelete,
}: {
  skill: import("./types").Skill;
  onUpdate: (patch: Partial<import("./types").Skill>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const totalFields = skill.steps.reduce((sum, s) => sum + (s.anchor?.fields.length ?? 0), 0);

  const categoryColor: Record<string, string> = { 合规: "#7c3aed", 风控: "#dc2626", 运维: "#2563eb", 通用: "#6b7280" };
  const catColor = categoryColor[skill.category] ?? "#6b7280";

  const updateStep = (idx: number, patch: Partial<import("./types").SkillStep>) => {
    const steps = skill.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onUpdate({ steps });
  };

  const addSkillStep = () => {
    onUpdate({ steps: [...skill.steps, { title: "新步骤", description: "", anchor: { strict: true, fields: [] } }] });
  };

  const removeSkillStep = (idx: number) => {
    onUpdate({ steps: skill.steps.filter((_, i) => i !== idx) });
  };

  const addSkillAnchorField = (stepIdx: number) => {
    const step = skill.steps[stepIdx];
    const newField: import("./types").AnchorField = { id: `skf-${Date.now()}`, key: "新字段", type: "text", required: true, description: "" };
    updateStep(stepIdx, { anchor: { strict: step.anchor?.strict ?? true, fields: [...(step.anchor?.fields ?? []), newField] } });
  };

  const removeSkillAnchorField = (stepIdx: number, fieldId: string) => {
    const step = skill.steps[stepIdx];
    updateStep(stepIdx, { anchor: { ...step.anchor!, fields: step.anchor!.fields.filter((f) => f.id !== fieldId) } });
  };

  const updateSkillAnchorField = (stepIdx: number, fieldId: string, patch: Partial<import("./types").AnchorField>) => {
    const step = skill.steps[stepIdx];
    updateStep(stepIdx, { anchor: { ...step.anchor!, fields: step.anchor!.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) } });
  };

  return (
    <div className={`skill-card ${editing ? "skill-card-editing" : ""}`}>
      <div className="skill-card-header">
        <div className="skill-card-title-row">
          {editing ? (
            <>
              <input
                className="skill-edit-name"
                value={skill.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="Skill 名称"
              />
              <input
                className="skill-edit-version"
                value={skill.version}
                onChange={(e) => onUpdate({ version: e.target.value })}
                placeholder="v1.0"
              />
              <select
                className="skill-edit-category"
                value={skill.category}
                onChange={(e) => onUpdate({ category: e.target.value })}
              >
                {["合规", "风控", "运维", "通用"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          ) : (
            <>
              <span className="skill-card-name">{skill.name}</span>
              <span className="skill-version-badge">{skill.version}</span>
              <span className="skill-category-badge" style={{ background: catColor + "18", color: catColor, border: `1px solid ${catColor}30` }}>
                {skill.category}
              </span>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="ghost-button compact" type="button" onClick={() => setEditing((v) => !v)}>
              {editing ? "完成" : "编辑"}
            </button>
            <button className="ghost-button compact danger-button" type="button" onClick={onDelete}>删除</button>
          </div>
        </div>
        <div className="skill-card-meta">
          <span>{skill.steps.length} 步骤</span>
          <span>·</span>
          <span>{totalFields} 输出字段</span>
          <span>·</span>
          <span>已关联 {skill.linkedAgentCount} 个 Agent</span>
          <span>·</span>
          <span>更新于 {skill.updatedAt}</span>
        </div>
        {editing ? (
          <textarea
            className="skill-edit-desc"
            value={skill.description}
            rows={2}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Skill 用途和适用场景"
          />
        ) : (
          <p className="skill-card-desc">{skill.description}</p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <button className="ghost-button compact" type="button" onClick={() => setExpanded((v) => !v)} style={{ fontSize: 12 }}>
            {expanded ? "收起步骤 ▲" : `展开步骤 (${skill.steps.length}) ▼`}
          </button>
          {editing && (
            <button className="ghost-button compact" type="button" onClick={addSkillStep} style={{ fontSize: 12 }}>
              <Plus size={12} /> 添加步骤
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="skill-steps-list">
          {skill.steps.map((step, i) => (
            <div key={i} className="skill-step-row">
              <div className="skill-step-index">{i + 1}</div>
              <div className="skill-step-body">
                {editing ? (
                  <>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <input
                        className="skill-step-title-input"
                        value={step.title}
                        onChange={(e) => updateStep(i, { title: e.target.value })}
                        placeholder="步骤名称"
                      />
                      <button className="ghost-button compact danger-button" type="button" onClick={() => removeSkillStep(i)}>
                        <X size={12} />
                      </button>
                    </div>
                    <textarea
                      className="skill-step-desc-input"
                      value={step.description}
                      rows={2}
                      onChange={(e) => updateStep(i, { description: e.target.value })}
                      placeholder="步骤描述（SOP 说明）"
                    />
                    <div className="skill-anchor-editor">
                      <div className="skill-anchor-head">
                        <span>输出锚点字段</span>
                        <label className="anchor-strict-toggle">
                          <input
                            type="checkbox"
                            checked={step.anchor?.strict ?? true}
                            onChange={(e) => updateStep(i, { anchor: { ...(step.anchor ?? { fields: [] }), strict: e.target.checked } })}
                          />
                          严格模式
                        </label>
                        <button className="ghost-button compact" type="button" onClick={() => addSkillAnchorField(i)} style={{ fontSize: 11 }}>
                          <Plus size={11} /> 添加字段
                        </button>
                      </div>
                      {(step.anchor?.fields ?? []).map((f) => (
                        <div className="skill-anchor-field-row" key={f.id}>
                          <input value={f.key} placeholder="字段名" onChange={(e) => updateSkillAnchorField(i, f.id, { key: e.target.value })} />
                          <select value={f.type} onChange={(e) => updateSkillAnchorField(i, f.id, { type: e.target.value as import("./types").AnchorField["type"] })}>
                            <option value="enum">enum</option>
                            <option value="bool">bool</option>
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="list">list</option>
                          </select>
                          {f.type === "enum" && (
                            <input
                              value={f.options?.join(",") ?? ""}
                              placeholder="选项A,B"
                              onChange={(e) => updateSkillAnchorField(i, f.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            />
                          )}
                          <label className="anchor-required">
                            <input type="checkbox" checked={f.required} onChange={(e) => updateSkillAnchorField(i, f.id, { required: e.target.checked })} />
                            必填
                          </label>
                          <input value={f.description} placeholder="含义说明" onChange={(e) => updateSkillAnchorField(i, f.id, { description: e.target.value })} />
                          <input
                            value={f.constraint ?? ""}
                            placeholder="跨字段约束（选填）"
                            onChange={(e) => updateSkillAnchorField(i, f.id, { constraint: e.target.value || undefined })}
                          />
                          <button className="ghost-button compact danger-button" type="button" onClick={() => removeSkillAnchorField(i, f.id)}>
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="skill-step-title">{step.title}</div>
                    <div className="skill-step-desc">{step.description}</div>
                    {step.anchor && step.anchor.fields.length > 0 && (
                      <div className="skill-step-anchor">
                        <span className="anchor-label">输出锚点{step.anchor.strict ? "（严格）" : ""}：</span>
                        <div className="anchor-field-badges">
                          {step.anchor.fields.map((f) => <AnchorFieldBadge key={f.id} field={f} />)}
                        </div>
                        {step.anchor.fields.some((f) => f.constraint) && (
                          <div className="anchor-constraints">
                            {step.anchor.fields.filter((f) => f.constraint).map((f) => (
                              <div key={f.id} className="anchor-constraint-row">
                                <span className="anchor-constraint-key">{f.key}：</span>
                                <span className="anchor-constraint-val">{f.constraint}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkillLibraryPage({
  skills,
  onCreateSkill,
  onUpdateSkill,
  onDeleteSkill,
}: {
  skills: import("./types").Skill[];
  onCreateSkill: () => void;
  onUpdateSkill: (skillId: string, patch: Partial<import("./types").Skill>) => void;
  onDeleteSkill: (skillId: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = skills.filter(
    (s) =>
      filter === "" ||
      s.name.includes(filter) ||
      s.category.includes(filter) ||
      s.description.includes(filter),
  );

  const categoryGroups = Array.from(new Set(skills.map((s) => s.category)));

  return (
    <section className="page">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="Skill Library"
          title="Skill 库"
          description="可复用的标准化步骤包，每个 Skill 含 SOP 步骤 + 输出锚点定义，可一键导入任意 Agent 工作流。"
          actions={
            <button className="primary-button" type="button" onClick={onCreateSkill}>
              <Plus size={15} />
              新建 Skill
            </button>
          }
        />
      </div>

      <div className="skill-library-stats">
        {categoryGroups.map((cat) => {
          const count = skills.filter((s) => s.category === cat).length;
          return (
            <div key={cat} className="skill-stat-chip">
              <span className="skill-stat-cat">{cat}</span>
              <span className="skill-stat-count">{count}</span>
            </div>
          );
        })}
        <div className="skill-stat-chip">
          <span className="skill-stat-cat">全部</span>
          <span className="skill-stat-count">{skills.length}</span>
        </div>
      </div>

      <div className="tool-search-bar" style={{ marginBottom: 16 }}>
        <input
          className="rule-search-input"
          placeholder="搜索 Skill 名称、分类或描述…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="skill-concept-banner">
        <div className="skill-concept-title">SOP + 输出锚点 = 稳定工作流</div>
        <div className="skill-concept-body">
          每个工作流步骤通过 <strong>输出锚点（Output Anchor）</strong> 定义结构化输出字段（枚举 / 布尔 / 文本 / 数值 / 列表），约束 Agent 每步必须产出的内容，而不限制推理过程。
          Skill 是步骤 + 锚点的命名版本包，可跨 Agent 复用，并通过版本号管理迭代。
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-hint">没有匹配的 Skill</div>
      ) : (
        <div className="skill-card-list">
          {filtered.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onUpdate={(patch) => onUpdateSkill(skill.id, patch)}
              onDelete={() => onDeleteSkill(skill.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EvaluationPage({
  agents,
  evalRuns,
  onRunEvaluation,
  onOpenAgent,
}: {
  agents: Agent[];
  evalRuns: EvalRun[];
  onRunEvaluation: (agentId: string) => void;
  onOpenAgent: (agentId: string) => void;
}) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? agents[0];
  const selectedRuns = evalRuns.filter((run) => run.agentId === selectedAgent?.id);
  const latestRun = selectedRuns[0];

  useEffect(() => {
    if (!agents.some((agent) => agent.id === agentId)) {
      setAgentId(agents[0]?.id ?? "");
    }
  }, [agentId, agents]);

  return (
    <section className="page">
      <div className="page-sticky-zone evaluation-sticky-zone">
        <PageHeader
          eyebrow="Evaluation & Trace"
          title="评估追踪"
          description="用测试用例、回归评估、执行轨迹和反馈记录证明 Agent 能被持续训练，而不是一次性页面演示。"
          actions={
            <button className="primary-button" type="button" onClick={() => selectedAgent && onRunEvaluation(selectedAgent.id)}>
              <PlayCircle size={16} />
              运行评估
            </button>
          }
        />

        <div className="evaluation-control-bar">
          <label className="select-box evaluation-agent-select">
            <Bot size={16} />
            <select value={selectedAgent?.id ?? ""} onChange={(event) => setAgentId(event.target.value)}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} / {statusCopy[agent.status]}
                </option>
              ))}
            </select>
          </label>
          <div className="eval-focus-stat">
            <span>测试用例</span>
            <strong>{selectedAgent?.testCases.length ?? 0}</strong>
          </div>
          <div className="eval-focus-stat">
            <span>最新通过率</span>
            <strong>{latestRun ? `${latestRun.passRate}%` : "待评估"}</strong>
          </div>
          <div className="eval-focus-stat">
            <span>质量分</span>
            <strong>{latestRun?.score ?? selectedAgent?.score ?? "-"}</strong>
          </div>
          <div className="eval-focus-stat">
            <span>失败用例</span>
            <strong>{latestRun?.failed ?? 0}</strong>
          </div>
        </div>
      </div>

      <div className="evaluation-layout">
        <section className="panel">
          <div className="section-title">
            <Bot size={16} />
            当前 Agent
          </div>
          {selectedAgent && (
            <div className="eval-agent-summary">
              <strong>{selectedAgent.name}</strong>
              <p>{selectedAgent.purpose}</p>
              <div className="mini-grid">
                <span>测试用例</span>
                <strong>{selectedAgent.testCases.length}</strong>
                <span>质量分</span>
                <strong>{selectedAgent.score}</strong>
                <span>版本</span>
                <strong>{selectedAgent.version}</strong>
              </div>
              <button className="secondary-button full" type="button" onClick={() => onOpenAgent(selectedAgent.id)}>
                进入详情
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </section>

        <section className="panel span-2">
          <div className="section-title">
            <CheckCircle2 size={16} />
            测试用例库
          </div>
          <div className="case-grid">
            {selectedAgent?.testCases.map((item) => (
              <div className="case-card" key={item.id}>
                <span className={`pill ${item.status === "通过" ? "published" : item.status === "需优化" ? "training" : "planned"}`}>{item.status}</span>
                <h3>{item.name}</h3>
                <p>{item.input}</p>
                <strong>预期：{item.expected}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel span-3">
          <div className="section-title">
            <Activity size={16} />
            评估运行记录
          </div>
          <div className="eval-table">
            <div className="eval-head">
              <span>时间</span>
              <span>Agent</span>
              <span>评估集</span>
              <span>通过率</span>
              <span>质量分</span>
              <span>备注</span>
            </div>
            {selectedRuns.map((run) => {
              const agent = agents.find((item) => item.id === run.agentId);
              return (
                <div className="eval-row" key={run.id}>
                  <span>{run.time}</span>
                  <button type="button" onClick={() => agent && onOpenAgent(agent.id)}>
                    {agent?.name ?? run.agentId}
                  </button>
                  <span>{run.suite}</span>
                  <strong>{run.passRate}%</strong>
                  <strong>{run.score}</strong>
                  <span>{run.notes}</span>
                </div>
              );
            })}
            {!selectedRuns.length && selectedAgent && (
              <div className="empty-line">当前 Agent 暂无评估记录，点击“运行评估”生成一条模拟回归记录。</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function ApiCenterPage({
  agents,
  apiKeys,
  onInvokeAgent,
  onToggleApiKey,
  onCreateApiKey,
  onUpdateApiKey,
  onDeleteApiKey,
  onOpenAgent,
}: {
  agents: Agent[];
  apiKeys: ApiKeyRecord[];
  onInvokeAgent: (agentId: string, source: string, payload: string) => void;
  onToggleApiKey: (keyId: string) => void;
  onCreateApiKey: () => void;
  onUpdateApiKey: (keyId: string, patch: Partial<ApiKeyRecord>) => void;
  onDeleteApiKey: (keyId: string) => void;
  onOpenAgent: (agentId: string) => void;
}) {
  const publishedAgents = agents.filter((agent) => agent.status === "published");
  const [agentId, setAgentId] = useState(publishedAgents[0]?.id ?? agents[0]?.id ?? "");
  const [source, setSource] = useState("演示沙箱");
  const [payload, setPayload] = useState("请审查这份门店现金流合约，并输出风险、建议和结论。");
  const [invokePreview, setInvokePreview] = useState<null | {
    status: string;
    latency: string;
    endpoint: string;
    source: string;
    summary: string;
    risk: string;
    trace: string[];
  }>(null);
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? agents[0];
  const canInvoke = Boolean(selectedAgent && selectedAgent.status === "published");

  useEffect(() => {
    setInvokePreview(null);
  }, [selectedAgent?.id]);

  const handleInvoke = () => {
    if (!selectedAgent || !canInvoke) return;
    const requestText = payload.trim() || "模拟请求";
    const hitContractSignals = ["合同", "收益", "分配", "提前终止", "披露"].filter((keyword) => requestText.includes(keyword));
    const latency = 420 + ((requestText.length * 7) % 180);

    onInvokeAgent(selectedAgent.id, source, requestText);
    setInvokePreview({
      status: "200 OK",
      latency: `${latency}ms`,
      endpoint: `POST /api/agents/${selectedAgent.id}/invoke`,
      source,
      summary: `${selectedAgent.name} 已返回结构化结果：识别 ${hitContractSignals.length || 1} 类业务信号，输出风险、建议和结论。`,
      risk: hitContractSignals.length >= 3 ? "中高风险，建议人工复核关键条款。" : "常规风险，建议进入业务复核队列。",
      trace: [
        "鉴权通过，调用方 Scope 已校验",
        "加载 Agent Prompt、知识文档和启用规则",
        "执行工具链 Dry-run 并生成结构化响应",
      ],
    });
  };

  return (
    <section className="page">
      <div className="page-sticky-zone">
        <PageHeader
          eyebrow="API Center"
          title="接口中心"
          description="集中展示已发布 Agent 的 mock API、鉴权状态、调用记录和请求调试器，方便说明外部系统如何接入。"
          actions={
            <button className="primary-button" type="button" onClick={onCreateApiKey}>
              <Plus size={16} />
              新增 Key
            </button>
          }
        />
      </div>

      <div className="api-layout">
        <section className="panel">
          <div className="section-title">
            <Code2 size={16} />
            调用调试器
          </div>
          <label className="field-label" htmlFor="api-agent">
            Agent
          </label>
          <select id="api-agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} / {statusCopy[agent.status]}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="api-source">
            调用方
          </label>
          <input id="api-source" value={source} onChange={(event) => setSource(event.target.value)} />
          <label className="field-label" htmlFor="api-payload">
            请求内容
          </label>
          <textarea id="api-payload" value={payload} onChange={(event) => setPayload(event.target.value)} rows={5} />
          <button
            className="primary-button full"
            type="button"
            onClick={handleInvoke}
            disabled={!canInvoke}
          >
            <PlayCircle size={16} />
            发送模拟请求
          </button>
          {selectedAgent?.status !== "published" && <p className="hint-text">只有已发布 Agent 才能开放接口调用。</p>}
          {invokePreview && (
            <div className="api-response-panel">
              <div className="api-response-head">
                <span className="pill published">{invokePreview.status}</span>
                <strong>{invokePreview.latency}</strong>
              </div>
              <code>{invokePreview.endpoint}</code>
              <p>{invokePreview.summary}</p>
              <em>{invokePreview.risk}</em>
              <div className="api-response-trace">
                {invokePreview.trace.map((item, index) => (
                  <div key={item}>
                    <span>{index + 1}</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel span-2">
          <div className="section-title">
            <Rocket size={16} />
            已发布 Agent 接口
          </div>
          <div className="endpoint-list">
            {publishedAgents.map((agent) => (
              <div className="endpoint-card" key={agent.id}>
                <div>
                  <strong>{agent.name}</strong>
                  <code>POST /api/agents/{agent.id}/invoke</code>
                </div>
                <span className="pill published">可调用</span>
                <button className="secondary-button compact" type="button" onClick={() => onOpenAgent(agent.id)}>
                  详情
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <ShieldCheck size={16} />
            API Key
          </div>
          <div className="key-list">
            {apiKeys.map((key) => (
              <div className="key-card" key={key.id}>
                <div className="key-card-head">
                  <span className={`pill ${key.status === "启用" ? "published" : "planned"}`}>{key.status}</span>
                  <div className="inline-actions">
                    <button className="ghost-button compact" type="button" onClick={() => onToggleApiKey(key.id)}>
                      {key.status === "启用" ? "停用" : "启用"}
                    </button>
                    <button className="ghost-button compact danger-button" type="button" onClick={() => onDeleteApiKey(key.id)}>
                      删除
                    </button>
                  </div>
                </div>
                <label>
                  <span>调用方</span>
                  <input value={key.name} onChange={(event) => onUpdateApiKey(key.id, { name: event.target.value })} />
                </label>
                <label>
                  <span>Scope</span>
                  <input value={key.scope} onChange={(event) => onUpdateApiKey(key.id, { scope: event.target.value })} />
                </label>
                <label>
                  <span>最近使用</span>
                  <input value={key.lastUsed} onChange={(event) => onUpdateApiKey(key.id, { lastUsed: event.target.value })} />
                </label>
              </div>
            ))}
          </div>
        </section>

        <section className="panel span-2">
          <div className="section-title">
            <Activity size={16} />
            最近调用记录
          </div>
          <div className="api-calls full-calls">
            {agents
              .flatMap((agent) => agent.apiCalls.map((call) => ({ ...call, agentName: agent.name })))
              .slice(0, 12)
              .map((call) => (
                <div key={`${call.agentName}-${call.id}`}>
                  <span>{call.time}</span>
                  <strong>{call.agentName} / {call.source}</strong>
                  <em>{call.result}</em>
                </div>
              ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function SchemaTagEditor({ label, tags, onChange }: { label: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) { onChange([...tags, val]); }
    setInput("");
  };
  return (
    <div className="schema-tag-editor">
      <span className="schema-tag-label">{label}</span>
      <div className="schema-tags">
        {tags.map((tag) => (
          <span key={tag} className="schema-tag">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))}>×</button>
          </span>
        ))}
        <input
          className="schema-tag-input"
          value={input}
          placeholder="新增字段…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <button className="ghost-button compact" type="button" onClick={add}>+</button>
      </div>
    </div>
  );
}

function AgentDetailPage({
  agent,
  docs,
  agents,
  trainingAgentId,
  trainingStep,
  onBack,
  onUpdateAgent,
  onTrain,
  onFeedback,
  onPublish,
  onOpenKnowledge,
  onToggleKnowledgeLink,
  onUnpublishAgent,
  onRunEvaluation,
  onNotify,
  ruleLibrary,
  onAttachRule,
  onCreateRule,
  onUpdateAgentRule,
  onDetachRule,
  toolLibrary,
  onAttachTool,
  onDetachTool,
  onPromoteRule,
  skills,
}: {
  agent: Agent;
  docs: KnowledgeDoc[];
  agents: Agent[];
  trainingAgentId: string | null;
  trainingStep: number;
  onBack: () => void;
  onUpdateAgent: (agentId: string, updater: (agent: Agent) => Agent) => void;
  onTrain: (agentId: string) => void;
  onFeedback: (agentId: string, score: number, note: string) => void;
  onPublish: (agentId: string, targetCellKey: string, navigateAfterPublish?: boolean) => void;
  onOpenKnowledge: () => void;
  onToggleKnowledgeLink: (docId: string, agentId: string) => void;
  onUnpublishAgent: (agentId: string) => void;
  onRunEvaluation: (agentId: string) => void;
  onNotify: (message: string) => void;
  ruleLibrary: RuleLibraryItem[];
  onAttachRule: (agentId: string, ruleId: string) => void;
  onCreateRule: (agentId?: string) => void;
  onUpdateAgentRule: (agentId: string, localRuleId: string, patch: Partial<RuleItem>) => void;
  onDetachRule: (agentId: string, localRuleId: string) => void;
  toolLibrary: ToolAsset[];
  onAttachTool: (agentId: string, toolAssetId: string) => void;
  onDetachTool: (agentId: string, toolItemId: string) => void;
  onPromoteRule: (agentId: string, localRuleId: string) => void;
  skills: Skill[];
}) {
  const [feedbackScore, setFeedbackScore] = useState(agent.feedbackScore ?? 5);
  const [feedbackNote, setFeedbackNote] = useState(agent.feedbackNote ?? "");
  const [publishWork, setPublishWork] = useState(agent.matrixCellKey?.split(":")[0] ?? "contractual");
  const [publishFunc, setPublishFunc] = useState(agent.matrixCellKey?.split(":")[1] ?? "contract-registrar");
  const [ruleToAttach, setRuleToAttach] = useState(ruleLibrary[0]?.id ?? "");
  const [toolToAttach, setToolToAttach] = useState(toolLibrary[0]?.id ?? "");
  const [activeDetailSection, setActiveDetailSection] = useState("detail-overview");
  const [detailSlideDirection, setDetailSlideDirection] = useState<"forward" | "backward">("forward");
  const isTraining = trainingAgentId === agent.id;

  useEffect(() => {
    setFeedbackScore(agent.feedbackScore ?? 5);
    setFeedbackNote(agent.feedbackNote ?? "");
    setPublishWork(agent.matrixCellKey?.split(":")[0] ?? "contractual");
    setPublishFunc(agent.matrixCellKey?.split(":")[1] ?? "contract-registrar");
  }, [agent.id, agent.feedbackNote, agent.feedbackScore, agent.matrixCellKey]);

  const linkedDocs = docs.filter((doc) => agent.knowledgeIds.includes(doc.id));
  const enabledTools = agent.tools.filter((tool) => tool.enabled).length;
  const enabledRules = agent.rules.filter((rule) => rule.enabled).length;
  const passedCases = agent.testCases.filter((testCase) => testCase.status === "通过").length;
  const agentBlueprint = inferAgentBlueprint(agent.name, agent.type, agent.purpose);
  const inputSchema = getAgentInputSchema(agent, agentBlueprint);
  const outputSchema = getAgentOutputSchema(agent, agentBlueprint);
  const knowledgeReadiness = Math.min(100, Math.round((agent.knowledgeIds.length / Math.max(agentBlueprint.knowledgeIds.length, 1)) * 100));
  const ruleReadiness = Math.min(100, Math.round((enabledRules / Math.max(agentBlueprint.ruleIds.length, 1)) * 100));
  const evalReadiness = Math.min(100, Math.round(((passedCases + (agent.trainedOnce ? 1 : 0)) / Math.max(agent.testCases.length, 1)) * 100));
  const toolReadiness = Math.min(100, Math.round((enabledTools / Math.max(agent.tools.length, 1)) * 100));
  const readinessScore = Math.round((knowledgeReadiness + ruleReadiness + evalReadiness + toolReadiness + Math.min(agent.score, 100)) / 5);
  const productionChecks = [
    { label: "知识覆盖", value: knowledgeReadiness, detail: `${agent.knowledgeIds.length} 份文档` },
    { label: "规则覆盖", value: ruleReadiness, detail: `${enabledRules} 条启用` },
    { label: "工具可用", value: toolReadiness, detail: `${enabledTools}/${agent.tools.length} 个工具` },
    { label: "评测通过", value: evalReadiness, detail: `${passedCases}/${agent.testCases.length} 个样例` },
  ];
  const readinessGaps = productionChecks.filter((check) => check.value < 100);
  const executionStages = [
    { label: "输入契约", value: inputSchema.join(" / ") },
    { label: "规划器", value: `${agent.workflow.filter((step) => step.enabled).length} 个步骤` },
    { label: "工具调用", value: `${enabledTools} 个启用工具` },
    { label: "边界校验", value: `${agent.guardrails.length} 条安全边界` },
    { label: "结构化输出", value: outputSchema.join(" / ") },
  ];
  const detailSections = [
    { id: "detail-overview", label: "概览", summary: `${readinessScore} 分预检` },
    { id: "detail-prompt", label: "白盒配置单元", summary: `${agent.instructionSegments?.length ?? 0} 段 / ${agent.fewShots?.length ?? 0} 示范` },
    { id: "detail-tools", label: "工具与边界", summary: `${enabledTools} 工具 / ${agent.guardrails.length} 边界` },
    { id: "detail-workflow", label: "工作流管理", summary: `${agent.workflow.filter((step) => step.enabled).length} 个步骤` },
    { id: "detail-assets", label: "知识与规则", summary: `${agent.knowledgeIds.length} 文档 / ${enabledRules} 规则` },
    { id: "detail-training", label: "训练评估", summary: `${passedCases}/${agent.testCases.length} 用例` },
    { id: "detail-release", label: "发布接口", summary: "接口配置" },
  ];

  useEffect(() => {
    setActiveDetailSection("detail-overview");
    setDetailSlideDirection("forward");
  }, [agent.id]);

  const openDetailSection = (sectionId: string) => {
    const currentIndex = detailSections.findIndex((section) => section.id === activeDetailSection);
    const nextIndex = detailSections.findIndex((section) => section.id === sectionId);
    setDetailSlideDirection(nextIndex >= currentIndex ? "forward" : "backward");
    setActiveDetailSection(sectionId);
  };

  const paneClass = (sectionId: string, extra = "") =>
    `detail-pane-item detail-pane-${sectionId.replace("detail-", "")} ${activeDetailSection === sectionId ? `active slide-${detailSlideDirection}` : ""} ${extra}`.trim();

  const [anchorExpanded, setAnchorExpanded] = useState<Set<string>>(new Set());
  const toggleAnchorExpanded = (stepId: string) =>
    setAnchorExpanded((prev) => { const next = new Set(prev); next.has(stepId) ? next.delete(stepId) : next.add(stepId); return next; });

  const addAnchorField = (stepId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.map((s) =>
        s.id !== stepId ? s : {
          ...s,
          anchor: {
            strict: s.anchor?.strict ?? true,
            fields: [...(s.anchor?.fields ?? []), { id: `af-${Date.now()}`, key: "新字段", type: "text" as const, required: true, description: "" }],
          },
        },
      ),
    }));
  };

  const removeAnchorField = (stepId: string, fieldId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.map((s) =>
        s.id !== stepId ? s : { ...s, anchor: { ...s.anchor!, fields: s.anchor!.fields.filter((f) => f.id !== fieldId) } },
      ),
    }));
  };

  const updateAnchorField = (stepId: string, fieldId: string, patch: Partial<AnchorField>) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.map((s) =>
        s.id !== stepId ? s : { ...s, anchor: { ...s.anchor!, fields: s.anchor!.fields.map((f) => f.id === fieldId ? { ...f, ...patch } : f) } },
      ),
    }));
  };

  const addRoutingRule = (stepId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.map((s) =>
        s.id !== stepId ? s : {
          ...s,
          routing: [...(s.routing ?? []), { id: `rt-${Date.now()}`, condition: "", nextStepId: "" }],
        },
      ),
    }));
  };

  const removeRoutingRule = (stepId: string, ruleId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.map((s) =>
        s.id !== stepId ? s : { ...s, routing: (s.routing ?? []).filter((r) => r.id !== ruleId) },
      ),
    }));
  };

  const updateRoutingRule = (stepId: string, ruleId: string, patch: { condition?: string; nextStepId?: string }) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.map((s) =>
        s.id !== stepId ? s : {
          ...s,
          routing: (s.routing ?? []).map((r) => r.id === ruleId ? { ...r, ...patch } : r),
        },
      ),
    }));
  };

  const applySkillToWorkflow = (skillId: string) => {
    const skill = skills.find((sk) => sk.id === skillId);
    if (!skill) return;
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: [
        ...item.workflow,
        ...skill.steps.map((step, i) => ({
          id: `sk-step-${Date.now()}-${i}`,
          title: step.title,
          description: step.description,
          enabled: true,
          skillRef: skillId,
          anchor: step.anchor,
        })),
      ],
    }));
    onNotify(`已从 Skill「${skill.name}」引入 ${skill.steps.length} 个步骤`);
  };

  const addGuardrail = () => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      guardrails: [...item.guardrails, "新增安全边界：请填写限制条件和人工复核要求。"],
    }));
    onNotify("安全边界已新增");
  };

  const updateGuardrail = (index: number, value: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      guardrails: item.guardrails.map((guardrail, targetIndex) => (targetIndex === index ? value : guardrail)),
    }));
  };

  const deleteGuardrail = (index: number) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      guardrails: item.guardrails.filter((_, targetIndex) => targetIndex !== index),
    }));
    onNotify("安全边界已删除");
  };

  const addWorkflowStep = () => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: [
        ...item.workflow,
        {
          id: `w-${Date.now()}`,
          title: "新增步骤",
          description: "补充该 Agent 的业务处理动作。",
          enabled: true,
        },
      ],
    }));
    onNotify("工作流步骤已新增");
  };

  const deleteWorkflowStep = (stepId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      workflow: item.workflow.filter((step) => step.id !== stepId),
    }));
    onNotify("工作流步骤已删除");
  };

  const addFewShot = () => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      fewShots: [
        ...(item.fewShots ?? []),
        { id: `fs-${Date.now()}`, input: "填写一条标准输入示例。", output: "填写对应的期望输出。" },
      ],
    }));
    onNotify("Few-shot 示范已新增");
  };

  const deleteFewShot = (fsId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      fewShots: (item.fewShots ?? []).filter((fs) => fs.id !== fsId),
    }));
    onNotify("Few-shot 示范已删除");
  };

  const addInstructionSegment = () => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      instructionSegments: [
        ...(item.instructionSegments ?? []),
        { id: `seg-${Date.now()}`, label: "约束" as const, content: "填写新约束条件。" },
      ],
    }));
    onNotify("指令段已新增");
  };

  const deleteInstructionSegment = (segId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      instructionSegments: (item.instructionSegments ?? []).filter((s) => s.id !== segId),
    }));
    onNotify("指令段已删除");
  };

  const addRubricCriterion = () => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      rubric: [
        ...(item.rubric ?? []),
        { id: `rub-${Date.now()}`, dimension: "新增评估维度", weight: 10, guide: "填写该维度的打分指引。" },
      ],
    }));
    onNotify("Rubric 维度已新增");
  };

  const deleteRubricCriterion = (rubId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      rubric: (item.rubric ?? []).filter((r) => r.id !== rubId),
    }));
    onNotify("Rubric 维度已删除");
  };

  const addTestCase = () => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      testCases: [
        ...item.testCases,
        {
          id: `tc-${Date.now()}`,
          name: "新增测试用例",
          input: "填写一条标准输入样例。",
          expected: "填写预期结构化输出。",
          status: "待验证",
        },
      ],
    }));
    onNotify("测试用例已新增");
  };

  const deleteTestCase = (testCaseId: string) => {
    onUpdateAgent(agent.id, (item) => ({
      ...item,
      testCases: item.testCases.filter((testCase) => testCase.id !== testCaseId),
    }));
    onNotify("测试用例已删除");
  };

  return (
    <section className="page detail-page">
      <div className="detail-topbar">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} />
          返回 Agent 管理
        </button>
        <div className="detail-actions">
          <span className={`pill ${agent.status === "published" ? "published" : agent.status === "trained" ? "training" : "planned"}`}>
            {statusCopy[agent.status]}
          </span>
          <span className="version-badge">{agent.version}</span>
        </div>
      </div>

      <PageHeader
        eyebrow={agent.type}
        title={agent.name}
        description={agent.purpose}
        actions={
          <>
            <button className="secondary-button" type="button" onClick={() => onRunEvaluation(agent.id)}>
              <CheckCircle2 size={16} />
              运行评估
            </button>
            {agent.status === "published" && (
              <button className="ghost-button" type="button" onClick={() => onUnpublishAgent(agent.id)}>
                下线
              </button>
            )}
            <button className="primary-button" type="button" onClick={() => onTrain(agent.id)} disabled={isTraining}>
              {isTraining ? <RefreshCw className="spin" size={16} /> : <PlayCircle size={16} />}
              {isTraining ? "训练中" : agent.trainedOnce ? "继续训练" : "开始训练"}
            </button>
          </>
        }
        sectionNav={
          <nav className="detail-section-nav" aria-label="Agent 详情板块导航">
            {detailSections.map((section, index) => (
              <button
                className={`detail-section-card ${activeDetailSection === section.id ? "active" : ""}`}
                type="button"
                key={section.id}
                onClick={() => openDetailSection(section.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{section.label}</strong>
                <small>{section.summary}</small>
              </button>
            ))}
          </nav>
        }
      />

      <div className="detail-grid detail-page-stage">
        <div className={paneClass("detail-overview", "detail-block-heading span-2")}>
          <span>01</span>
          <div>
            <strong>概览</strong>
            <p>查看当前 Agent 的上线预检、生命周期、矩阵落位和基础运行状态。</p>
          </div>
        </div>

        <div className={paneClass("detail-overview", "agent-studio-hero span-2")}>
          <div className="studio-score-card">
            <div className="score-orbit">
              <strong>{readinessScore}</strong>
              <span>上线预检</span>
            </div>
            <div className="readiness-copy">
              <div className="eyebrow">Production Readiness</div>
              <h2>{readinessScore >= 88 ? "接近可发布状态" : "需要继续训练校准"}</h2>
              <p>
                结合知识覆盖、规则覆盖、工具可用、评测通过率和当前质量分生成预检结果，帮助员工知道下一步该补知识、补规则还是补样例。
              </p>
              <div className="readiness-summary-list">
                <div>
                  <span>发布门槛</span>
                  <strong>{agentBlueprint.qualityTarget}+</strong>
                </div>
                <div>
                  <span>当前质量</span>
                  <strong>{agent.score}</strong>
                </div>
                <div>
                  <span>待补项</span>
                  <strong>{readinessGaps.length ? `${readinessGaps.length} 项` : "0 项"}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="studio-check-grid">
            {productionChecks.map((check) => (
              <div className="studio-check" key={check.label}>
                <div>
                  <span>{check.label}</span>
                  <strong>{check.value}%</strong>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${check.value}%` }} />
                </div>
                <small>{check.detail}</small>
              </div>
            ))}
          </div>

          <div className="execution-map">
            {executionStages.map((stage, index) => (
              <div className="execution-node" key={stage.label}>
                <span>{index + 1}</span>
                <strong>{stage.label}</strong>
                <small>{stage.value}</small>
              </div>
            ))}
          </div>
        </div>

        <section className={paneClass("detail-overview", "panel overview-panel span-2")}>
          <div className="section-title">
            <Activity size={16} />
            概览
          </div>
          <div className="overview-metrics">
            <Metric label="当前评分" value={String(agent.score)} tone={agent.score > 85 ? "green" : "amber"} />
            <Metric label="生命周期" value={statusCopy[agent.status]} />
            <Metric label="矩阵节点" value={agent.matrixCellKey ? "已放置" : "未放置"} />
          </div>
          <div className="mini-grid wide">
            <span>节点</span>
            <strong>{agent.matrixCellKey ? describeCell(agent.matrixCellKey) : "发布时选择"}</strong>
            <span>案例</span>
            <strong>{agent.caseUploaded ? "已上传模拟案例" : "待上传模拟案例"}</strong>
          </div>
          <div className="schema-editor-block">
            <SchemaTagEditor
              label="输入字段"
              tags={agent.inputSchema ?? []}
              onChange={(tags) => onUpdateAgent(agent.id, (item) => ({ ...item, inputSchema: tags }))}
            />
            <SchemaTagEditor
              label="输出字段"
              tags={agent.outputSchema ?? []}
              onChange={(tags) => onUpdateAgent(agent.id, (item) => ({ ...item, outputSchema: tags }))}
            />
          </div>
        </section>

        <div className={paneClass("detail-prompt", "detail-block-heading span-2")}>
          <span>02</span>
          <div>
            <strong>白盒配置单元</strong>
            <p>Agent 的"大脑"以具名段落呈现，可逐段查看和编辑，训练系统也对这些单元提 diff 建议。</p>
          </div>
        </div>

        <section className={paneClass("detail-prompt", "panel prompt-panel span-2 whitebox-panel")}>
          <div className="section-title with-action">
            <span>
              <Layers3 size={16} />
              指令分段
            </span>
            <button className="ghost-button compact" type="button" onClick={addInstructionSegment}>
              <Plus size={15} />
              添加段
            </button>
          </div>
          {(agent.instructionSegments ?? []).length > 0 ? (
            <div className="instruction-segments">
              {(agent.instructionSegments ?? []).map((seg) => (
                <div className="instruction-segment-card" key={seg.id}>
                  <div className="segment-label-row">
                    <select
                      className={`segment-label-select segment-label-${seg.label === "角色" ? "role" : seg.label === "任务" ? "task" : seg.label === "约束" ? "constraint" : "output"}`}
                      value={seg.label}
                      onChange={(e) =>
                        onUpdateAgent(agent.id, (item) => ({
                          ...item,
                          instructionSegments: (item.instructionSegments ?? []).map((s) =>
                            s.id === seg.id ? { ...s, label: e.target.value as InstructionSegment["label"] } : s,
                          ),
                        }))
                      }
                    >
                      <option value="角色">角色</option>
                      <option value="任务">任务</option>
                      <option value="约束">约束</option>
                      <option value="输出格式">输出格式</option>
                    </select>
                    <button className="ghost-button compact danger-button" type="button" onClick={() => deleteInstructionSegment(seg.id)}>
                      删除
                    </button>
                  </div>
                  <textarea
                    value={seg.content}
                    rows={2}
                    onChange={(e) =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        instructionSegments: (item.instructionSegments ?? []).map((s) =>
                          s.id === seg.id ? { ...s, content: e.target.value } : s,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-whitebox">
              <p>暂无指令分段。系统可在训练审查时自动生成分段建议，或点击上方"添加段"手动创建。</p>
              <button className="secondary-button" type="button" onClick={() =>
                onUpdateAgent(agent.id, (item) => ({
                  ...item,
                  instructionSegments: [
                    { id: `seg-r-${Date.now()}`, label: "角色" as const, content: agent.prompt.split("。")[0] + "。" },
                    { id: `seg-t-${Date.now() + 1}`, label: "任务" as const, content: "请根据业务背景和关联知识库完成核心判断任务。" },
                    { id: `seg-c-${Date.now() + 2}`, label: "约束" as const, content: agent.guardrails[0] ?? "高风险情况必须建议人工复核。" },
                    { id: `seg-o-${Date.now() + 3}`, label: "输出格式" as const, content: "输出必须包含结论、命中规则和修改建议。" },
                  ],
                }))
              }>
                <Sparkles size={15} />
                自动拆分现有 Prompt
              </button>
            </div>
          )}
        </section>

        <section className={paneClass("detail-prompt", "panel span-2 fewshot-panel")}>
          <div className="section-title with-action">
            <span>
              <FileText size={16} />
              Few-shot 示范
            </span>
            <button className="ghost-button compact" type="button" onClick={addFewShot}>
              <Plus size={15} />
              添加示范
            </button>
          </div>
          <p className="section-hint">这是非技术用户最自然的训练方式——举例子教 Agent。训练系统可从失败用例中自动提 Few-shot 建议。</p>
          {(agent.fewShots ?? []).length > 0 ? (
            <div className="fewshot-list">
              {(agent.fewShots ?? []).map((fs, index) => (
                <div className="fewshot-card" key={fs.id}>
                  <div className="fewshot-card-header">
                    <span className="fewshot-index">示范 {index + 1}</span>
                    <button className="ghost-button compact danger-button" type="button" onClick={() => deleteFewShot(fs.id)}>
                      删除
                    </button>
                  </div>
                  <div className="fewshot-io">
                    <div>
                      <span>输入</span>
                      <textarea
                        value={fs.input}
                        rows={2}
                        onChange={(e) =>
                          onUpdateAgent(agent.id, (item) => ({
                            ...item,
                            fewShots: (item.fewShots ?? []).map((f) => (f.id === fs.id ? { ...f, input: e.target.value } : f)),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <span>期望输出</span>
                      <textarea
                        value={fs.output}
                        rows={3}
                        onChange={(e) =>
                          onUpdateAgent(agent.id, (item) => ({
                            ...item,
                            fewShots: (item.fewShots ?? []).map((f) => (f.id === fs.id ? { ...f, output: e.target.value } : f)),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-whitebox">
              <p>暂无示范用例。运行训练并在审查闸门中接受 Few-shot 建议，系统会自动从失败用例生成示范。</p>
            </div>
          )}
        </section>

        <div className={paneClass("detail-tools", "detail-block-heading span-2")}>
          <span>03</span>
          <div>
            <strong>工具与边界</strong>
            <p>配置 Agent 可调用的工具能力，并明确安全边界、人工复核和禁止事项。</p>
          </div>
        </div>

        <section className={paneClass("detail-tools", "panel")}>
          <div className="section-title">
            <Wrench size={16} />
            工具能力
          </div>
          <div className="rule-picker">
            <select value={toolToAttach} onChange={(event) => setToolToAttach(event.target.value)}>
              {toolLibrary.map((tool) => (
                <option key={tool.id} value={tool.id}>
                  {tool.category} / {tool.name}
                </option>
              ))}
            </select>
            <button
              className="secondary-button compact"
              type="button"
              onClick={() => onAttachTool(agent.id, toolToAttach)}
              disabled={!toolToAttach}
            >
              关联工具
            </button>
          </div>
          <div className="agent-tool-list">
            {agent.tools.map((tool) => (
              <div className="agent-tool-card" key={tool.id}>
                <label className="tool-enabled">
                  <input
                    type="checkbox"
                    checked={tool.enabled}
                    onChange={() =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        tools: item.tools.map((target) => (target.id === tool.id ? { ...target, enabled: !target.enabled } : target)),
                      }))
                    }
                  />
                  <span>{tool.enabled ? "启用" : "停用"}</span>
                </label>
                <strong className="tool-name">{tool.name}</strong>
                <p className="tool-desc">{tool.description}</p>
                <button className="ghost-button compact danger-button" type="button" onClick={() => onDetachTool(agent.id, tool.id)}>
                  移除
                </button>
                <small className="rule-source">来源：{tool.sourceToolId ? "统一工具库" : "历史关联"}</small>
              </div>
            ))}
          </div>
        </section>

        <section className={paneClass("detail-tools", "panel")}>
          <div className="section-title with-action">
            <span>
              <ShieldCheck size={16} />
              安全边界
            </span>
            <button className="ghost-button compact" type="button" onClick={addGuardrail}>
              <Plus size={15} />
              添加边界
            </button>
          </div>
          <div className="guardrail-list">
            {agent.guardrails.map((item, index) => (
              <div className="guardrail-item editable-guardrail" key={`${item}-${index}`}>
                <CheckCircle2 size={15} />
                <input value={item} onChange={(event) => updateGuardrail(index, event.target.value)} aria-label="安全边界" />
                <button className="ghost-button compact danger-button" type="button" onClick={() => deleteGuardrail(index)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className={paneClass("detail-workflow", "detail-block-heading span-2")}>
          <span>04</span>
          <div>
            <strong>工作流管理</strong>
            <p>把 Agent 的业务处理过程拆成可启停、可编辑、可追踪的执行步骤。</p>
          </div>
        </div>

        <section className={paneClass("detail-workflow", "panel span-2")}>
          <div className="section-title with-action">
            <span>
              <Route size={16} />
              工作流步骤
            </span>
            <div className="workflow-header-actions">
              {skills.length > 0 && (
                <select
                  className="skill-apply-select"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) { applySkillToWorkflow(e.target.value); e.target.value = ""; } }}
                  title="从 Skill 库导入步骤组"
                >
                  <option value="" disabled>从 Skill 库导入…</option>
                  {skills.map((sk) => (
                    <option key={sk.id} value={sk.id}>{sk.name} {sk.version}</option>
                  ))}
                </select>
              )}
              <button className="ghost-button compact" type="button" onClick={addWorkflowStep}>
                <Plus size={15} />
                添加步骤
              </button>
            </div>
          </div>
          <div className="workflow-list">
            {agent.workflow.map((step, index) => {
              const skillSource = step.skillRef ? skills.find((sk) => sk.id === step.skillRef) : undefined;
              const isAnchorOpen = anchorExpanded.has(step.id);
              const fieldCount = step.anchor?.fields.length ?? 0;
              return (
                <div className="workflow-step workflow-step-v2" key={step.id}>
                  <div className="workflow-step-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={() =>
                          onUpdateAgent(agent.id, (item) => ({
                            ...item,
                            workflow: item.workflow.map((t) => (t.id === step.id ? { ...t, enabled: !t.enabled } : t)),
                          }))
                        }
                      />
                      <span>{index + 1}</span>
                    </label>
                    <input
                      className="workflow-step-title"
                      value={step.title}
                      onChange={(event) =>
                        onUpdateAgent(agent.id, (item) => ({
                          ...item,
                          workflow: item.workflow.map((t) => (t.id === step.id ? { ...t, title: event.target.value } : t)),
                        }))
                      }
                    />
                    {skillSource && (
                      <span className="workflow-skill-badge">
                        <Layers3 size={11} />
                        {skillSource.name}
                      </span>
                    )}
                    <button
                      className={`ghost-button compact workflow-anchor-toggle ${isAnchorOpen ? "active" : ""}`}
                      type="button"
                      onClick={() => toggleAnchorExpanded(step.id)}
                      title="配置输出锚点"
                    >
                      <ShieldCheck size={13} />
                      输出锚点{fieldCount > 0 ? ` (${fieldCount})` : ""}
                    </button>
                    <button className="ghost-button compact danger-button" type="button" onClick={() => deleteWorkflowStep(step.id)}>
                      删除
                    </button>
                  </div>

                  <textarea
                    className="workflow-step-desc"
                    value={step.description}
                    onChange={(event) =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        workflow: item.workflow.map((t) => (t.id === step.id ? { ...t, description: event.target.value } : t)),
                      }))
                    }
                    rows={2}
                    placeholder="描述这一步的业务目的（自由文本，Agent 依此执行）"
                  />

                  {isAnchorOpen && (
                    <div className="anchor-editor">
                      <div className="anchor-editor-head">
                        <span>输出锚点字段</span>
                        <label className="anchor-strict-toggle">
                          <input
                            type="checkbox"
                            checked={step.anchor?.strict ?? true}
                            onChange={(e) =>
                              onUpdateAgent(agent.id, (item) => ({
                                ...item,
                                workflow: item.workflow.map((t) =>
                                  t.id === step.id ? { ...t, anchor: { ...(t.anchor ?? { fields: [] }), strict: e.target.checked } } : t,
                                ),
                              }))
                            }
                          />
                          严格模式（字段缺失即失败）
                        </label>
                      </div>
                      {(step.anchor?.fields ?? []).map((field) => (
                        <div className="anchor-field-row" key={field.id}>
                          <input
                            className="anchor-field-key"
                            value={field.key}
                            placeholder="字段名"
                            onChange={(e) => updateAnchorField(step.id, field.id, { key: e.target.value })}
                          />
                          <select
                            value={field.type}
                            onChange={(e) => updateAnchorField(step.id, field.id, { type: e.target.value as AnchorField["type"] })}
                          >
                            <option value="enum">enum</option>
                            <option value="bool">bool</option>
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="list">list</option>
                          </select>
                          {field.type === "enum" && (
                            <input
                              className="anchor-field-options"
                              value={field.options?.join(",") ?? ""}
                              placeholder="选项A,选项B,选项C"
                              onChange={(e) => updateAnchorField(step.id, field.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            />
                          )}
                          <label className="anchor-required">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateAnchorField(step.id, field.id, { required: e.target.checked })}
                            />
                            必填
                          </label>
                          <input
                            className="anchor-field-desc"
                            value={field.description}
                            placeholder="字段含义说明"
                            onChange={(e) => updateAnchorField(step.id, field.id, { description: e.target.value })}
                          />
                          <input
                            className="anchor-field-constraint"
                            value={field.constraint ?? ""}
                            placeholder="跨字段约束（选填）"
                            onChange={(e) => updateAnchorField(step.id, field.id, { constraint: e.target.value || undefined })}
                          />
                          <button
                            className="ghost-button compact danger-button"
                            type="button"
                            onClick={() => removeAnchorField(step.id, field.id)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button className="ghost-button compact anchor-add-field" type="button" onClick={() => addAnchorField(step.id)}>
                        <Plus size={13} />
                        添加字段
                      </button>
                    </div>
                  )}

                  {/* Routing Rules */}
                  <div className="routing-section">
                    <div className="routing-section-head">
                      <span>
                        <ArrowRight size={13} />
                        路由规则
                      </span>
                      <button className="ghost-button compact" type="button" onClick={() => addRoutingRule(step.id)}>
                        <Plus size={13} />
                        添加路由
                      </button>
                    </div>
                    {(step.routing ?? []).length === 0 ? (
                      <p className="routing-empty">无路由规则（步骤按顺序执行）</p>
                    ) : (
                      (step.routing ?? []).map((rt) => (
                        <div className="routing-rule-row" key={rt.id}>
                          <input
                            className="routing-condition"
                            value={rt.condition}
                            placeholder="触发条件（如 risk_level=高）"
                            onChange={(e) => updateRoutingRule(step.id, rt.id, { condition: e.target.value })}
                          />
                          <ArrowRight size={13} className="routing-arrow" />
                          <select
                            className="routing-target"
                            value={rt.nextStepId}
                            onChange={(e) => updateRoutingRule(step.id, rt.id, { nextStepId: e.target.value })}
                          >
                            <option value="">→ 下一步（默认）</option>
                            {agent.workflow.filter((s) => s.id !== step.id).map((s, i) => (
                              <option key={s.id} value={s.id}>→ 步骤 {i + 1}：{s.title}</option>
                            ))}
                            <option value="__end__">→ 终止流程</option>
                          </select>
                          <button className="ghost-button compact danger-button" type="button" onClick={() => removeRoutingRule(step.id, rt.id)}>
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className={paneClass("detail-assets", "detail-block-heading span-2")}>
          <span>05</span>
          <div>
            <strong>知识与规则</strong>
            <p>选择统一知识库文档和统一规则库资产，形成可复用、可追溯的业务能力。</p>
          </div>
        </div>

        <section className={paneClass("detail-assets", "panel")}>
          <div className="section-title">
            <Database size={16} />
            知识库关联
          </div>
          <div className="doc-chip-list">
            {docs.map((doc) => (
              <label className={`doc-chip ${agent.knowledgeIds.includes(doc.id) ? "active" : ""}`} key={doc.id}>
                <input
                  type="checkbox"
                  checked={agent.knowledgeIds.includes(doc.id)}
                  onChange={() => onToggleKnowledgeLink(doc.id, agent.id)}
                />
                <span>{doc.title}</span>
              </label>
            ))}
          </div>
          <div className="retrieval-config-panel">
            <div className="retrieval-config-row">
              <label className="retrieval-config-label">Top-K</label>
              <input
                type="number"
                className="retrieval-topk-input"
                min={1}
                max={20}
                value={agent.retrievalConfig?.topK ?? 4}
                onChange={(e) =>
                  onUpdateAgent(agent.id, (item) => ({
                    ...item,
                    retrievalConfig: { ...(item.retrievalConfig ?? { tagFilters: [] }), topK: Math.max(1, Number(e.target.value)) },
                  }))
                }
              />
            </div>
            <div className="retrieval-config-row">
              <label className="retrieval-config-label">标签过滤</label>
              <input
                className="retrieval-tags-input"
                value={(agent.retrievalConfig?.tagFilters ?? []).join(",")}
                placeholder="标签A,标签B（逗号分隔）"
                onChange={(e) =>
                  onUpdateAgent(agent.id, (item) => ({
                    ...item,
                    retrievalConfig: {
                      ...(item.retrievalConfig ?? { topK: 4 }),
                      tagFilters: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    },
                  }))
                }
              />
            </div>
          </div>
          <button className="ghost-button compact" type="button" onClick={onOpenKnowledge}>
            查看统一知识库
            <ArrowRight size={15} />
          </button>
        </section>

        <section className={paneClass("detail-assets", "panel")}>
          <div className="section-title with-action">
            <span>
              <Settings2 size={16} />
              规则卡片
            </span>
            <button className="ghost-button compact" type="button" onClick={() => onCreateRule(agent.id)}>
              <Plus size={15} />
              新增规则
            </button>
          </div>
          <div className="rule-picker">
            <select value={ruleToAttach} onChange={(event) => setRuleToAttach(event.target.value)}>
              {ruleLibrary.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.category} / {rule.title}
                </option>
              ))}
            </select>
            <button className="secondary-button compact" type="button" onClick={() => onAttachRule(agent.id, ruleToAttach)}>
              选择规则
            </button>
          </div>
          <div className="rule-list">
            {agent.rules.map((rule) => {
              const isShared = !!rule.sourceRuleId;
              return (
                <div className={`rule-card editable-rule ${isShared ? "rule-shared" : "rule-draft"}`} key={rule.id}>
                  <div className="rule-card-top">
                    <label className="rule-switch">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => onUpdateAgentRule(agent.id, rule.id, { enabled: !rule.enabled })}
                      />
                      <span>{rule.enabled ? "启用" : "停用"}</span>
                    </label>
                    <select
                      value={rule.priority}
                      onChange={(event) => onUpdateAgentRule(agent.id, rule.id, { priority: event.target.value as "高" | "中" | "低" })}
                      aria-label={`${rule.title} 优先级`}
                    >
                      <option value="高">高</option>
                      <option value="中">中</option>
                      <option value="低">低</option>
                    </select>
                    {isShared ? (
                      <span className="rule-isolation-badge badge-shared">共享规则</span>
                    ) : (
                      <select
                        className="rule-isolation-select"
                        value={rule.isolationType ?? "create"}
                        onChange={(e) => onUpdateAgentRule(agent.id, rule.id, { isolationType: e.target.value as RuleItem["isolationType"] })}
                        title="草稿规则的隔离类型"
                      >
                        <option value="create">新建草稿</option>
                        <option value="content">内容变更申请</option>
                      </select>
                    )}
                  </div>

                  {isShared ? (
                    <>
                      <strong className="rule-title-readonly">{rule.title}</strong>
                      <p className="rule-desc-readonly">{rule.description}</p>
                    </>
                  ) : (
                    <>
                      <input
                        value={rule.title}
                        onChange={(event) => onUpdateAgentRule(agent.id, rule.id, { title: event.target.value })}
                        aria-label="规则名称"
                      />
                      <textarea
                        value={rule.description}
                        onChange={(event) => onUpdateAgentRule(agent.id, rule.id, { description: event.target.value })}
                        aria-label="规则说明"
                        rows={2}
                      />
                    </>
                  )}

                  <div className="rule-card-actions">
                    {!isShared && (
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={() => onPromoteRule(agent.id, rule.id)}
                        title="提升为所有 Agent 均可引用的共享规则"
                      >
                        提升为共享规则
                      </button>
                    )}
                    <button
                      className="ghost-button compact danger-button"
                      type="button"
                      onClick={() => onDetachRule(agent.id, rule.id)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className={paneClass("detail-training", "detail-block-heading span-2")}>
          <span>06</span>
          <div>
            <strong>训练评估</strong>
            <p>运行训练、评估、测试用例、人工反馈和版本追踪，证明 Agent 能持续优化。</p>
          </div>
        </div>

        <section className={paneClass("detail-training", "panel span-2")}>
          <div className="section-title with-action">
            <span>
              <Upload size={16} />
              训练运行控制台
            </span>
            <span className={`pill ${agent.trainedOnce ? "published" : "training"}`}>{agent.trainedOnce ? "已有训练版本" : "等待首轮训练"}</span>
          </div>

          <div className="training-console">
            <div className="training-control-panel">
              <div className="run-config-head">
                <div>
                  <div className="eyebrow">Training Recipe</div>
                  <h3>{agentBlueprint.scenario}</h3>
                </div>
                <span>{agentBlueprint.latencyTarget}</span>
              </div>

              <div className="dataset-grid">
                <div>
                  <strong>{agent.testCases.length}</strong>
                  <span>评测样例</span>
                </div>
                <div>
                  <strong>{agent.testCases.filter((c) => c.split === "train").length}</strong>
                  <span className="split-label">训练集</span>
                </div>
                <div>
                  <strong>{agent.testCases.filter((c) => c.split === "holdout").length}</strong>
                  <span className="split-label">留出集</span>
                </div>
                <div>
                  <strong>{agentBlueprint.qualityTarget}</strong>
                  <span>质量门槛</span>
                </div>
              </div>
              <div className="judge-phase-row">
                <span className="judge-phase-label">Judge 校准阶段</span>
                <select
                  className="judge-phase-select"
                  value={agent.judgePhase ?? "human"}
                  onChange={(e) =>
                    onUpdateAgent(agent.id, (item) => ({ ...item, judgePhase: e.target.value as Agent["judgePhase"] }))
                  }
                >
                  <option value="human">人工标注（前 20 条）</option>
                  <option value="parallel">平行验证（20-50 条）</option>
                  <option value="auto">自动裁判（50+ 条）</option>
                </select>
                {agent.judgePhase && (
                  <span className={`judge-phase-badge phase-${agent.judgePhase}`}>
                    {agent.judgePhase === "human" ? "人工标注" : agent.judgePhase === "parallel" ? "平行验证" : "自动裁判"}
                  </span>
                )}
              </div>

              <div className="training-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    onUpdateAgent(agent.id, (item) => ({
                      ...item,
                      caseUploaded: true,
                      timeline: [
                        { id: `case-${Date.now()}`, title: "载入训练样例集", description: "已载入标准案例、反例和预期输出。", time: nowLabel() },
                        ...item.timeline,
                      ],
                    }));
                    onNotify("训练样例集已载入");
                  }}
                >
                  <Upload size={16} />
                  {agent.caseUploaded ? "重新载入样例集" : "载入样例集"}
                </button>
                <button className="secondary-button" type="button" onClick={() => onRunEvaluation(agent.id)}>
                  <CheckCircle2 size={16} />
                  仅运行评测
                </button>
                <button className="primary-button" type="button" onClick={() => onTrain(agent.id)} disabled={isTraining}>
                  {isTraining ? <RefreshCw className="spin" size={16} /> : <PlayCircle size={16} />}
                  {isTraining ? "训练运行中" : "运行训练"}
                </button>
              </div>
            </div>

            <div className="run-trace-panel">
              <div className="run-config-head">
                <div>
                  <div className="eyebrow">Trace Preview</div>
                  <h3>执行链路</h3>
                </div>
                <span>{isTraining ? "Live" : "Ready"}</span>
              </div>

              <div className="trace-ladder">
                {trainingSteps.map((step, index) => (
                  <div className={`trace-ladder-step ${isTraining && index <= trainingStep ? "active" : agent.trainedOnce ? "done" : ""}`} key={step}>
                    <span>{index + 1}</span>
                    <strong>{step}</strong>
                    <small>{index <= trainingStep || agent.trainedOnce ? "已采集指标" : "等待运行"}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="quality-delta-grid">
            <div>
              <span>训练前质量</span>
              <strong>{agent.beforeReport.score}</strong>
              <small>{agent.beforeReport.summary}</small>
            </div>
            <div>
              <span>训练后目标</span>
              <strong>{agent.afterReport.score}</strong>
              <small>{agent.afterReport.summary}</small>
            </div>
            <div>
              <span>当前版本</span>
              <strong>{agent.version}</strong>
              <small>{agent.trainedOnce ? "已生成训练版本，可继续评测或发布。" : "首轮训练后生成新版本。"}</small>
            </div>
          </div>

          <div className="report-compare">
            <ReportCard report={agent.beforeReport} active={!agent.trainedOnce} />
            <ReportCard report={agent.afterReport} active={agent.trainedOnce} />
          </div>

        </section>

        <section className={paneClass("detail-training", "panel span-2 rubric-panel")}>
          <div className="section-title with-action">
            <span>
              <ShieldCheck size={16} />
              Rubric 评分标准
            </span>
            <button className="ghost-button compact" type="button" onClick={addRubricCriterion}>
              <Plus size={15} />
              添加维度
            </button>
          </div>
          <p className="section-hint">Rubric 是评估的唯一标准。Judge 校准前必须先确认 Rubric，用于 LLM 自动打分与人工判断的一致性校验。</p>
          {(agent.rubric ?? []).length > 0 ? (
            <div className="rubric-table">
              <div className="rubric-head">
                <span>评估维度</span>
                <span>权重</span>
                <span>打分指引</span>
                <span />
              </div>
              {(agent.rubric ?? []).map((criterion) => (
                <div className="rubric-row" key={criterion.id}>
                  <input
                    value={criterion.dimension}
                    onChange={(e) =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        rubric: (item.rubric ?? []).map((r) => (r.id === criterion.id ? { ...r, dimension: e.target.value } : r)),
                      }))
                    }
                  />
                  <div className="rubric-weight-cell">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={criterion.weight}
                      onChange={(e) =>
                        onUpdateAgent(agent.id, (item) => ({
                          ...item,
                          rubric: (item.rubric ?? []).map((r) =>
                            r.id === criterion.id ? { ...r, weight: Number(e.target.value) } : r,
                          ),
                        }))
                      }
                    />
                    <span>%</span>
                  </div>
                  <input
                    value={criterion.guide}
                    onChange={(e) =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        rubric: (item.rubric ?? []).map((r) => (r.id === criterion.id ? { ...r, guide: e.target.value } : r)),
                      }))
                    }
                  />
                  <button className="ghost-button compact danger-button" type="button" onClick={() => deleteRubricCriterion(criterion.id)}>
                    删除
                  </button>
                </div>
              ))}
              <div className="rubric-total">
                <span>合计权重</span>
                <strong
                  className={(agent.rubric ?? []).reduce((s, r) => s + r.weight, 0) === 100 ? "weight-ok" : "weight-warn"}
                >
                  {(agent.rubric ?? []).reduce((s, r) => s + r.weight, 0)}%
                </strong>
                {(agent.rubric ?? []).reduce((s, r) => s + r.weight, 0) !== 100 && (
                  <small>各维度权重之和应为 100%</small>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-whitebox">
              <p>暂无 Rubric。点击"添加维度"手动定义，或使用"AI 辅助立标准"功能让系统从你的判断中反推。</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  onUpdateAgent(agent.id, (item) => ({
                    ...item,
                    rubric: [
                      { id: `rub-${Date.now()}`, dimension: "任务完成度", weight: 40, guide: "正确完成核心业务判断，不遗漏关键项" },
                      { id: `rub-${Date.now() + 1}`, dimension: "规则命中", weight: 30, guide: "命中所有适用规则，给出可追溯证据" },
                      { id: `rub-${Date.now() + 2}`, dimension: "建议可执行性", weight: 20, guide: "给出具体可落地的处理建议" },
                      { id: `rub-${Date.now() + 3}`, dimension: "表述清晰", weight: 10, guide: "输出结构完整，表达清晰易读" },
                    ],
                  }));
                  onNotify("已生成通用 Rubric 模板，可按业务需求调整");
                }}
              >
                <Sparkles size={15} />
                AI 辅助立标准（模拟）
              </button>
            </div>
          )}
        </section>

        <section className={paneClass("detail-training", "panel span-2")}>
          <div className="feedback-box studio-feedback">
            <div>
              <div className="section-title small">
                <Star size={16} />
                人工反馈
              </div>
              <div className="rating-row">
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    className={`rating-button ${score <= feedbackScore ? "active" : ""}`}
                    type="button"
                    key={score}
                    onClick={() => setFeedbackScore(score)}
                    aria-label={`${score} 分`}
                  >
                    <Star size={15} />
                  </button>
                ))}
              </div>
            </div>
            <textarea value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} rows={3} />
            <button className="secondary-button" type="button" onClick={() => onFeedback(agent.id, feedbackScore, feedbackNote)}>
              <Save size={16} />
              纳入下一轮
            </button>
            {agent.feedbackSaved && <span className="feedback-saved">已进入优化样本池</span>}
          </div>
        </section>

        <section className={paneClass("detail-training", "panel span-2")}>
          <div className="section-title with-action">
            <span>
              <CheckCircle2 size={16} />
              测试用例库
            </span>
            <button className="ghost-button compact" type="button" onClick={addTestCase}>
              <Plus size={15} />
              添加用例
            </button>
          </div>
          <div className="case-grid">
            {agent.testCases.map((testCase) => (
              <div className="case-card editable" key={testCase.id}>
                <div className="case-card-meta-row">
                  <select
                    value={testCase.status}
                    onChange={(event) =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        testCases: item.testCases.map((target) =>
                          target.id === testCase.id ? { ...target, status: event.target.value as "通过" | "待验证" | "需优化" } : target,
                        ),
                      }))
                    }
                  >
                    <option value="通过">通过</option>
                    <option value="待验证">待验证</option>
                    <option value="需优化">需优化</option>
                  </select>
                  <button
                    className={`case-split-toggle ${testCase.split === "holdout" ? "holdout" : "train"}`}
                    type="button"
                    title="点击切换训练集/留出集"
                    onClick={() =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        testCases: item.testCases.map((t) =>
                          t.id === testCase.id ? { ...t, split: t.split === "holdout" ? "train" : "holdout" } : t,
                        ),
                      }))
                    }
                  >
                    {testCase.split === "holdout" ? "留出集" : "训练集"}
                  </button>
                </div>
                <input
                  value={testCase.name}
                  onChange={(event) =>
                    onUpdateAgent(agent.id, (item) => ({
                      ...item,
                      testCases: item.testCases.map((target) => (target.id === testCase.id ? { ...target, name: event.target.value } : target)),
                    }))
                  }
                />
                <textarea
                  value={testCase.input}
                  onChange={(event) =>
                    onUpdateAgent(agent.id, (item) => ({
                      ...item,
                      testCases: item.testCases.map((target) => (target.id === testCase.id ? { ...target, input: event.target.value } : target)),
                    }))
                  }
                  rows={2}
                />
                <textarea
                  value={testCase.expected}
                  onChange={(event) =>
                    onUpdateAgent(agent.id, (item) => ({
                      ...item,
                      testCases: item.testCases.map((target) => (target.id === testCase.id ? { ...target, expected: event.target.value } : target)),
                    }))
                  }
                  rows={2}
                />
                <div className="case-judgment-row">
                  <span className="case-judgment-label">你的判断</span>
                  <button
                    className={`judgment-btn pass ${testCase.judgment === "pass" ? "active" : ""}`}
                    type="button"
                    aria-label="输出符合预期"
                    onClick={() =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        testCases: item.testCases.map((t) =>
                          t.id === testCase.id ? { ...t, judgment: t.judgment === "pass" ? null : "pass" } : t,
                        ),
                      }))
                    }
                  >
                    <ThumbsUp size={13} />
                    符合预期
                  </button>
                  <button
                    className={`judgment-btn fail ${testCase.judgment === "fail" ? "active" : ""}`}
                    type="button"
                    aria-label="输出有问题"
                    onClick={() =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        testCases: item.testCases.map((t) =>
                          t.id === testCase.id ? { ...t, judgment: t.judgment === "fail" ? null : "fail" } : t,
                        ),
                      }))
                    }
                  >
                    <ThumbsDown size={13} />
                    有问题
                  </button>
                </div>
                {testCase.judgment === "fail" && (
                  <textarea
                    className="judgment-note"
                    value={testCase.judgmentNote ?? ""}
                    placeholder="说说哪里有问题（可选，作为训练信号）"
                    rows={2}
                    onChange={(event) =>
                      onUpdateAgent(agent.id, (item) => ({
                        ...item,
                        testCases: item.testCases.map((t) =>
                          t.id === testCase.id ? { ...t, judgmentNote: event.target.value } : t,
                        ),
                      }))
                    }
                  />
                )}
                <button className="ghost-button compact danger-button" type="button" onClick={() => deleteTestCase(testCase.id)}>
                  删除用例
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={paneClass("detail-training", "panel span-2 trace-evaluation-panel")}>
          <div className="section-title">
            <Activity size={16} />
            追踪评估
          </div>
          <div className="trace-evaluation-layout">
            <div className="trace-list">
              {agent.trace.map((item, index) => (
                <div className="trace-item" key={item}>
                  <span>{index + 1}</span>
                  {item}
                </div>
              ))}
            </div>
            <div className="doc-snippet">
              <strong>关联知识片段</strong>
              <p>{linkedDocs[0]?.snippet ?? "尚未关联知识库文档。"}</p>
            </div>
          </div>
        </section>

        <section className={paneClass("detail-training", "panel span-2 timeline-panel")}>
          <div className="section-title">
            <RefreshCw size={16} />
            版本时间线
          </div>
          <div className="timeline">
            {agent.timeline.map((item) => (
              <div className="timeline-item" key={item.id}>
                <span>{item.time}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                {item.metrics && (
                  <div className="timeline-metric-grid">
                    {item.metrics.map((metric) => (
                      <div className={`timeline-metric ${metric.tone ?? "neutral"}`} key={`${item.id}-${metric.label}`}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                )}
                {item.steps && (
                  <div className="timeline-step-list">
                    {item.steps.map((step) => (
                      <div className={`timeline-step ${step.status === "需关注" ? "attention" : ""}`} key={`${item.id}-${step.title}`}>
                        <span>{step.status}</span>
                        <strong>{step.title}</strong>
                        <em>{step.metric}</em>
                        <p>{step.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
                {item.changes && (
                  <ul className="timeline-change-list">
                    {item.changes.map((change) => (
                      <li key={`${item.id}-${change}`}>{change}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className={paneClass("detail-release", "detail-block-heading span-2")}>
          <span>07</span>
          <div>
            <strong>发布接口</strong>
            <p>选择矩阵节点并开放 mock API，展示 Agent 如何被外部系统调用。</p>
          </div>
        </div>

        <section className={paneClass("detail-release", "panel span-2 publish-panel")}>
          <div className="section-title">
            <Rocket size={16} />
            发布区
          </div>
          <div className="publish-grid">
            <label>
              <span>Work Flow</span>
              <select value={publishWork} onChange={(event) => setPublishWork(event.target.value)}>
                {workFlows.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Functional Flow</span>
              <select value={publishFunc} onChange={(event) => setPublishFunc(event.target.value)}>
                {functionalFlows.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => onPublish(agent.id, cellKey(publishWork, publishFunc), true)}
              disabled={agent.status === "draft" && !agent.trainedOnce}
            >
              <Rocket size={16} />
              发布到节点
            </button>
          </div>
        </section>

        <ApiCard agent={agent} className={paneClass("detail-release", "api-card span-2")} />
      </div>
    </section>
  );
}

function ReportCard({ report, active }: { report: Agent["beforeReport"]; active: boolean }) {
  return (
    <div className={`report-card ${active ? "active" : ""}`}>
      <div className="report-head">
        <strong>{report.title}</strong>
        <span>{report.score}</span>
      </div>
      <p>{report.summary}</p>
      <div className="report-meta">
        {report.meta.map((item) => (
          <span key={item.label}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <ul>
        {report.bullets.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ApiCard({ agent, className = "api-card" }: { agent: Agent; className?: string }) {
  const endpoint = `https://api.drip-connect.ai/v1/agents/${agent.id}`;
  const exampleRequest = `{
  "input": "（上传合同内容或工单描述）",
  "options": {
    "format": "structured",
    "language": "zh-CN"
  }
}`;
  const fallbackCalls = [
    { time: "2024-12-15 17:01", source: "TicketSystem", latency: "890ms" },
    { time: "2024-12-15 16:44", source: "TicketSystem", latency: "760ms" },
    { time: "2024-12-15 15:33", source: "TicketSystem", latency: "1020ms" },
  ];
  const callRows = agent.apiCalls.length
    ? agent.apiCalls.slice(0, 3).map((call, index) => ({
        time: call.time,
        source: call.source,
        latency: `${760 + index * 130}ms`,
      }))
    : fallbackCalls;

  return (
    <section className={className}>
      <div className="api-card-head">
        <div className="section-title">
          <Code2 size={16} />
          API 接口
        </div>
      </div>

      <div className="api-interface-grid">
        <section className="api-endpoint-block">
          <div className="section-title small">调用地址</div>
          <div className="api-endpoint-line">
            <span>POST</span>
            <code>{endpoint}</code>
          </div>
        </section>

        <section className="api-request-block">
          <div className="section-title small">示例请求</div>
          <pre>{exampleRequest}</pre>
        </section>

        <section className="api-recent-block">
          <div className="section-title small">最近调用记录</div>
          <div className="api-call-records">
            {callRows.map((call) => (
              <div key={`${call.time}-${call.source}-${call.latency}`}>
                <span>{call.time}</span>
                <strong>{call.source}</strong>
                <em>{call.latency}</em>
              </div>
            ))}
          </div>
        </section>
      </div>
      {agent.apiCalls.length > 0 && (
        <div className="api-calls compact-history">
          {agent.apiCalls.slice(0, 3).map((call) => (
            <div key={call.id}>
              <span>{call.time}</span>
              <strong>{call.source}</strong>
              <em>{call.result}</em>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  sectionNav,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  sectionNav?: ReactNode;
}) {
  return (
    <header className={`page-header ${sectionNav ? "with-section-nav" : ""}`}>
      <div className="page-header-main">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      {sectionNav}
    </header>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  tone?: "green" | "amber";
}) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      {icon && <span>{icon}</span>}
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
