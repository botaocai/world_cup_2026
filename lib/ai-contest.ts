import { settleBet } from "@/lib/settlement";
import {
  createId,
  readDb,
  timestamp,
  writeDb,
  type AiContestAgent,
  type AiContestBet,
  type AiContestDiscussion,
  type AiContestRound,
  type Db,
  type Match,
  type OddsSnapshot,
} from "@/lib/store";
import { teamZh } from "@/lib/teams";

const INITIAL_BALANCE = 3000;

type ModelConfig = {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
};

type AiDecision = {
  strategyType?: string;
  strategyName?: string;
  bankrollRule?: string;
  strategyChange?: string;
  skipReason?: string;
  bets?: Array<{
    oddsId: string;
    stake: number;
    confidence?: "low" | "medium" | "high";
    reason?: string;
  }>;
};

function agentStyleHint(agent: AiContestAgent) {
  const hints: Record<string, string> = {
    "wegame-gemini": "数据价值流：优先找赔率被低估的一侧，可以稳健，但必须解释为什么不是简单追热门。",
    "wegame-gpt": "综合均衡流：允许热门、让球、大小球混合，重点是风险收益比和分散。",
    "wegame-claude": "反共识波胆流：主动寻找热门方向之外的小额高赔率机会，波胆和冷门可以作为差异化武器。",
    "tokenhub-hy3": "冷门逆向流：重点审视弱队不败、受让和高赔胜平负，只有赔率补偿足够时才出手。",
    "tokenhub-kimi": "结构化盘口流：把让球、大小球、独赢和波胆拆开比较，偏向发现盘口矛盾。",
    "tokenhub-minimax": "节奏大小球流：优先从比赛节奏、进球环境和大小球盘口寻找机会。",
    "tokenhub-deepseek-flash": "浅盘快攻流：偏向小额多点下注，找临界盘口和赔率变化里的短机会。",
    "tokenhub-deepseek-pro": "深盘强弱流：可以支持强队，但要看让球深度是否合理，也要保留小额波胆或反向保护。",
  };
  return hints[agent.id] || "自由策略流：你要形成和其他模型不同的判断框架，避免所有注单同质化。";
}

type AiDiscussionDecision = {
  stance?: string;
  keyPoints?: string[];
  preferredAngles?: string[];
  riskWarning?: string;
};

const FIXED_CHAMPION_PICKS: Record<string, string> = {
  "wegame-gemini": "France",
  "wegame-gpt": "Brazil",
  "wegame-claude": "France",
  "tokenhub-hy3": "France",
  "tokenhub-kimi": "Spain",
  "tokenhub-minimax": "France",
  "tokenhub-deepseek-flash": "France",
  "tokenhub-deepseek-pro": "France",
};

function cleanModelText(value: unknown) {
  if (typeof value !== "string") return "";
  if (!/[ÃÂéèåç]/.test(value)) return value;
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, handler: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await handler(current));
    }
  });
  await Promise.all(workers);
  return results;
}

