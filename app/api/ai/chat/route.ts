import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { readDb, type Match } from "@/lib/store";
import { teamZh } from "@/lib/teams";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1200),
      }),
    )
    .min(1)
    .max(12),
});

const TEAM_STYLE: Record<string, string> = {
  "Korea Republic":
    "韩国节奏快、转换积极，依赖边路冲刺和前场压迫。正面 buff 是跑动、反击、边路速度；负面 buff 是阵地战破密防效率不稳定，身体对抗和定位球防守容易吃亏。",
  Czechia:
    "捷克身体对抗和定位球能力突出，比赛节奏偏务实。正面 buff 是中低位防守、空中球、定位球；负面 buff 是横移速度和被速度型边路持续冲击。",
  Canada:
    "加拿大速度和纵深冲击强，边路推进直接。正面 buff 是转换和反击；负面 buff 是控球耐心、防线身后空间和阵地防守稳定性。",
  "Bosnia and Herzegovina":
    "波黑中前场有技术和创造力，但整体移动和防守稳定性波动。正面 buff 是慢节奏控球和个人创造；负面 buff 是怕高强度逼抢和快速转换。",
  Mexico:
    "墨西哥技术细腻，控球和边路配合多，北美环境适应好。正面 buff 是控球组织和主场环境；负面 buff 是终结效率起伏。",
  "South Africa":
    "南非依赖速度和身体活力，反击有威胁。正面 buff 是冲击力；负面 buff 是阵地防守连续性和大赛经验。",
  Brazil:
    "巴西个人能力和进攻创造力强，边路一对一和前场变化多。正面 buff 是天赋和创造力；负面 buff 是转换防守和热门压力。",
  Morocco:
    "摩洛哥防守纪律强，反击和边路推进质量高。正面 buff 是韧性、防守结构；负面 buff 是主动压上时进攻效率不总稳定。",
  Germany:
    "德国强调压迫、传控推进和禁区前沿压制。正面 buff 是体系、定位球、阵地压制；负面 buff 是高位身后空间。",
  Japan:
    "日本传切速度快、整体纪律强，擅长中前场围抢。正面 buff 是整体性、技术、压迫；负面 buff 是身体对抗和定位球防守。",
  USA:
    "美国运动能力强、节奏直接，适合高强度对抗。正面 buff 是体能、速度、对抗；负面 buff 是阵地进攻创造力和临场稳定性。",
  Switzerland:
    "瑞士整体结构稳，攻守平衡，比赛管理能力较好。正面 buff 是稳定性和防守秩序；负面 buff 是面对极快节奏时创造力不足。",
  Qatar:
    "卡塔尔依赖整体配合和熟悉体系。正面 buff 是配合默契；负面 buff 是对抗强度和面对高压时出球质量。",
};

function marketName(market: string) {
  if (market === "h2h") return "独赢";
  if (market === "spreads") return "让球";
  if (market === "totals") return "大小";
  if (market === "correct_score") return "波胆";
  return market;
}

function implied(price: number) {
  return `${(100 / price).toFixed(1)}%`;
}

function questionMatchScore(question: string, homeTeam: string, awayTeam: string) {
  const text = question.toLowerCase();
  const terms = [homeTeam, awayTeam, teamZh(homeTeam), teamZh(awayTeam)].map((item) =>
    item.toLowerCase(),
  );
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function bestQuestionMatch(question: string) {
  const db = readDb();
  return db.matches
    .map((match) => ({
      match,
      score: questionMatchScore(question, match.homeTeam, match.awayTeam),
    }))
    .sort((a, b) => b.score - a.score || a.match.commenceTime.localeCompare(b.match.commenceTime))[0]?.match;
}

function teamFixtures(team: string) {
  const db = readDb();
  return db.matches
    .filter((match) => match.homeTeam === team || match.awayTeam === team)
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));
}

