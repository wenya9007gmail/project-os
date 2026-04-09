import type { Project, ProjectSource } from '../types'

// ── 系统角色 ─────────────────────────────────────────────────────
export const SYSTEM_PROMPT = `你是一位资深项目分析师，专注于互联网项目的商业可行性评估与执行路径设计。

你的核心原则：
1. 只基于用户提供的真实资料，绝不编造数据
2. 对每个维度给出客观评分和明确理由
3. 信度和效度是底线——结论必须有证据支撑
4. 如果资料不足，直接说"资料不足，无法判断"，不强行得出结论
5. 输出严格符合 JSON 格式，字段不得缺失

自动化等级定义：
- full_auto: 规则清晰、重复高、标准化强，可完全自动化
- semi_auto: AI 先做，人工确认，或有条件自动化
- manual: 依赖判断、关系、风险承担，必须人工`

// ── 七维分析主 Prompt ─────────────────────────────────────────────
export function buildFirstPassPrompt(
  project: Project,
  sources: ProjectSource[],
  knowledgeChunks: Array<{ chunk_text: string; tags: string[]; similarity: number }>
): string {
  const sourcesText = sources
    .map((s, i) => `【资料${i + 1}】类型:${s.source_type} 标题:${s.source_title || '无'}\n${s.content_raw}`)
    .join('\n\n---\n\n')

  const knowledgeText = knowledgeChunks.length > 0
    ? knowledgeChunks
        .map(c => `[相关知识 相似度${(c.similarity * 100).toFixed(0)}%] ${c.chunk_text}`)
        .join('\n\n')
    : '暂无相关知识库内容'

  return `# 项目七维深度分析

## 项目基本信息
- 项目名称：${project.name}
- 项目类型：${project.type}
- 项目描述：${project.description || '未填写'}
- 当前目标：${project.goal || '未填写'}
- 备注：${project.notes || '无'}

## 用户提供的原始资料（共 ${sources.length} 份）
${sourcesText || '（暂无资料，请基于项目名称和描述进行初步分析，信度评分应偏低）'}

## 知识库相关内容（供参考）
${knowledgeText}

---

## 分析任务

请对此项目进行七维深度分析，输出完整 JSON（严格遵守以下格式，不得省略字段）：

\`\`\`json
{
  "project_definition": "一句话精准定义：[目标用户] 通过 [核心方式] 实现 [核心价值]",

  "dimension_scores": {
    "feasibility":   { "score": 0, "label": "可行性",   "verdict": "高/中/低", "reason": "3-5句分析，说明技术/资源/时间门槛" },
    "novelty":       { "score": 0, "label": "新度",     "verdict": "高/中/低", "reason": "3-5句分析，市场饱和程度和差异化空间" },
    "validity":      { "score": 0, "label": "效度",     "verdict": "高/中/低", "reason": "3-5句分析，结论依据是否充分、逻辑是否自洽" },
    "reliability":   { "score": 0, "label": "信度",     "verdict": "高/中/低", "reason": "3-5句分析，资料来源质量、样本是否充分" },
    "monetization":  { "score": 0, "label": "变现清晰度", "verdict": "高/中/低", "reason": "3-5句分析，变现路径是否清晰可执行" },
    "competition":   { "score": 0, "label": "竞品格局", "verdict": "红海/蓝海/细分蓝海", "reason": "3-5句分析，主要竞品和竞争激烈程度" },
    "startup_cost":  { "score": 0, "label": "启动成本", "verdict": "低/中/高", "reason": "3-5句估算，资金/人力/时间的粗略需求" }
  },

  "overall_confidence": 0,
  "overall_verdict": "可推进/需补充资料/不建议推进",
  "verdict_reason": "2-3句综合判断，说明主要依据和最大风险点",

  "target_user": "详细描述目标用户：身份、核心痛点、使用场景、支付意愿",

  "monetization_paths": [
    {
      "path": "变现路径名称",
      "method": "具体执行方式",
      "timeline": "预计启动到首次收入的时间",
      "revenue_potential": "低/中/高，附简要说明",
      "prerequisite": "前提条件"
    }
  ],

  "competitive_landscape": {
    "main_competitors": [
      { "name": "竞品名", "strengths": "优势", "weaknesses": "劣势", "market_share": "估计占比或描述" }
    ],
    "differentiation_opportunity": "差异化切入点",
    "moat": "护城河或壁垒分析"
  },

  "startup_cost_breakdown": {
    "capital": "资金估算（范围）",
    "team": "人力需求（人数和角色）",
    "time_to_mvp": "到 MVP 的时间估算",
    "key_resources": ["关键资源1", "关键资源2"]
  },

  "workflow": [
    { "step": 1, "name": "步骤名", "description": "具体描述", "tools": ["工具"], "automatable": true }
  ],

  "automation_map": [
    {
      "node": "流程节点",
      "current_approach": "当前做法",
      "automatable": true,
      "level": "full_auto/semi_auto/manual",
      "recommended_solution": "推荐方案",
      "priority": "high/medium/low",
      "needs_human": false
    }
  ],

  "risks": [
    { "risk": "风险描述", "level": "high/medium/low", "probability": "高/中/低", "mitigation": "规避方案" }
  ],

  "gaps": [
    {
      "gap": "缺失信息描述",
      "importance": "high/medium/low",
      "fill_type": "public/login/user",
      "suggested_source": "建议获取方式",
      "impact_if_missing": "缺失会影响哪个分析维度"
    }
  ],

  "mvp_suggestion": "MVP 建议：第一版做什么、不做什么，以及验证什么假设",
  "next_action": "当前最重要的一个行动（具体可执行）"
}
\`\`\`

评分规则（0-100）：
- feasibility: 100=无技术难度+资源充足，0=极高门槛或不可行
- novelty: 100=全新赛道，0=完全红海
- validity: 100=结论有多方数据支撑，0=无任何证据支持
- reliability: 100=一手数据+充足样本，0=道听途说或单一来源
- monetization: 100=路径清晰+有成功案例，0=完全不知道怎么赚钱
- competition: 100=行业格局清晰分析，0=完全不了解竞品
- startup_cost: 100=低成本可验证，0=需要大量前期投入
- overall_confidence: 综合以上七维的加权平均，诚实反映资料充分程度

禁止规则：
- 不得因为资料少就给高分
- 不得输出 JSON 之外的任何内容
- overall_confidence < 50 时 overall_verdict 必须是"需补充资料"`
}