function defaultModelConfigs(): ModelConfig[] {
  const configs: ModelConfig[] = [];
  if (process.env.LLM_API_KEY) {
    const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
    configs.push({
      id: "wegame-gemini",
      name: "Gemini",
      provider: "WeGame LLM",
      baseUrl,
      apiKeyEnv: "LLM_API_KEY",
      model: "gemini-3.1-pro-preview",
    });
    configs.push({
      id: "wegame-gpt",
      name: "GPT",
      provider: "WeGame LLM",
      baseUrl,
      apiKeyEnv: "LLM_API_KEY",
      model: "gpt-5.4-mini",
    });
    configs.push({
      id: "wegame-claude",
      name: "Claude",
      provider: "WeGame LLM",
      baseUrl,
      apiKeyEnv: "LLM_API_KEY",
      model: "claude-sonnet-4-6",
    });
  }
  if (process.env.TOKENHUB_API_KEY) {
    const baseUrl = process.env.TOKENHUB_BASE_URL || "https://tokenhub.tencentmaas.com/v1";
    configs.push({
      id: "tokenhub-hy3",
      name: "Hy3",
      provider: "腾讯云 TokenHub",
      baseUrl,
      apiKeyEnv: "TOKENHUB_API_KEY",
      model: process.env.TOKENHUB_HY3_MODEL || "hy3-preview",
    });
    configs.push({
      id: "tokenhub-kimi",
      name: "Kimi",
      provider: "腾讯云 TokenHub",
      baseUrl,
      apiKeyEnv: "TOKENHUB_API_KEY",
      model: process.env.TOKENHUB_KIMI_MODEL || "kimi-k2.7-code",
    });
    configs.push({
      id: "tokenhub-minimax",
      name: "MiniMax",
      provider: "腾讯云 TokenHub",
      baseUrl,
      apiKeyEnv: "TOKENHUB_API_KEY",
      model: process.env.TOKENHUB_MINIMAX_MODEL || "minimax-m3",
    });
    configs.push({
      id: "tokenhub-deepseek-flash",
      name: "DeepSeek Flash",
      provider: "腾讯云 TokenHub",
      baseUrl,
      apiKeyEnv: "TOKENHUB_API_KEY",
      model: process.env.TOKENHUB_DEEPSEEK_FLASH_MODEL || "deepseek-v4-flash",
    });
    configs.push({
      id: "tokenhub-deepseek-pro",
      name: "DeepSeek Pro",
      provider: "腾讯云 TokenHub",
      baseUrl,
      apiKeyEnv: "TOKENHUB_API_KEY",
      model: process.env.TOKENHUB_DEEPSEEK_PRO_MODEL || "deepseek-v4-pro",
    });
  }
  return configs;
}

export function aiContestModelConfigs() {
  const raw = process.env.AI_CONTEST_MODELS;
  if (!raw) return defaultModelConfigs();
  try {
    const parsed = JSON.parse(raw) as ModelConfig[];
    return parsed.filter((item) => item.id && item.name && item.baseUrl && item.apiKeyEnv && item.model);
  } catch {
    return defaultModelConfigs();
  }
}

