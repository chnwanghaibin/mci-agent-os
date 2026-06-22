import type { Agent, ApiKeyRecord, AppState, EvalRun, FlowItem, KnowledgeDoc, RuleLibraryItem, ToolAsset } from "./types";


export const functionalFlows: FlowItem[] = [
  { id: "rwc", label: "1 RWC" },
  { id: "cop", label: "2. COP" },
  { id: "contract-registrar", label: "3. Contract Registrar" },
  { id: "pcf-reporting", label: "4. PCF Reporting" },
  { id: "acf-reporting", label: "5. ACF Reporting" },
  { id: "cdr-creation", label: "6 CDR Creation" },
  { id: "matching", label: "7 Matching (YITO / LTV)" },
  { id: "primary-issue", label: "8 Primary Issue" },
  { id: "secondary-trading", label: "9 Secondary Trading" },
  { id: "settlement", label: "10 Settlement" },
];

export const workFlows: FlowItem[] = [
  { id: "origination", label: "1. Origination Flow" },
  { id: "disclosure", label: "2.Disclosure Flow" },
  { id: "fund", label: "3.Fund Flow" },
  { id: "ledger", label: "4.Ledger Flow" },
  { id: "qr-code", label: "5.QR Code Flow" },
  { id: "contractual", label: "6.Contractual Flow" },
  { id: "compliance", label: "7.Compliance Flow" },
  { id: "system", label: "8.System Flow" },
];

export const cellKey = (workId: string, functionId: string) => `${workId}:${functionId}`;

const contractTools = [
  { id: "search", name: "知识检索", description: "检索合同审查标准、现金流资产规则和历史案例。", enabled: true },
  { id: "rule", name: "规则校验", description: "逐条命中收益分配、披露、合规和登记规则。", enabled: true },
  { id: "report", name: "报告生成", description: "输出风险等级、修改建议和审查结论。", enabled: true },
  { id: "handoff", name: "人工复核", description: "高风险条款自动进入人工复核队列。", enabled: true },
];

const systemTools = [
  { id: "classify", name: "工单分类", description: "识别 COP、结算、门店数据、账户权限等问题类型。", enabled: true },
  { id: "route", name: "责任方路由", description: "根据业务域和影响范围推荐处理团队。", enabled: true },
  { id: "sla", name: "优先级判断", description: "结合现金流影响、门店范围和阻塞程度给出 P 级。", enabled: true },
  { id: "summary", name: "摘要生成", description: "将原始工单改写为可执行处理摘要。", enabled: true },
];

const docs: KnowledgeDoc[] = [
  {
    id: "doc-contract-standard",
    title: "合同审查标准 v1.4",
    category: "合同",
    tags: ["Contract Registrar", "风险条款", "收益分配"],
    updatedAt: "2026-06-15",
    snippet: "审查重点包括收益分配口径、提前终止条款、现金流披露义务、门店经营数据授权和争议解决机制。",
    linkedAgents: ["contract-review"],
  },
  {
    id: "doc-cashflow-asset",
    title: "现金流资产标准化规则",
    category: "资产",
    tags: ["RWC", "PCF Reporting", "真实经济"],
    updatedAt: "2026-06-12",
    snippet: "门店经营收益需转化为可量化、可评级、可交易的标准化合约资产，并保留穿透式数据证据。",
    linkedAgents: ["contract-review", "pcf-summary"],
  },
  {
    id: "doc-cop-ticket",
    title: "COP 工单分诊手册",
    category: "系统",
    tags: ["COP", "System Flow", "工单"],
    updatedAt: "2026-06-10",
    snippet: "工单需根据影响对象、阻塞环节、数据新鲜度和结算影响分为 P0-P3，并给出责任团队。",
    linkedAgents: ["system-triage"],
  },
  {
    id: "doc-compliance-check",
    title: "披露与合规检查清单",
    category: "合规",
    tags: ["Disclosure Flow", "Compliance Flow", "Primary Issue"],
    updatedAt: "2026-06-08",
    snippet: "发行前披露材料必须覆盖资产口径、历史回款、风险提示、投资者适当性和关键假设。",
    linkedAgents: ["disclosure-check", "compliance-watch"],
  },
  {
    id: "doc-settlement",
    title: "结算异常处理标准",
    category: "结算",
    tags: ["Settlement", "Ledger Flow", "异常处理"],
    updatedAt: "2026-06-04",
    snippet: "结算异常需优先确认资金流水、门店回款批次、账本落账状态和对账差异来源。",
    linkedAgents: ["settlement-reconcile"],
  },
];