function fixtureRound(match: Match) {
  const homeIndex = teamFixtures(match.homeTeam).findIndex((item) => item.id === match.id);
  const awayIndex = teamFixtures(match.awayTeam).findIndex((item) => item.id === match.id);
  if (homeIndex >= 0 && homeIndex === awayIndex) return `小组赛第 ${homeIndex + 1} 轮（按本地赛程推断）`;
  if (homeIndex >= 0 || awayIndex >= 0) {
    return `小组赛轮次可能不一致：${teamZh(match.homeTeam)}第 ${homeIndex + 1} 场，${teamZh(match.awayTeam)}第 ${awayIndex + 1} 场（按本地赛程推断）`;
  }
  return "小组赛轮次暂无可靠推断";
}

function teamRecord(team: string) {
  const finished = teamFixtures(team).filter(
    (match) =>
      match.status === "finished" &&
      match.homeScore !== undefined &&
      match.awayScore !== undefined,
  );

  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const match of finished) {
    const isHome = match.homeTeam === team;
    const forGoals = isHome ? Number(match.homeScore) : Number(match.awayScore);
    const againstGoals = isHome ? Number(match.awayScore) : Number(match.homeScore);
    goalsFor += forGoals;
    goalsAgainst += againstGoals;
    if (forGoals > againstGoals) points += 3;
    else if (forGoals === againstGoals) points += 1;
  }

  if (!finished.length) return "暂无已完赛小组数据，赛前积分形势不能确认";
  return `${finished.length}场，${points}分，进${goalsFor}失${goalsAgainst}`;
}

function formatOdds(matchId: string) {
  const db = readDb();
  return db.oddsSnapshots
    .filter((odd) => odd.matchId === matchId && ["h2h", "spreads", "totals", "correct_score"].includes(odd.market))
    .sort((a, b) => {
      const marketOrder = ["h2h", "spreads", "totals", "correct_score"];
      return (
        marketOrder.indexOf(a.market) - marketOrder.indexOf(b.market) ||
        a.selection.localeCompare(b.selection)
      );
    })
    .slice(0, 28)
    .map((odd) => {
      const prob = odd.price ? `，隐含${implied(odd.price)}` : "";
      return `${marketName(odd.market)} ${odd.label} @ ${odd.price}${prob}`;
    })
    .join("; ");
}

function relatedSchedule(homeTeam: string, awayTeam: string) {
  return [homeTeam, awayTeam]
    .map((team) => {
      const fixtures = teamFixtures(team)
        .slice(0, 4)
        .map((match, index) => {
          const score =
            match.homeScore !== undefined && match.awayScore !== undefined
              ? `，比分 ${match.homeScore}-${match.awayScore}`
              : "";
          return `第${index + 1}场 ${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)}，${match.commenceTime}${score}`;
        })
        .join(" | ");
      return `${teamZh(team)}赛程：${fixtures}`;
    })
    .join("\n");
}

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckUrl(value: string) {
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  try {
    const url = new URL(normalized.replace(/&amp;/g, "&"));
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : normalized;
  } catch {
    return normalized;
  }
}

async function searchDuckDuckGo(query: string) {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!response.ok) return [];

  const html = await response.text();
  return [
    ...html.matchAll(
      /<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/g,
    ),
  ]
    .slice(0, 5)
    .map((match) => ({
      title: decodeHtml(match[2]),
      url: decodeDuckUrl(match[1]),
      snippet: decodeHtml(match[3]),
    }))
    .filter((item) => item.title && item.url);
}