function ensureAgents(db: Db) {
  const configs = aiContestModelConfigs();
  const now = timestamp();
  for (const config of configs) {
    const existing = db.aiContestAgents.find((agent) => agent.id === config.id);
    if (existing) {
      existing.name = config.name;
      existing.provider = config.provider;
      existing.baseUrl = config.baseUrl;
      existing.model = config.model;
      existing.updatedAt = now;
      continue;
    }
    db.aiContestAgents.push({
      id: config.id,
      name: config.name,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      balance: INITIAL_BALANCE,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }
  return configs;
}

function oddsForMatch(db: Db, matchId: string) {
  return db.oddsSnapshots
    .filter((odd) => odd.matchId === matchId && ["h2h", "spreads", "totals", "correct_score"].includes(odd.market))
    .sort((a, b) => {
      const order = ["h2h", "spreads", "totals", "correct_score"];
      return order.indexOf(a.market) - order.indexOf(b.market) || a.price - b.price;
    });
}

function matchLabel(match: Match) {
  return `${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)}`;
}

function matchEnglishLabel(match: Match) {
  return `${match.homeTeam} vs ${match.awayTeam}`;
}

function formatMarket(odd: OddsSnapshot) {
  return `${odd.id} | ${odd.market} | ${odd.label} | odds ${odd.price}${odd.line !== undefined ? ` | line ${odd.line}` : ""}`;
}

function formatMarketEnglish(odd: OddsSnapshot) {
  return `${odd.id} | market=${odd.market} | side=${odd.selection} | label=${odd.label} | price=${odd.price}${odd.line !== undefined ? ` | line=${odd.line}` : ""}`;
}

function recentPerformance(db: Db, agentId: string) {
  const bets = db.aiContestBets.filter((bet) => bet.agentId === agentId);
  const settled = bets.filter((bet) => bet.status !== "pending");
  const pending = bets.filter((bet) => bet.status === "pending");
  const profit = settled.reduce((sum, bet) => sum + bet.profit, 0);
  return {
    totalBets: bets.length,
    settledBets: settled.length,
    pendingBets: pending.length,
    profit,
    winRate: settled.length ? settled.filter((bet) => bet.status === "won").length / settled.length : 0,
    recent: bets.slice(-8).map((bet) => `${bet.selectionLabel} stake ${bet.stake} @${bet.price} ${bet.status} profit ${bet.profit}`),
  };
}

function buildKimiDiscussionPrompt(db: Db, agent: AiContestAgent, match: Match) {
  const perf = recentPerformance(db, agent.id);
  return `You are Kimi in a private World Cup virtual-points betting contest.
This is a pre-match discussion, not the final betting slip.
Your persona: structured market-comparison player. Compare handicap, totals, moneyline and correct score. Look for market contradictions.
Do not say the prompt is mojibake. Return valid JSON only. Use Chinese text for all JSON values.

Current performance:
${JSON.stringify(perf, null, 2)}

Match:
${match.id}: ${matchEnglishLabel(match)} kickoff ${match.commenceTime} stage ${match.stage} group ${match.groupName || "unknown"}

Odds:
${oddsForMatch(db, match.id).slice(0, 80).map(formatMarketEnglish).join("\n")}

Required JSON schema:
{
  "stance": "中文一句话倾向，可以倾向冷门、受让、大小球、波胆或观望",
  "keyPoints": ["中文依据1", "中文依据2"],
  "preferredAngles": ["中文玩法1", "中文玩法2"],
  "riskWarning": "中文风险提示"
}`;
}

function buildKimiPrompt(db: Db, agent: AiContestAgent, matches: Match[]) {
  const perf = recentPerformance(db, agent.id);
  const previousStrategy = agent.strategy || "none";
  const previousBankrollRule = agent.bankrollRule || "none";
  const matchBlocks = matches.map((match) => [
    `MATCH ${match.id}: ${matchEnglishLabel(match)} kickoff ${match.commenceTime} stage ${match.stage} group ${match.groupName || "unknown"}`,
    `ODDS:\n${oddsForMatch(db, match.id).slice(0, 80).map(formatMarketEnglish).join("\n")}`,
  ].join("\n"));

  return `You are Kimi in a private World Cup virtual-points betting contest.
Initial bankroll: 3000 points. Current bankroll: ${agent.balance} points.
Goal: maximize final points, not hit rate.
Persona suggestion: structured market-comparison player. Compare handicap, totals, moneyline and correct score. Look for market contradictions and differentiated upside.

Previous strategy: ${previousStrategy}
Previous bankroll rule: ${previousBankrollRule}

Rules:
- Single bets only. No parlays.
- Use only listed oddsId values.
- Total stake this round must be <= 25% of current bankroll.
- Each stake must be 20 to 600 points.
- Usually place 1-4 bets.
- Correct score is allowed, but high variance and should usually be small stake.
- Avoid copying favorites blindly. If you bet a favorite, explain why it beats draw, underdog handicap, totals and correct score.
- You must choose one Chinese strategyType such as 稳健价值, 冷门逆向, 波胆狙击, 大小球专家, 让球盘口, 混合套利.

Performance:
${JSON.stringify(perf, null, 2)}

Matches and odds:
${matchBlocks.join("\n\n")}

Return valid JSON only. No markdown. No thinking text. Use Chinese text for all natural-language values.
Required JSON schema:
{
  "strategyType": "中文策略流派",
  "strategyName": "中文简短策略名称",
  "bankrollRule": "中文资金管理规则",
  "strategyChange": "中文说明策略变化",
  "bets": [
    {
      "oddsId": "exact oddsId from the list",
      "stake": 100,
      "confidence": "low|medium|high",
      "reason": "中文下注理由"
    }
  ],
  "skipReason": "如果不下注，中文说明原因；否则为空字符串"
}`;
}

function buildDiscussionPrompt(db: Db, agent: AiContestAgent, match: Match) {
  if (agent.id === "tokenhub-kimi") return buildKimiDiscussionPrompt(db, agent, match);
  const perf = recentPerformance(db, agent.id);
  const intel = db.matchIntelligence
    .filter((item) => item.matchId === match.id && item.status === "ready")
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];

  return `你是 ${agent.name}，正在参加一个世界杯 AI 模型虚拟积分下注大赛。
下注前，所有参赛模型要先围绕每场比赛做一次赛前讨论。这里不是最终下注单，而是你的讨论发言。
你必须用中文输出。不要写英文。不要机械翻译赔率，要给出你自己的判断角度。
讨论时不要只复读强队上盘；必须主动评价冷门、受让、大小球、波胆是否有差异化价值。

你当前风格：${agent.strategy || "尚未形成"}
你的参赛流派建议：${agentStyleHint(agent)}
你当前资金管理：${agent.bankrollRule || "尚未形成"}
你的历史表现：
${JSON.stringify(perf, null, 2)}

比赛：
${match.id}: ${matchLabel(match)} kickoff ${match.commenceTime} stage ${match.stage} group ${match.groupName || "unknown"}

赔率：
${oddsForMatch(db, match.id).slice(0, 80).map(formatMarket).join("\n")}

赛事情报：
${intel ? intel.content.slice(0, 1400) : "none"}

只返回严格 JSON，不要 markdown，不要代码块。所有字段值必须是中文：
{
  "stance": "一句话说明你的倾向，或者明确观望",
  "keyPoints": ["2-4条具体判断依据"],
  "preferredAngles": ["值得考虑的玩法或盘口"],
  "riskWarning": "这场判断最可能错在哪里"
}`;
}

function discussionText(db: Db, matches: Match[]) {
  return matches.map((match) => {
    const items = db.aiContestDiscussions
      .filter((item) => item.matchId === match.id)
      .slice(-20)
      .map((item) => {
        const agent = db.aiContestAgents.find((candidate) => candidate.id === item.agentId);
        return `${agent?.name || item.agentId}: ${item.stance}\nPoints: ${item.keyPoints.join(" / ")}\nAngles: ${item.preferredAngles.join(" / ")}\nRisk: ${item.riskWarning}`;
      });
    return `DISCUSSION ${matchLabel(match)}:\n${items.length ? items.join("\n\n") : "No discussion yet."}`;
  }).join("\n\n");
}

function buildPrompt(db: Db, agent: AiContestAgent, matches: Match[]) {
  if (agent.id === "tokenhub-kimi") return buildKimiPrompt(db, agent, matches);
  const perf = recentPerformance(db, agent.id);
  const previousStrategy = agent.strategy || "尚未形成";
  const previousBankrollRule = agent.bankrollRule || "尚未形成";
  const matchBlocks = matches.map((match) => {
    const intel = db.matchIntelligence
      .filter((item) => item.matchId === match.id && item.status === "ready")
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
    return [
      `MATCH ${match.id}: ${matchLabel(match)} kickoff ${match.commenceTime} stage ${match.stage} group ${match.groupName || "unknown"}`,
      `ODDS:\n${oddsForMatch(db, match.id).slice(0, 80).map(formatMarket).join("\n")}`,
      intel ? `INTEL:\n${intel.content.slice(0, 1200)}` : "INTEL: none",
    ].join("\n");
  });

  return `你是 ${agent.name}，正在参加一个私人世界杯 AI 模型虚拟积分下注大赛。
初始资金 3000 分。你当前余额是 ${agent.balance} 分。
你的目标是在整届比赛结束时积分尽可能高，不是命中率最高。

你必须自己选择策略和资金管理，并且可以根据历史表现调整策略。
你的参赛流派建议：${agentStyleHint(agent)}
上一轮策略：${previousStrategy}
上一轮资金管理：${previousBankrollRule}

重要原则：
- 不要无脑买强队。低赔率热门往往已经被充分定价。
- 这不是同质化预测赛。如果所有模型都买同一个低赔率热门，很难拉开积分差距。
- 你必须先选择本轮策略流派：稳健价值、冷门逆向、波胆狙击、大小球专家、让球盘口、混合套利等。
- 允许小额下注冷门、波胆或反共识方向，但必须说明赔率补偿和球队正负面因素。
- 如果你仍然选择热门强队，必须解释为什么它比受让、平局、波胆或大小球更有价值。
- 除非完全没有价值，建议至少有一笔体现你流派的差异化下注。
- 必须考虑风险收益比、赛程战意、球队状态、盘口类型和赔率价格。
- 没有价值时可以全部跳过。
- 所有输出必须是中文，不能写英文分析。

风控规则：
- 只允许单关，不允许串关。
- 只能使用下面列出的 oddsId。
- 本轮总下注金额不能超过当前余额的 25%。
- 单笔下注 20 到 600 分。
- 通常下注 1-4 笔。
- 波胆允许，但方差大，通常应该小额。

历史表现：
${JSON.stringify(perf, null, 2)}

本轮窗口内的比赛和赔率：
${matchBlocks.join("\n\n")}

所有参赛模型的赛前讨论：
${discussionText(db, matches)}

只返回严格 JSON，不要 markdown，不要代码块。所有字段值必须是中文：
{
  "strategyType": "本轮策略流派，例如冷门逆向/波胆狙击/大小球专家/稳健价值/混合套利",
  "strategyName": "你本轮采用的简短策略名称",
  "bankrollRule": "你本轮采用的资金管理规则",
  "strategyChange": "说明相比上一轮策略是坚持、微调还是大幅改变，以及原因",
  "bets": [
    {
      "oddsId": "必须精确使用列表中的 oddsId",
      "stake": 100,
      "confidence": "low|medium|high",
      "reason": "中文说明为什么这笔下注有价值"
    }
  ],
  "skipReason": "如果本轮完全不下注，用中文说明原因；否则为空字符串"
}`;
}

function findJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start < 0) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return "";
}