const rules: RuleLibraryItem[] = [
  {
    id: "rule-contract-revenue",
    title: "收益分配口径必须明确",
    description: "合同需说明门店经营收益的计算口径、扣除项和分配周期。",
    priority: "高",
    category: "合同",
    tags: ["Contract Registrar", "收益分配", "现金流"],
    updatedAt: "2026-06-18",
  },
  {
    id: "rule-contract-termination",
    title: "提前终止需设复核条件",
    description: "提前终止必须包含触发条件、通知机制和投资者保护安排。",
    priority: "高",
    category: "合同",
    tags: ["风险条款", "人工复核"],
    updatedAt: "2026-06-18",
  },
  {
    id: "rule-contract-data-auth",
    title: "数据授权与披露一致",
    description: "门店数据授权范围需与披露材料和系统采集口径一致。",
    priority: "中",
    category: "合同",
    tags: ["数据授权", "披露"],
    updatedAt: "2026-06-16",
  },
  {
    id: "rule-ticket-settlement",
    title: "影响结算即提升优先级",
    description: "若工单影响结算或账本落账，优先级至少为 P1。",
    priority: "高",
    category: "系统",
    tags: ["COP", "Settlement", "P1"],
    updatedAt: "2026-06-14",
  },
  {
    id: "rule-ticket-batch-store",
    title: "门店范围超过 10 家需升级",
    description: "涉及多门店批量数据异常时必须建议升级处理。",
    priority: "中",
    category: "系统",
    tags: ["COP", "批量异常"],
    updatedAt: "2026-06-14",
  },
  {
    id: "rule-required-fields",
    title: "关键字段完整",
    description: "缺少关键字段时提示补充，不直接输出最终结论。",
    priority: "中",
    category: "通用",
    tags: ["输入校验", "人工复核"],
    updatedAt: "2026-06-12",
  },
];

const tools: ToolAsset[] = [
  {
    id: "tool-knowledge-search",
    name: "统一知识检索",
    category: "检索",
    description: "按标签、节点和 Agent 上下文检索合同、现金流、COP、结算和披露标准。",
    status: "启用",
    linkedAgentIds: ["contract-review", "system-triage", "pcf-summary", "compliance-watch"],
    endpoint: "/tools/knowledge-search",
  },
  {
    id: "tool-rule-check",
    name: "规则校验引擎",
    category: "规则",
    description: "执行 Agent 内规则卡片，输出命中规则、优先级、解释和人工复核条件。",
    status: "启用",
    linkedAgentIds: ["contract-review", "system-triage", "disclosure-check"],
    endpoint: "/tools/rule-check",
  },
  {
    id: "tool-report",
    name: "结构化报告生成",
    category: "生成",
    description: "将 Agent 过程结果转成风险报告、分诊报告、披露检查报告或摘要。",
    status: "启用",
    linkedAgentIds: ["contract-review", "system-triage", "pcf-summary"],
    endpoint: "/tools/report-render",
  },
  {
    id: "tool-ticket-route",
    name: "工单责任方路由",
    category: "路由",
    description: "根据工单类型、影响范围和阻塞环节推荐数据平台、结算支持或业务运营团队。",
    status: "启用",
    linkedAgentIds: ["system-triage", "qr-cop", "matching-helper"],
    endpoint: "/tools/ticket-route",
  },
  {
    id: "tool-human-review",
    name: "人工复核队列",
    category: "人工复核",
    description: "汇总高风险输出、低置信度结果和用户低分反馈，形成可追踪复核任务。",
    status: "启用",
    linkedAgentIds: ["contract-review", "compliance-watch", "secondary-risk"],
    endpoint: "/tools/human-review",
  },
  {
    id: "tool-api-gateway",
    name: "Agent 调用网关",
    category: "接口",
    description: "统一管理已发布 Agent 的 mock API、调用记录、鉴权状态和请求示例。",
    status: "启用",
    linkedAgentIds: ["contract-review", "system-triage", "settlement-reconcile"],
    endpoint: "/gateway/agents",
  },
];

