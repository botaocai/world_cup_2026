import { createId, readDb, timestamp, writeDb, type Match, type MatchIntelligence } from "@/lib/store";
import { teamZh } from "@/lib/teams";

const TRIGGER_WINDOW_HOURS = Number(process.env.AI_INTEL_TRIGGER_HOURS || 12);
const MAX_SEARCH_RESULTS = 10;
const MAX_PAGES_TO_READ = 6;

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  content?: string;
};

type TeamProgress = {
  text: string;
  points: number;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
};

function marketName(market: string) {
  if (market === "h2h") return "独赢";
  if (market === "spreads") return "让球";
  if (market === "totals") return "大小";
  if (market === "correct_score") return "波胆";
  return market;
}

function decodeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
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

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
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

async function fetchPageText(url: string) {
  if (!/^https?:\/\//.test(url) || /\.pdf($|\?)/i.test(url)) return "";
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) return "";
    const html = await response.text();
    return decodeHtml(html).slice(0, 2400);
  } catch {
    return "";
  }
}

async function collectWebIntel(match: Match) {
  const home = match.homeTeam;
  const away = match.awayTeam;
  const queries = [
    `${home} ${away} World Cup 2026 preview team news injuries predicted lineup`,
    `${home} ${away} World Cup 2026 group standings table scenario motivation`,
    `${home} ${away} World Cup 2026 match centre FIFA venue referee`,
    `${home} World Cup 2026 squad key players injuries lineup`,
    `${away} World Cup 2026 squad key players injuries lineup`,
    `${home} ${away} tactical preview betting odds World Cup 2026`,
  ];

  const results = (await Promise.all(queries.map((query) => searchDuckDuckGo(query)))).flat();
  const seen = new Set<string>();
  const unique = results
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, MAX_SEARCH_RESULTS);

  const contents = await Promise.all(unique.slice(0, MAX_PAGES_TO_READ).map((item) => fetchPageText(item.url)));
  return unique.map((item, index) => ({
    ...item,
    content: contents[index] || "",
  }));
}

function teamFixtures(team: string, matches: Match[]) {
  return matches
    .filter((match) => match.homeTeam === team || match.awayTeam === team)
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));
}

function fixtureRound(match: Match, matches: Match[]) {
  const homeIndex = teamFixtures(match.homeTeam, matches).findIndex((item) => item.id === match.id);
  const awayIndex = teamFixtures(match.awayTeam, matches).findIndex((item) => item.id === match.id);
  if (homeIndex >= 0 && homeIndex === awayIndex) return { text: `小组赛第 ${homeIndex + 1} 轮`, round: homeIndex + 1 };
  return {
    text: `本地赛程推断：${teamZh(match.homeTeam)}第 ${homeIndex + 1} 场，${teamZh(match.awayTeam)}第 ${awayIndex + 1} 场`,
    round: Math.max(homeIndex, awayIndex) + 1,
  };
}

function teamProgressBefore(team: string, currentMatch: Match, matches: Match[]): TeamProgress {
  const currentTime = new Date(currentMatch.commenceTime).getTime();
  const finished = teamFixtures(team, matches).filter((match) => {
    const matchTime = new Date(match.commenceTime).getTime();
    return (
      matchTime < currentTime &&
      match.status === "finished" &&
      match.homeScore !== undefined &&
      match.awayScore !== undefined
    );
  });

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

  if (!finished.length) {
    return {
      text: `${teamZh(team)}赛前0场0分，首轮或本地暂无此前已完赛记录`,
      points: 0,
      played: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    };
  }

  return {
    text: `${teamZh(team)}赛前${finished.length}场${points}分，进${goalsFor}失${goalsAgainst}，净胜球${goalsFor - goalsAgainst}`,
    points,
    played: finished.length,
    goalsFor,
    goalsAgainst,
  };
}

function futureFixtures(team: string, currentMatch: Match, matches: Match[]) {
  const currentTime = new Date(currentMatch.commenceTime).getTime();
  return teamFixtures(team, matches)
    .filter((match) => new Date(match.commenceTime).getTime() > currentTime)
    .slice(0, 2)
    .map((match) => `${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)}`)
    .join("；");
}