function extractJson<T>(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || findJsonObject(text) || text;
  return JSON.parse(candidate) as T;
}

async function callJsonModel<T>(config: ModelConfig, prompt: string) {
  const raw = await callModel(config, prompt);
  try {
    return { raw, parsed: extractJson<T>(raw) };
  } catch {
    const retryRaw = await callModel(
      config,
      `${prompt}

你上一次输出无法被系统解析。现在不要解释，不要写思考过程，不要 markdown，不要代码块，只返回一个合法 JSON 对象。

上一次输出如下，请把它修复成合法 JSON；如果它没有可用内容，就根据任务重新给出合法 JSON：
${raw.slice(0, 2400)}`,
    );
    return { raw: retryRaw, parsed: extractJson<T>(retryRaw) };
  }
}

async function callModel(config: ModelConfig, prompt: string) {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) throw new Error(`missing ${config.apiKeyEnv}`);
  const isKimi = config.model.toLowerCase().includes("kimi");
  const temperature = isKimi ? 1 : 0.35;
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature,
      max_tokens: isKimi ? 8000 : 2200,
      messages: [
        {
          role: "system",
          content: isKimi
            ? "You are a strict World Cup virtual-points betting contestant. Return valid JSON only. No markdown. No thinking text. Use Chinese for natural-language JSON values."
            : "你是一个纪律严格的世界杯虚拟积分下注大赛参赛模型。必须只返回合法 JSON，且所有自然语言内容必须使用中文。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${detail.slice(0, 240)}`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const content = message?.content || message?.reasoning_content || data.choices?.[0]?.text;
  if (!content) throw new Error("empty model response");
  return String(content);
}

export function aiContestDashboard() {
  const db = readDb();
  ensureAgents(db);
  writeDb(db);
  return serializeDashboard(db);
}

export function resetAiContest() {
  const db = readDb();
  db.aiContestAgents = [];
  db.aiContestBets = [];
  db.aiContestRounds = [];
  db.aiContestDiscussions = [];
  ensureAgents(db);
  writeDb(db);
  return serializeDashboard(db);
}

async function runMatchDiscussions(db: Db, configs: ModelConfig[], matches: Match[]) {
  const tasks = matches.flatMap((match) =>
    db.aiContestAgents
      .filter((item) => item.status !== "disabled")
      .filter((agent) => !db.aiContestDiscussions.some((discussion) => discussion.matchId === match.id && discussion.agentId === agent.id))
      .map((agent) => ({ match, agent })),
  );

  const discussions = await mapWithConcurrency(tasks, 8, async ({ match, agent }) => {
    const config = configs.find((item) => item.id === agent.id);
    const discussion: AiContestDiscussion = {
      id: createId(),
      agentId: agent.id,
      matchId: match.id,
      stance: "",
      keyPoints: [],
      preferredAngles: [],
      riskWarning: "",
      createdAt: timestamp(),
    };
    if (!config) {
      discussion.error = "missing model config";
      discussion.stance = "Discussion failed";
      discussion.riskWarning = discussion.error;
      return discussion;
    }
      try {
        const { raw, parsed } = await callJsonModel<AiDiscussionDecision>(config, buildDiscussionPrompt(db, agent, match));
        discussion.rawResponse = raw;
        discussion.stance = cleanModelText(parsed.stance || "No clear stance").slice(0, 240);
        discussion.keyPoints = (parsed.keyPoints || []).map(cleanModelText).slice(0, 4);
        discussion.preferredAngles = (parsed.preferredAngles || []).map(cleanModelText).slice(0, 4);
        discussion.riskWarning = cleanModelText(parsed.riskWarning || "").slice(0, 240);
      } catch (error) {
        discussion.error = error instanceof Error ? error.message : "unknown error";
        discussion.stance = "Discussion failed";
        discussion.riskWarning = discussion.error;
      }
      return discussion;
  });

  db.aiContestDiscussions.push(...discussions);
}

async function runChampionPicks(db: Db) {
  const options = db.outrightOdds.slice().sort((a, b) => a.price - b.price);
  if (!options.length) return;

  const agents = db.aiContestAgents
    .filter((agent) => agent.status !== "disabled")
    .filter((agent) => agent.balance >= 500)
    .filter((agent) => !db.aiContestBets.some((bet) => bet.agentId === agent.id && bet.market === "outrights"));

  for (const agent of agents) {
    const preferredTeam = FIXED_CHAMPION_PICKS[agent.id];
    const odd = options.find((item) => teamZh(item.teamName) === teamZh(preferredTeam || ""));
    if (!odd) continue;
    const round: AiContestRound = {
      id: createId(),
      agentId: agent.id,
      trigger: "manual",
      windowHours: 0,
      matchIds: [],
      prompt: `fixed champion pick: ${agent.name} -> ${teamZh(odd.teamName)}`,
      strategyType: agent.strategyType,
      strategy: "世界杯冠军固定500分",
      createdAt: timestamp(),
    };

    const stake = 500;
    const label = teamZh(odd.teamName);
    db.aiContestBets.push({
      id: createId(),
      roundId: round.id,
      agentId: agent.id,
      type: "outright",
      outrightOddsId: odd.id,
      market: "outrights",
      selection: label,
      selectionLabel: `世界杯冠军 - ${label}`,
      price: odd.price,
      stake,
      possiblePayout: Math.round(stake * odd.price),
      confidence: "medium",
      reason: "一次性固定冠军选择",
      status: "pending",
      profit: 0,
      createdAt: timestamp(),
    });
    agent.balance -= stake;
    agent.updatedAt = timestamp();
    agent.error = undefined;
    agent.status = "active";
    db.aiContestRounds.push(round);
    writeDb(db);
  }
}

export function initAiContestAgents() {
  const db = readDb();
  ensureAgents(db);
  writeDb(db);
  return serializeDashboard(db);
}

export async function runAiContestRound(windowHours = 24) {
  const db = readDb();
  const configs = ensureAgents(db);
  const now = Date.now();
  const matches = db.matches
    .filter((match) => {
      if (match.status !== "scheduled") return false;
      const kickoff = new Date(match.commenceTime).getTime();
      return Number.isFinite(kickoff) && kickoff > now && kickoff - now <= windowHours * 60 * 60 * 1000;
    })
    .filter((match) => oddsForMatch(db, match.id).length > 0)
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));

  await runMatchDiscussions(db, configs, matches);
  await runChampionPicks(db);
  writeDb(db);

  const activeAgents = db.aiContestAgents.filter((item) => item.status !== "disabled");
  await mapWithConcurrency(activeAgents, 8, async (agent) => {
    const hasPendingBetsInWindow = db.aiContestBets.some(
      (bet) => bet.agentId === agent.id && bet.status === "pending" && matches.some((match) => match.id === bet.matchId),
    );
    if (hasPendingBetsInWindow) return;
    const config = configs.find((item) => item.id === agent.id);
    if (!config) return;
    const prompt = buildPrompt(db, agent, matches);
    const round: AiContestRound = {
      id: createId(),
      agentId: agent.id,
      trigger: "manual",
      windowHours,
      matchIds: matches.map((match) => match.id),
      prompt,
      createdAt: timestamp(),
    };
    try {
      const { raw, parsed: decision } = await callJsonModel<AiDecision>(config, prompt);
      round.rawResponse = raw;
      round.strategyType = cleanModelText(decision.strategyType) || agent.strategyType;
      round.strategy = cleanModelText(decision.strategyName) || agent.strategy;
      round.bankrollRule = cleanModelText(decision.bankrollRule) || agent.bankrollRule;
      round.strategyChange = cleanModelText(decision.strategyChange);
      round.skipReason = cleanModelText(decision.skipReason);
      agent.strategyType = round.strategyType;
      agent.strategy = round.strategy;
      agent.bankrollRule = round.bankrollRule;
      agent.error = undefined;
      agent.status = "active";
      agent.updatedAt = timestamp();

      const maxRoundStake = Math.floor(agent.balance * 0.25);
      let usedStake = 0;
      for (const candidate of decision.bets || []) {
        const odds = db.oddsSnapshots.find((item) => item.id === candidate.oddsId);
        const match = odds ? db.matches.find((item) => item.id === odds.matchId) : null;
        if (!odds || !match || !matches.some((item) => item.id === match.id)) continue;
        const stake = Math.max(20, Math.min(600, Math.round(Number(candidate.stake) || 0)));
        if (stake <= 0 || usedStake + stake > maxRoundStake || stake > agent.balance) continue;
        const bet: AiContestBet = {
          id: createId(),
          roundId: round.id,
          agentId: agent.id,
          matchId: match.id,
          oddsSnapshotId: odds.id,
          market: odds.market,
          selection: odds.selection,
          selectionLabel: `${matchLabel(match)} - ${odds.label}`,
          line: odds.line,
          price: odds.price,
          stake,
          possiblePayout: Math.round(stake * odds.price),
          confidence: candidate.confidence || "medium",
          reason: cleanModelText(candidate.reason || "").slice(0, 500),
          status: "pending",
          profit: 0,
          createdAt: timestamp(),
        };
        agent.balance -= stake;
        usedStake += stake;
        db.aiContestBets.push(bet);
      }
    } catch (error) {
      round.error = error instanceof Error ? error.message : "unknown error";
      agent.status = "error";
      agent.error = round.error;
      agent.updatedAt = timestamp();
    }
    db.aiContestRounds.push(round);
    writeDb(db);
  });

  writeDb(db);
  return serializeDashboard(db);
}