const evalRuns: EvalRun[] = [
  {
    id: "eval-contract-1",
    agentId: "contract-review",
    suite: "合同审查回归集",
    score: 91,
    passRate: 92,
    cases: 24,
    failed: 2,
    time: "今日 09:42",
    notes: "收益分配与提前终止条款识别稳定，数据授权场景仍需补样本。",
  },
  {
    id: "eval-system-1",
    agentId: "system-triage",
    suite: "COP 工单分诊集",
    score: 88,
    passRate: 89,
    cases: 18,
    failed: 2,
    time: "今日 10:12",
    notes: "P1/P2 分界清晰，批量门店数据异常仍需强化责任方解释。",
  },
  {
    id: "eval-compliance-1",
    agentId: "compliance-watch",
    suite: "披露合规检查集",
    score: 86,
    passRate: 87,
    cases: 15,
    failed: 2,
    time: "昨日 18:44",
    notes: "风险提示覆盖较好，投资者适当性材料引用需补足。",
  },
];

const apiKeys: ApiKeyRecord[] = [
  { id: "key-contract", name: "合同登记系统", scope: "contract-review:invoke", status: "启用", lastUsed: "今日 10:28" },
  { id: "key-cop", name: "COP 工单系统", scope: "system-triage:invoke", status: "启用", lastUsed: "今日 10:32" },
  { id: "key-sandbox", name: "演示沙箱", scope: "all:read", status: "停用", lastUsed: "昨日 17:20" },
];

const baseTrace = [
  "读取关联知识库片段",
  "应用已启用规则卡片",
  "调用结构化输出模板",
  "生成可复核业务报告",
];