async function collectWebIntel(question: string) {
  const match = bestQuestionMatch(question);
  if (!match || questionMatchScore(question, match.homeTeam, match.awayTeam) === 0) {
    return "外网情报：未能识别具体比赛，未执行定向搜索。";
  }

  const home = match.homeTeam;
  const away = match.awayTeam;
  const queries = [
    `${home} ${away} World Cup 2026 preview team news injuries`,
    `${home} World Cup 2026 squad key players predicted lineup injuries`,
    `${away} World Cup 2026 squad key players predicted lineup injuries`,
    `${home} ${away} World Cup 2026 group standings round fixture`,
    `site:fifa.com ${home} World Cup 2026 team news squad`,
    `site:fifa.com ${away} World Cup 2026 team news squad`,
  ];

  const results = (await Promise.all(queries.map((query) => searchDuckDuckGo(query)))).flat();
  const seen = new Set<string>();
  const unique = results.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  if (!unique.length) {
    return `外网情报：已尝试搜索 ${teamZh(home)} vs ${teamZh(away)} 的阵容、伤停、核心球员、小组赛背景，但没有抓到稳定摘要。`;
  }

  return [
    `外网情报：针对 ${teamZh(home)} vs ${teamZh(away)} 已搜索阵容、核心球员、伤停、预计首发、小组赛背景。以下是搜索摘要，不等同官方确认：`,
    ...unique.slice(0, 10).map((item, index) => `${index + 1}. ${item.title} | ${item.snippet} | ${item.url}`),
  ].join("\n");
}