export function settleAiContestBets(db: Db, match: Match) {
  const settled = [];
  for (const bet of db.aiContestBets.filter((item) => item.matchId === match.id && item.status === "pending")) {
    if (!bet.matchId || !bet.oddsSnapshotId) continue;
    const result = settleBet(
      {
        ...bet,
        orderNo: bet.id,
        userId: bet.agentId,
        type: "match",
      },
      match,
    );
    bet.status = result.status;
    bet.profit = result.profit;
    bet.settledAt = timestamp();
    const agent = db.aiContestAgents.find((item) => item.id === bet.agentId);
    if (agent && result.payout > 0) {
      agent.balance += result.payout;
      agent.updatedAt = timestamp();
    }
    settled.push({ agentId: bet.agentId, selection: bet.selectionLabel, status: bet.status, profit: bet.profit });
  }
  return settled;
}

export function settleAiContestOutrights(db: Db, champion: string) {
  const settled = [];
  const settledAt = timestamp();
  for (const bet of db.aiContestBets.filter((item) => item.market === "outrights" && item.status === "pending")) {
    const won = bet.selection === champion;
    const payout = won ? bet.possiblePayout : 0;
    bet.status = won ? "won" : "lost";
    bet.profit = payout - bet.stake;
    bet.settledAt = settledAt;
    const agent = db.aiContestAgents.find((item) => item.id === bet.agentId);
    if (agent && payout > 0) {
      agent.balance += payout;
      agent.updatedAt = settledAt;
    }
    settled.push({ agentId: bet.agentId, selection: bet.selectionLabel, status: bet.status, profit: bet.profit });
  }
  return settled;
}