const mainAgents: Agent[] = [
  {
    id: "contract-review",
    name: "合同审查 Agent",
    type: "合同审查",
    purpose: "审查门店现金流合约中的收益分配、披露义务、提前终止和争议处理条款。",
    status: "draft",
    version: "v0.1",
    score: 72,
    matrixCellKey: cellKey("contractual", "contract-registrar"),
    caseUploaded: false,
    trainedOnce: false,
    feedbackSaved: false,
    prompt:
      "你是滴灌通合同审查 Agent。请围绕门店现金流合约、收益分配、披露义务、提前终止、争议解决和投资者保护条款进行审查。输出必须包含风险等级、命中规则、修改建议和最终结论。遇到高风险或证据不足时，必须建议人工复核。",
    guardrails: ["输出必须为结构化报告", "不得生成未经验证的法律结论", "高风险条款必须建议人工复核"],
    tools: contractTools,
    workflow: [
      { id: "w1", title: "接收合同材料", description: "读取合同文本、业务背景和门店现金流资产说明。", enabled: true },
      { id: "w2", title: "检索审查标准", description: "从统一知识库检索合同审查标准和现金流资产规则。", enabled: true },
      { id: "w3", title: "规则校验", description: "检查收益分配、披露义务、提前终止和争议处理条款。", enabled: true },
      { id: "w4", title: "输出审查报告", description: "生成风险、建议和结论，并标注是否需要人工复核。", enabled: true },
    ],
    knowledgeIds: ["doc-contract-standard", "doc-cashflow-asset", "doc-compliance-check"],
    rules: [
      { id: "r1", sourceRuleId: "rule-contract-revenue", title: "收益分配口径必须明确", description: "合同需说明门店经营收益的计算口径、扣除项和分配周期。", priority: "高", enabled: true },
      { id: "r2", sourceRuleId: "rule-contract-termination", title: "提前终止需设复核条件", description: "提前终止必须包含触发条件、通知机制和投资者保护安排。", priority: "高", enabled: true },
      { id: "r3", sourceRuleId: "rule-contract-data-auth", title: "数据授权与披露一致", description: "门店数据授权范围需与披露材料和系统采集口径一致。", priority: "中", enabled: true },
    ],
    beforeReport: {
      title: "训练前输出",
      summary: "识别到合同存在若干风险，但未能区分优先级，也缺少针对收益分配口径的具体修改建议。",
      score: 72,
      bullets: ["提示提前终止条款较宽泛", "未引用现金流资产标准化规则", "结论仅建议人工复核，缺少可执行修改项"],
      meta: [
        { label: "风险等级", value: "中" },
        { label: "命中规则", value: "2 条" },
        { label: "结论", value: "需补充审查" },
      ],
    },
    afterReport: {
      title: "训练后输出",
      summary: "明确识别收益分配、提前终止和数据授权三类风险，并给出可落地修改建议，建议在修订后通过。",
      score: 91,
      bullets: ["收益分配条款需补充扣除项和分配周期", "提前终止需增加通知期和人工复核条件", "数据授权范围需与披露材料保持一致"],
      meta: [
        { label: "风险等级", value: "中偏高" },
        { label: "命中规则", value: "3 条" },
        { label: "结论", value: "修订后可通过" },
      ],
    },
    trace: baseTrace,
    timeline: [
      { id: "t1", title: "创建 Agent", description: "定义合同审查用途和初始 Prompt。", time: "09:18" },
      { id: "t2", title: "等待训练", description: "已落在 Contractual Flow x Contract Registrar，尚未发布。", time: "09:28" },
    ],
    apiCalls: [
      { id: "a1", source: "合同登记系统", result: "200 / 风险报告已返回", time: "昨日 16:20" },
      { id: "a2", source: "合约资产工作台", result: "200 / 需人工复核", time: "昨日 15:42" },
    ],
    testCases: [
      {
        id: "tc-contract-1",
        name: "提前终止条款过宽",
        input: "合同允许平台在无通知期情况下提前终止门店收益合约。",
        expected: "识别高风险，要求补充通知期、触发条件和人工复核。",
        status: "通过",
        judgment: "pass" as const,
        split: "train" as const,
      },
      {
        id: "tc-contract-2",
        name: "收益分配口径缺失",
        input: "合同只写明按月分配收益，未说明扣除项和计算口径。",
        expected: "命中收益分配规则，给出补充扣除项和计算口径建议。",
        status: "通过",
        judgment: "pass" as const,
        split: "holdout" as const,
      },
      {
        id: "tc-contract-3",
        name: "数据授权范围不一致",
        input: "门店授权采集日流水，但披露材料使用周度汇总口径。",
        expected: "提示披露口径与授权范围不一致，需要修订。",
        status: "需优化",
        judgment: "fail" as const,
        judgmentNote: "Agent 没识别出口径不一致，只提示了泛化风险，缺少具体修订建议。",
        split: "train" as const,
      },
    ],
    instructionSegments: [
      { id: "seg-c-role", label: "角色" as const, content: "你是滴灌通合同审查 Agent。" },
      { id: "seg-c-task", label: "任务" as const, content: "请围绕门店现金流合约、收益分配、披露义务、提前终止、争议解决和投资者保护条款进行审查。" },
      { id: "seg-c-constraint", label: "约束" as const, content: "遇到高风险或证据不足时，必须建议人工复核。不得生成未经验证的法律结论。" },
      { id: "seg-c-output", label: "输出格式" as const, content: "输出必须包含风险等级、命中规则、修改建议和最终结论。" },
    ],
    fewShots: [
      {
        id: "fs-c-1",
        input: "合同允许平台在无通知期情况下提前终止门店收益合约。",
        output: "【风险等级】高\n【命中规则】提前终止需设复核条件\n【修改建议】补充通知期（不少于 30 天）、触发条件和投资者保护安排\n【结论】需要人工复核，建议在补充保护条款后通过",
      },
    ],
    retrievalConfig: {
      topK: 4,
      tagFilters: ["Contract Registrar", "收益分配"],
    },
    rubric: [
      { id: "rub-c-1", dimension: "风险识别完整性", weight: 40, guide: "识别出合同中所有高中风险条款，不遗漏收益分配、终止、披露三类核心条款" },
      { id: "rub-c-2", dimension: "口径/条款一致性", weight: 30, guide: "检查数据授权范围、收益口径、披露材料三者之间的一致性" },
      { id: "rub-c-3", dimension: "修订建议可执行性", weight: 20, guide: "建议具体到可落地的修改动作，不只说\"存在风险\"" },
      { id: "rub-c-4", dimension: "表述清晰", weight: 10, guide: "报告结构清晰，风险等级、命中规则、建议和结论分层明确" },
    ],
  },
  {
    id: "system-triage",
    name: "系统工单分诊 Agent",
    type: "系统工单",
    purpose: "识别 COP 与平台系统问题类型，判断优先级，推荐责任团队和下一步处理动作。",
    status: "published",
    version: "v0.3",
    score: 88,
    matrixCellKey: cellKey("system", "cop"),
    caseUploaded: true,
    trainedOnce: true,
    feedbackSaved: true,
    feedbackScore: 5,
    feedbackNote: "分类和责任方判断已经能覆盖大部分 COP 工单。",
    prompt:
      "你是系统工单分诊 Agent。请读取工单描述，判断问题类型、优先级、责任团队和下一步动作。优先考虑现金流数据同步、COP 操作阻塞、结算影响和门店范围。",
    guardrails: ["P0/P1 工单必须提示人工确认", "不得直接承诺修复时间", "责任团队必须来自已配置团队"],
    tools: systemTools,
    workflow: [
      { id: "s1", title: "读取工单", description: "解析问题描述、影响对象、截图说明和业务时间点。", enabled: true },
      { id: "s2", title: "判断优先级", description: "结合影响范围、现金流阻塞和结算影响判断 P 级。", enabled: true },
      { id: "s3", title: "推荐责任方", description: "输出 COP、数据平台、结算或门店运营团队。", enabled: true },
    ],
    knowledgeIds: ["doc-cop-ticket", "doc-settlement"],
    rules: [
      { id: "sr1", sourceRuleId: "rule-ticket-settlement", title: "影响结算即提升优先级", description: "若工单影响结算或账本落账，优先级至少为 P1。", priority: "高", enabled: true },
      { id: "sr2", sourceRuleId: "rule-ticket-batch-store", title: "门店范围超过 10 家需升级", description: "涉及多门店批量数据异常时必须建议升级处理。", priority: "中", enabled: true },
    ],
    beforeReport: {
      title: "训练前输出",
      summary: "将工单归为系统异常，但未识别结算影响，责任方建议偏笼统。",
      score: 76,
      bullets: ["分类为系统问题", "优先级判断为 P2", "建议联系平台支持"],
      meta: [
        { label: "分类", value: "系统异常" },
        { label: "优先级", value: "P2" },
        { label: "责任方", value: "平台支持" },
      ],
    },
    afterReport: {
      title: "训练后输出",
      summary: "识别为 COP 数据同步异常，影响结算校验，建议 P1 并路由至数据平台与结算支持。",
      score: 88,
      bullets: ["问题类型：COP 数据同步异常", "优先级：P1，因影响结算状态确认", "责任方：数据平台主责，结算支持协同"],
      meta: [
        { label: "分类", value: "COP 数据同步" },
        { label: "优先级", value: "P1" },
        { label: "责任方", value: "数据平台" },
      ],
    },
    trace: baseTrace,
    timeline: [
      { id: "st1", title: "完成训练", description: "使用 COP 工单分诊手册完成第二轮优化。", time: "昨日 18:10" },
      { id: "st2", title: "发布到矩阵", description: "已发布至 System Flow x COP。", time: "昨日 18:22" },
    ],
    apiCalls: [
      { id: "sa1", source: "COP 工单系统", result: "200 / P1 已路由", time: "今日 10:32" },
      { id: "sa2", source: "运维工作台", result: "200 / 摘要已生成", time: "今日 09:18" },
    ],
    testCases: [
      {
        id: "tc-system-1",
        name: "COP 数据同步延迟",
        input: "12 家门店今日现金流未同步，结算页面状态卡在待确认。",
        expected: "分类为 COP 数据同步异常，优先级 P1，路由数据平台和结算支持。",
        status: "通过",
        judgment: "pass" as const,
        split: "train" as const,
      },
      {
        id: "tc-system-2",
        name: "单门店账户权限",
        input: "单个门店用户无法进入 COP 查看收益报表。",
        expected: "分类为账户权限问题，优先级 P3，路由平台支持。",
        status: "通过",
        judgment: "pass" as const,
        split: "holdout" as const,
      },
      {
        id: "tc-system-3",
        name: "批量门店截图缺失",
        input: "运营反馈多门店页面异常，但未提供截图和门店清单。",
        expected: "要求补充关键字段后再分诊。",
        status: "待验证",
        judgment: null,
        split: "train" as const,
      },
    ],
    instructionSegments: [
      { id: "seg-s-role", label: "角色" as const, content: "你是系统工单分诊 Agent。" },
      { id: "seg-s-task", label: "任务" as const, content: "请读取工单描述，判断问题类型、优先级、责任团队和下一步动作。优先考虑现金流数据同步、COP 操作阻塞、结算影响和门店范围。" },
      { id: "seg-s-constraint", label: "约束" as const, content: "P0/P1 工单必须提示人工确认。不得直接承诺修复时间。责任团队必须来自已配置团队。" },
      { id: "seg-s-output", label: "输出格式" as const, content: "输出分类、优先级（P0-P3）、责任团队和处理摘要。" },
    ],
    fewShots: [
      {
        id: "fs-s-1",
        input: "12 家门店今日现金流未同步，结算页面状态卡在待确认。",
        output: "【分类】COP 数据同步异常\n【优先级】P1（影响结算状态确认）\n【责任方】数据平台主责，结算支持协同\n【摘要】多门店批量数据同步异常，已影响当日结算，需立即升级处理",
      },
    ],
    retrievalConfig: {
      topK: 3,
      tagFilters: ["COP", "System Flow"],
    },
    rubric: [
      { id: "rub-s-1", dimension: "分类准确性", weight: 35, guide: "准确识别 COP 数据同步、账户权限、结算异常等问题类型" },
      { id: "rub-s-2", dimension: "优先级判断", weight: 35, guide: "结合结算影响、门店范围、阻塞程度给出正确的 P0-P3 级别" },
      { id: "rub-s-3", dimension: "责任方路由", weight: 20, guide: "正确推荐处理团队，P1 及以上需标注人工确认" },
      { id: "rub-s-4", dimension: "摘要可转派", weight: 10, guide: "摘要应简洁可读，可直接用于工单转派" },
    ],
  },
];