function tournamentContext(match: Match) {
  const db = readDb();
  const round = fixtureRound(match, db.matches);
  const homeProgress = teamProgressBefore(match.homeTeam, match, db.matches);
  const awayProgress = teamProgressBefore(match.awayTeam, match, db.matches);
  const homeNext = futureFixtures(match.homeTeam, match, db.matches);
  const awayNext = futureFixtures(match.awayTeam, match, db.matches);
  const genericGroup = !match.groupName || /世界杯2026|world cup/i.test(match.groupName);

  const incentive =
    round.round === 1
      ? "首轮战意：双方默认0分起步，强队要抢开门红和净胜球，弱队通常先保平衡，平局对弱队价值更高。"
      : "非首轮战意：必须结合已有积分、净胜球和后续对手判断是否需要主动抢胜。";

  return [
    `阶段：${match.stage || "group"}，${round.text}。`,
    genericGroup ? "本地赛程暂未标出具体小组字母，外网情报需优先补充小组与积分榜。" : `本地小组：${match.groupName}。`,
    homeProgress.text,
    awayProgress.text,
    homeNext ? `${teamZh(match.homeTeam)}后续赛程：${homeNext}` : `${teamZh(match.homeTeam)}后续赛程：本地暂无。`,
    awayNext ? `${teamZh(match.awayTeam)}后续赛程：${awayNext}` : `${teamZh(match.awayTeam)}后续赛程：本地暂无。`,
    incentive,
    "注意：home/away 只是接口队伍顺序，不代表真正主客场。",
  ].join("\n");
}

function formatOdds(matchId: string) {
  const db = readDb();
  return db.oddsSnapshots
    .filter((odd) => odd.matchId === matchId && ["h2h", "spreads", "totals"].includes(odd.market))
    .sort((a, b) => {
      const marketOrder = ["spreads", "totals", "h2h"];
      return marketOrder.indexOf(a.market) - marketOrder.indexOf(b.market);
    })
    .slice(0, 16)
    .map((odd) => `${marketName(odd.market)} ${odd.label} @ ${odd.price}`)
    .join("; ");
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

async function callLlm(messages: Array<{ role: "system" | "user"; content: string }>, temperature = 0.2) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("missing LLM_API_KEY");

  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const errors: string[] = [];

  for (const model of llmModels()) {
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, temperature, messages }),
      });

      if (!response.ok) {
        const detail = await response.text();
        errors.push(`${model}: ${response.status} ${detail.slice(0, 180)}`);
        if (![408, 429, 500, 502, 503, 504].includes(response.status)) break;
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        errors.push(`${model}: empty content`);
        continue;
      }
      return { content: String(content), model };
    } catch (error) {
      errors.push(`${model}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  throw new Error(`LLM failed after fallback: ${errors.join(" | ").slice(0, 500)}`);
}

async function buildResearchBrief(match: Match, sources: SearchResult[]) {
  const home = teamZh(match.homeTeam);
  const away = teamZh(match.awayTeam);
  const sourceText = sources.length
    ? sources
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}\nURL: ${item.url}\n摘要: ${item.snippet}\n正文片段: ${(item.content || "").slice(0, 1600)}`,
        )
        .join("\n\n")
    : "没有抓到可用外网来源。";

  const { content } = await callLlm(
    [
      {
        role: "system",
        content:
          "你是足球情报整理 agent。任务是先收集事实，不做投注结论。必须区分 confirmed / likely / unknown，不允许编造。",
      },
      {
        role: "user",
        content: `请整理 ${home} vs ${away} 的赛前情报简报。重点找：小组赛第几轮、小组/积分形势、双方战意、预计阵容和核心球员、伤停、近期基本面、场地天气裁判。没有来源支持的项目写 unknown，不要写成长篇免责声明。

本地赛程和积分上下文：
${tournamentContext(match)}

外网来源：
${sourceText}

输出格式：
【小组/积分/战意】
【阵容与伤停】
【球风与关键球员】
【场地/天气/裁判】
【可信度】
每部分 2-4 条，句子短，必须标注 confirmed / likely / unknown。`,
      },
    ],
    0.1,
  );
  return content;
}

function buildAnalysisPrompt(match: Match, sources: SearchResult[], researchBrief: string) {
  const home = teamZh(match.homeTeam);
  const away = teamZh(match.awayTeam);
  const sourceList = sources
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item.title} | ${item.url}`)
    .join("\n");

  return `请为 ${home} vs ${away} 生成手机端 AI 情报卡。你必须基于“研究简报”分析，不能再写“本系统暂未接入xxx”这种模板废话；只在确实影响判断时用一句话写“需临场确认”。

硬规则：
1. 不承诺稳赚，不鼓励追损。
2. 赔率只是市场基准，不能用隐含概率直接当结论。
3. 必须重点分析小组赛轮次、积分形势、后续赛程和战意。
4. home/away 只是接口顺序，不代表主客场；没有来源时不能写主场优势。
5. 只给 1 个主方向；波胆最多 2 个，且和主方向一致。
6. 500-750 中文字，短句，适合手机阅读。
7. 具体教练名、确认首发、伤停结论只有在研究简报标为 confirmed 时才能写；否则只能写“预计/媒体推测/需临场确认”。

本地上下文：
${tournamentContext(match)}

当前主要赔率：
${formatOdds(match.id) || "暂无赔率"}

研究简报：
${researchBrief}