async function buildContext(userId: string, question: string) {
  const db = readDb();
  const webIntel = await collectWebIntel(question);
  const matches = db.matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => {
      const scoreDiff =
        questionMatchScore(question, b.homeTeam, b.awayTeam) -
        questionMatchScore(question, a.homeTeam, a.awayTeam);
      return scoreDiff || a.commenceTime.localeCompare(b.commenceTime);
    })
    .slice(0, 5)
    .map((match) => {
      const homeStyle = TEAM_STYLE[match.homeTeam] || "暂无稳定球风画像，不能编造具体打法。";
      const awayStyle = TEAM_STYLE[match.awayTeam] || "暂无稳定球风画像，不能编造具体打法。";
      return [
        `比赛：${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)}，开赛 ${match.commenceTime}`,
        `比赛背景：${fixtureRound(match)}。${teamZh(match.homeTeam)}记录：${teamRecord(match.homeTeam)}；${teamZh(match.awayTeam)}记录：${teamRecord(match.awayTeam)}`,
        `双方赛程：${relatedSchedule(match.homeTeam, match.awayTeam)}`,
        `球风画像：${teamZh(match.homeTeam)} - ${homeStyle} ${teamZh(match.awayTeam)} - ${awayStyle}`,
        `赔率基准：${formatOdds(match.id) || "暂无"}`,
      ].join("\n");
    });

  const allUserBets = db.bets
    .filter((bet) => bet.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const user = db.users.find((item) => item.id === userId);
  const settledBets = allUserBets.filter((bet) => bet.status !== "pending");
  const pendingBets = allUserBets.filter((bet) => bet.status === "pending");
  const totalStake = allUserBets.reduce((sum, bet) => sum + bet.stake, 0);
  const settledProfit = settledBets.reduce((sum, bet) => sum + bet.profit, 0);
  const averageStake = allUserBets.length ? Math.round(totalStake / allUserBets.length) : 0;
  const marketCounts = allUserBets.reduce<Record<string, number>>((acc, bet) => {
    acc[bet.market] = (acc[bet.market] || 0) + 1;
    return acc;
  }, {});
  const marketSummary = Object.entries(marketCounts)
    .map(([market, count]) => `${marketName(market)} ${count}单`)
    .join("，");

  const userBets = allUserBets
    .slice(0, 8)
    .map((bet) => `${bet.selectionLabel}，${bet.stake}分，赔率${bet.price}，状态${bet.status}`);

  return [
    "当前系统数据，不得编造系统没有的数据：",
    "伤停/首发：系统未接入结构化伤停和首发 API；可以参考外网搜索摘要，但必须标注“外网摘要显示/需要临场确认”。",
    "历史交锋/xG：暂未接入结构化 H2H/xG API；只能基于已给赔率、赛程、已完赛比分、外网摘要和通用球风画像分析。",
    webIntel,
    ...matches.map((line) => `\n${line}`),
    "\n玩家画像：",
    `玩家：${user?.displayName || "未知"}，余额 ${user?.balance ?? "未知"} 分；总投注 ${allUserBets.length} 单，待结算 ${pendingBets.length} 单，已结算盈亏 ${settledProfit} 分，平均下注 ${averageStake} 分；玩法分布：${marketSummary || "暂无"}。`,
    userBets.length ? "用户最近投注：" : "",
    ...userBets.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function systemPrompt(context: string) {
  return `你是一个中文世界杯竞猜助手，主要帮助用户做赛事分析、赔率理解、波胆思路、玩家投注记录复盘、风险管理，也可以正常回答用户上下文里的非足球闲聊。

你不是赔率复读机。你的任务是先做情报归纳，再做推理，最后给一个清晰方向。

硬规则：
1. 不承诺稳赚，不说必胜，不鼓励追损或加注。
2. 不允许前后矛盾。分析赛事时只能给一个主结论，最多一个备选思路。
3. 赔率不是结论来源，只是市场基准。不要把“隐含概率高”当成推荐理由。
4. 分析赛事时必须先列双方正面 buff / 负面 debuff，再综合判断方向。
5. 分析赛事时必须使用比赛背景：小组赛第几轮、双方赛程、已赛积分；没有数据就明确说暂无。
6. 分析赛事时必须使用外网情报摘要。若摘要非官方或不完整，要说“外网摘要显示/仍需临场确认”。
7. 没有结构化伤停、首发、真实积分时，不能编造；只能说需要临场确认。
8. 分析玩家投注记录时，必须基于提供的玩家画像、历史投注、盈亏和玩法分布，指出倾向、风险和改进建议。
9. 本系统只做单关，不讨论串关。
10. 回答要短、直接、中文。

赛事分析固定输出结构：
【结论】
一句话：主方向 + 信心等级（低/中/高）+ 明确不建议的方向。

【比赛背景】
说明这是第几轮、双方赛程/积分处境。若数据不足，直接说不足。

【正负 buff】
- 主队正面：
- 主队负面：
- 客队正面：
- 客队负面：

【核心情报】
总结外网摘要里关于核心球员、预计首发、伤停、阵容完整性的可用信息；必须标注可靠性。

【推理】
先从球风克制、比赛动机、阵容情报推方向；最后才用赔率说明市场是否已经充分定价。不要只算概率。

【可选玩法】
只给 1 个主选项；波胆最多 2 个且必须和主方向一致。

【风险】
列 1-2 条最关键风险。

玩家投注复盘固定输出结构：
【玩家画像】
总结余额、盈亏、投注频率、平均下注、偏好玩法。

【问题】
指出 1-3 个最明显的问题，比如重注、追热门、波胆过多、赔率过高、单场暴露过大。

【建议】
给具体、可执行的积分管理建议。

${context}`;
}

function llmModels() {
  const models = [
    process.env.LLM_MODEL || "gpt-5.4-mini",
    ...(process.env.LLM_FALLBACK_MODELS || "gpt-5.3-chat,gemini-3.1-pro-preview")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  return [...new Set(models)];
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "消息格式不正确" }, { status: 400 });

  const latest = parsed.data.messages.at(-1)?.content || "";
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  if (!apiKey) {
    return NextResponse.json({
      answer: "AI 通道还没配置 LLM_API_KEY。路径已经准备好了，填入模型 key 后我就能开始分析。",
    });
  }

  const context = await buildContext(user.id, latest);
  const conversation = parsed.data.messages.slice(-10);
  const messages = [
    { role: "system", content: systemPrompt(context) },
    ...conversation.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  const errors: string[] = [];

  for (const model of llmModels()) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, temperature: 0.2, messages }),
      });

      if (!response.ok) {
        const detail = await response.text();
        errors.push(`${model}: ${response.status} ${detail.slice(0, 160)}`);
        if (![408, 429, 500, 502, 503, 504].includes(response.status)) break;
        continue;
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content;
      if (answer) return NextResponse.json({ answer });
      errors.push(`${model}: empty content`);
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return NextResponse.json(
    { error: `AI 服务调用失败：${errors.join(" / ").slice(0, 360)}` },
    { status: 502 },
  );
}