const shallowPlacements = [
  ["rwc-monitor", "RWC 现金流校验 Agent", "现金流校验", "origination", "rwc", "published"],
  ["cop-guide", "COP 操作指引 Agent", "操作辅助", "origination", "cop", "trained"],
  ["pcf-summary", "PCF 报告摘要 Agent", "报告摘要", "origination", "pcf-reporting", "published"],
  ["disclosure-check", "披露材料检查 Agent", "披露审核", "disclosure", "primary-issue", "published"],
  ["acf-compare", "ACF 差异比对 Agent", "报告比对", "disclosure", "acf-reporting", "trained"],
  ["fund-route", "资金流向核对 Agent", "资金核对", "fund", "settlement", "published"],
  ["ledger-reconcile", "账本对账 Agent", "账本核验", "ledger", "settlement", "published"],
  ["qr-verify", "QR Code 门店校验 Agent", "门店校验", "qr-code", "rwc", "trained"],
  ["contract-template", "合同模板生成 Agent", "合同生成", "contractual", "primary-issue", "published"],
  ["compliance-watch", "合规观察 Agent", "合规监测", "compliance", "primary-issue", "published"],
  ["settlement-reconcile", "结算差异解释 Agent", "结算解释", "system", "settlement", "published"],
  ["matching-helper", "Matching 异常定位 Agent", "匹配定位", "fund", "matching", "trained"],
  ["cdr-creator", "CDR 创建助手 Agent", "数据创建", "origination", "cdr-creation", "draft"],
  ["secondary-risk", "二级交易风险 Agent", "交易风险", "compliance", "secondary-trading", "published"],
  ["issue-packager", "发行材料组装 Agent", "材料组装", "disclosure", "pcf-reporting", "trained"],
  ["fund-ledger", "资金账本解释 Agent", "账本解释", "fund", "ledger", "draft"],
  ["ledger-cdr", "账本 CDR 校验 Agent", "账本校验", "ledger", "cdr-creation", "published"],
  ["qr-cop", "QR Code COP 支持 Agent", "操作支持", "qr-code", "cop", "trained"],
  ["contract-settle", "合同结算条款 Agent", "结算条款", "contractual", "settlement", "trained"],
  ["compliance-disclosure", "合规披露 Agent", "合规披露", "compliance", "acf-reporting", "published"],
  ["system-ledger", "系统账本排查 Agent", "系统排查", "system", "settlement", "trained"],
  ["system-cdr", "CDR 系统校验 Agent", "系统校验", "system", "cdr-creation", "published"],
] as const;