function serializeDashboard(db: Db) {
  const agents = db.aiContestAgents
    .map((agent) => {
      const bets = db.aiContestBets.filter((bet) => bet.agentId === agent.id);
      const settled = bets.filter((bet) => bet.status !== "pending");
      return {
        ...agent,
        totalBets: bets.length,
        pendingBets: bets.filter((bet) => bet.status === "pending").length,
        profit: agent.balance - INITIAL_BALANCE + bets.filter((bet) => bet.status === "pending").reduce((sum, bet) => sum + bet.stake, 0),
        settledProfit: settled.reduce((sum, bet) => sum + bet.profit, 0),
      };
    })
    .sort((a, b) => b.profit - a.profit || b.balance - a.balance);

  const bets = db.aiContestBets
    .map((bet) => ({
      ...bet,
      agentName: db.aiContestAgents.find((agent) => agent.id === bet.agentId)?.name || bet.agentId,
      matchTitle: bet.market === "outrights"
        ? "世界杯冠军"
        : db.matches.find((match) => match.id === bet.matchId)
          ? matchLabel(db.matches.find((match) => match.id === bet.matchId)!)
          : bet.matchId || "-",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rounds = db.aiContestRounds
    .map((round) => ({
      ...round,
      agentName: db.aiContestAgents.find((agent) => agent.id === round.agentId)?.name || round.agentId,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const discussions = db.aiContestDiscussions
    .map((discussion) => ({
      ...discussion,
      agentName: db.aiContestAgents.find((agent) => agent.id === discussion.agentId)?.name || discussion.agentId,
      matchTitle: db.matches.find((match) => match.id === discussion.matchId)
        ? matchLabel(db.matches.find((match) => match.id === discussion.matchId)!)
        : discussion.matchId,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const matchCards = db.matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime))
    .slice(0, 12)
    .map((match) => ({
      id: match.id,
      title: matchLabel(match),
      commenceTime: match.commenceTime,
      status: match.status,
      discussions: discussions.filter((item) => item.matchId === match.id).slice(0, 8),
      bets: bets.filter((bet) => bet.matchId === match.id && bet.status === "pending"),
    }));

  return {
    configuredModels: aiContestModelConfigs().map(({ apiKeyEnv, ...item }) => ({
      ...item,
      apiKeyEnv,
      hasKey: Boolean(process.env[apiKeyEnv]),
    })),
    agents,
    bets,
    rounds,
    discussions,
    matchCards,
  };
}