参考来源：
${sourceList || "暂无"}

输出固定结构：
【结论】主方向 + 信心等级 + 明确不建议的方向。
【比赛背景】小组赛轮次、积分/战意/后续赛程，直接说明它如何影响节奏。
【正负 buff】双方各写正面和负面，不要泛泛而谈。
【核心情报】只写对判断有用的阵容、核心球员、伤停、场地天气裁判信息；不要把媒体预测写成确认事实。
【推理】先从球风、战意、阵容推方向，最后才说赔率是否充分定价。
【可选玩法】1 个主选项；波胆最多 2 个。
【风险】1-2 条。`;
}

function latestIntelForMatch(items: MatchIntelligence[], matchId: string) {
  return items
    .filter((item) => item.matchId === matchId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
}

export async function generateMatchIntelligence(matchId: string, force = false) {
  const db = readDb();
  const match = db.matches.find((item) => item.id === matchId);
  if (!match) throw new Error("match not found");
  if (match.status !== "scheduled" && !force) return { skipped: true, reason: "match is not scheduled", matchId };

  const existing = latestIntelForMatch(db.matchIntelligence, match.id);
  if (existing?.status === "ready" && !force) {
    return { skipped: true, reason: "already generated", matchId, intelligenceId: existing.id };
  }

  const now = timestamp();
  const sources = await collectWebIntel(match);
  try {
    const researchBrief = await buildResearchBrief(match, sources);
    const { content, model } = await callLlm(
      [
        {
          role: "system",
          content:
            "你是严谨的中文足球赛事情报分析员。先用小组/积分/战意和阵容情报推理，再给清晰方向。不要编造，少写免责声明。",
        },
        { role: "user", content: buildAnalysisPrompt(match, sources, researchBrief) },
      ],
      0.2,
    );
    const item: MatchIntelligence = {
      id: createId(),
      matchId: match.id,
      status: "ready",
      title: `${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)} AI情报`,
      content,
      model,
      generatedAt: now,
      triggerWindowHours: TRIGGER_WINDOW_HOURS,
      sources,
    };
    db.matchIntelligence = db.matchIntelligence.filter((intel) => intel.matchId !== match.id);
    db.matchIntelligence.push(item);
    writeDb(db);
    return { skipped: false, matchId, intelligenceId: item.id, title: item.title };
  } catch (error) {
    const item: MatchIntelligence = {
      id: createId(),
      matchId: match.id,
      status: "failed",
      title: `${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)} AI情报生成失败`,
      content: "",
      model: process.env.LLM_MODEL || "gpt-5.4-mini",
      generatedAt: now,
      triggerWindowHours: TRIGGER_WINDOW_HOURS,
      error: error instanceof Error ? error.message : "unknown error",
      sources,
    };
    db.matchIntelligence = db.matchIntelligence.filter((intel) => intel.matchId !== match.id);
    db.matchIntelligence.push(item);
    writeDb(db);
    return { skipped: false, failed: true, matchId, error: item.error };
  }
}

export async function refreshDueMatchIntelligence(force = false) {
  const db = readDb();
  const now = Date.now();
  const windowMs = TRIGGER_WINDOW_HOURS * 60 * 60 * 1000;
  const dueMatches = db.matches
    .filter((match) => {
      if (match.status !== "scheduled") return false;
      const kickoff = new Date(match.commenceTime).getTime();
      if (!Number.isFinite(kickoff)) return false;
      if (!force && (kickoff <= now || kickoff - now > windowMs)) return false;
      const existing = latestIntelForMatch(db.matchIntelligence, match.id);
      return force || existing?.status !== "ready";
    })
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));

  const results = [];
  for (const match of dueMatches) {
    results.push(await generateMatchIntelligence(match.id, force));
  }

  return {
    triggerWindowHours: TRIGGER_WINDOW_HOURS,
    dueMatches: dueMatches.length,
    generated: results.filter((item) => !item.skipped && !item.failed).length,
    failed: results.filter((item) => item.failed).length,
    results,
  };
}

export async function refreshUpcomingMatchIntelligence(hours = 24) {
  const db = readDb();
  const now = Date.now();
  const windowMs = Math.max(1, hours) * 60 * 60 * 1000;
  const matches = db.matches
    .filter((match) => {
      if (match.status !== "scheduled") return false;
      const kickoff = new Date(match.commenceTime).getTime();
      return Number.isFinite(kickoff) && kickoff > now && kickoff - now <= windowMs;
    })
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));

  const results = [];
  for (const match of matches) {
    results.push(await generateMatchIntelligence(match.id, true));
  }

  return {
    triggerWindowHours: hours,
    dueMatches: matches.length,
    generated: results.filter((item) => !item.skipped && !item.failed).length,
    failed: results.filter((item) => item.failed).length,
    results,
  };
}