const shallowAgents: Agent[] = shallowPlacements.map(([id, name, type, work, func, status], index) => ({
  id,
  name,
  type,
  purpose: `用于 ${workFlows.find((w) => w.id === work)?.label} 与 ${functionalFlows.find((f) => f.id === func)?.label} 节点的日常判断、摘要或校验。`,
  status,
  version: status === "published" ? "v0.2" : "v0.1",
  score: status === "published" ? 84 + (index % 8) : 68 + (index % 10),
  matrixCellKey: cellKey(work, func),
  caseUploaded: status !== "draft",
  trainedOnce: status !== "draft",
  feedbackSaved: status === "published",
  prompt: `你是 ${name}，请按节点业务规则输出可复核结果。`,
  guardrails: ["输出结构化结果", "异常情况提示人工复核"],
  tools: [
    { id: "search", name: "知识检索", description: "检索节点相关标准。", enabled: true },
    { id: "summary", name: "结果摘要", description: "生成业务摘要。", enabled: true },
  ],
  workflow: [
    { id: "w1", title: "读取输入", description: "解析业务材料或系统事件。", enabled: true },
    { id: "w2", title: "输出建议", description: "生成可复核处理建议。", enabled: true },
  ],
  knowledgeIds: index % 2 === 0 ? ["doc-cashflow-asset"] : ["doc-compliance-check"],
  rules: [
    { id: "r1", sourceRuleId: "rule-required-fields", title: "关键字段完整", description: "缺少关键字段时提示补充。", priority: "中", enabled: true },
  ],
  beforeReport: {
    title: "摘要输出",
    summary: "该节点已配置基础业务能力。",
    score: 70,
    bullets: ["可读取知识片段", "可输出基础判断"],
    meta: [
      { label: "状态", value: status === "published" ? "已发布" : status === "trained" ? "待发布" : "待训练" },
    ],
  },
  afterReport: {
    title: "优化后输出",
    summary: "完成训练后可提供更准确的节点处理建议。",
    score: 84,
    bullets: ["规则命中更清晰", "建议动作更具体"],
    meta: [
      { label: "状态", value: status === "published" ? "已发布" : "待训练" },
    ],
  },
  trace: baseTrace.slice(0, 3),
  timeline: [
    { id: "t1", title: "节点建档", description: "已进入矩阵建设清单。", time: "本周" },
  ],
  apiCalls: [],
  testCases: [
    {
      id: `tc-${id}-1`,
      name: "节点基础样例",
      input: "输入一条节点相关业务材料。",
      expected: "输出结构化摘要、判断和下一步动作。",
      status: status === "published" ? "通过" : "待验证",
    },
  ],
  shallow: true,
}));

export const defaultState: AppState = {
  agents: [...mainAgents, ...shallowAgents],
  docs,
  rules,
  tools,
  evalRuns,
  apiKeys,
};