// ── 任务包生成 Prompts ────────────────────────────────────────────
export function buildDevHandoffPrompt(analysisJson: string, projectName: string): string {
  return `基于以下项目七维分析结果，生成一份给【开发助手】的任务包。

项目：${projectName}

分析结果：
${analysisJson}

要求输出 Markdown 格式，包含：
1. **项目技术背景**（2-3句，基于 project_definition 和 startup_cost_breakdown）
2. **需要开发的模块清单**（按优先级，参考 workflow 和 mvp_suggestion）
3. 每个模块：功能描述、技术方案建议、接口设计要点
4. **数据库/数据结构需求**
5. **可完全自动化的技术节点**（automation_map 中 level=full_auto 的）
6. **验收标准**
7. **风险提示**（risks 中 level=high 的技术风险）

风格：直接、技术化、不废话。`
}

export function buildContentHandoffPrompt(analysisJson: string, projectName: string): string {
  return `基于以下项目七维分析结果，生成一份给【内容助手】的任务包。

项目：${projectName}

分析结果：
${analysisJson}

要求输出 Markdown 格式，包含：
1. **内容定位**（基于 target_user 和 competitive_landscape.differentiation_opportunity）
2. **需要生产的内容清单**（按平台/类型，参考 monetization_paths）
3. 每类内容：主题方向、关键信息点、发布节奏
4. **变现相关内容策略**（对应 monetization_paths）
5. **可自动化生产的内容类型**及工具建议
6. **竞品差异化打法**（基于 competitive_landscape）

风格：清晰、可直接执行。`
}

export function buildResearchHandoffPrompt(analysisJson: string, projectName: string, gaps: string[]): string {
  return `基于以下项目七维分析结果，生成一份给【研究助手】的任务包。

项目：${projectName}

信息缺口（需优先补充）：
${gaps.join('\n')}

分析结果：
${analysisJson}

要求输出 Markdown 格式，包含：
1. **信息缺口清单**（按 gaps.importance 排序，注明 impact_if_missing）
2. 每条信息：获取方式、搜索关键词/URL、预期用途
3. **竞品深度研究清单**（补充 competitive_landscape 的薄弱项）
4. **市场数据需求**（提升 validity 和 reliability 评分所需数据）
5. **需登录采集的内容**（fill_type=login 的，标注需人工配合）
6. **建议优先级**：补充完哪些资料后 overall_confidence 提升最大

风格：专业、信息密度高、可直接行动。`
}

// ── 项目信息提取 Prompt ───────────────────────────────────────────
export function buildProjectExtractionPrompt(materialsText: string): string {
  return `你是一个项目解析专家。用户提供了一批项目资料，请从中提取项目关键信息。

## 用户提供的原始资料
${materialsText}

---

## 你的任务
仔细阅读以上资料，提取出项目的核心信息，输出严格的 JSON 格式：

\`\`\`json
{
  "name": "项目名称（简洁，不超过20字）",
  "type": "ip 或 ai_content 或 tool 或 other",
  "description": "2-3句话描述这个项目是什么",
  "goal": "用户最核心的目标是什么（一句话）",
  "notes": "其他补充信息（可为空字符串）"
}
\`\`\`

type 取值规则：
- ip：个人品牌、内容创作、知识变现相关
- ai_content：AI生成内容、自动化创作
- tool：SaaS、小程序、效率工具、技术产品
- other：电商、服务、咨询、其他

只输出 JSON，不要任何解释文字。`
}
