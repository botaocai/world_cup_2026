import { createId, readDb, timestamp, writeDb } from "@/lib/store";
import { formatAsianLine, teamFlag, teamZh } from "@/lib/teams";

const THE_ODDS_SPORT_KEY = process.env.ODDS_SPORT_KEY || "soccer_fifa_world_cup";
const THE_ODDS_BOOKMAKER = process.env.ODDS_BOOKMAKER || "pinnacle";

const ODDS_API_IO_SPORT = process.env.ODDS_API_IO_SPORT || "football";
const ODDS_API_IO_LEAGUE = process.env.ODDS_API_IO_LEAGUE || "international-fifa-world-cup";
const ODDS_API_IO_BOOKMAKERS = (process.env.ODDS_API_IO_BOOKMAKERS || "Bet365,BetMGM")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

type TheOddsOutcome = {
  name: string;
  price: number;
  point?: number;
};

type TheOddsMarket = {
  key: string;
  outcomes: TheOddsOutcome[];
};

type TheOddsBookmaker = {
  key: string;
  title?: string;
  markets: TheOddsMarket[];
};

type TheOddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: TheOddsBookmaker[];
};

type OddsApiIoEvent = {
  id: number;
  date: string;
  home: string;
  away: string;
  status: string;
};

type OddsApiIoMarket = {
  name: string;
  odds: Array<Record<string, string | number>>;
  updatedAt?: string;
};

type OddsApiIoResponse = {
  id: number;
  home: string;
  away: string;
  date: string;
  bookmakers: Record<string, OddsApiIoMarket[]>;
};

type SnapshotInput = {
  market: string;
  selection: string;
  label: string;
  line?: number;
  price: number;
  bookmaker: string;
  sourcePayload?: unknown;
};

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function line(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pruneOldMatchOdds(matchId: string, market: string, db: ReturnType<typeof readDb>) {
  db.oddsSnapshots = db.oddsSnapshots.filter(
    (odd) => !(odd.matchId === matchId && odd.market === market),
  );
}

function upsertMatch(
  db: ReturnType<typeof readDb>,
  event: { id: string; homeTeam: string; awayTeam: string; commenceTime: string },
) {
  let match = db.matches.find((item) => item.oddsEventId === event.id);
  if (!match) {
    match = {
      id: createId(),
      oddsEventId: event.id,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeFlag: teamFlag(event.homeTeam),
      awayFlag: teamFlag(event.awayTeam),
      groupName: "\u4e16\u754c\u676f2026",
      stage: "group",
      commenceTime: event.commenceTime,
      status: "scheduled",
      lastSyncedAt: timestamp(),
    };
    db.matches.push(match);
  } else {
    match.homeTeam = event.homeTeam;
    match.awayTeam = event.awayTeam;
    match.homeFlag = teamFlag(event.homeTeam);
    match.awayFlag = teamFlag(event.awayTeam);
    match.commenceTime = event.commenceTime;
    match.lastSyncedAt = timestamp();
    if (match.status !== "finished" && match.status !== "cancelled") {
      match.status = "scheduled";
    }
  }

  return match;
}

function writeSnapshots(
  db: ReturnType<typeof readDb>,
  matchId: string,
  snapshots: SnapshotInput[],
) {
  const touchedMarkets = new Set(snapshots.map((snapshot) => snapshot.market));
  for (const market of touchedMarkets) pruneOldMatchOdds(matchId, market, db);

  for (const snapshot of snapshots) {
    db.oddsSnapshots.push({
      id: createId(),
      matchId,
      market: snapshot.market,
      selection: snapshot.selection,
      label: snapshot.label,
      line: snapshot.line,
      price: snapshot.price,
      bookmaker: snapshot.bookmaker,
      fetchedAt: timestamp(),
      sourcePayload: snapshot.sourcePayload ? JSON.stringify(snapshot.sourcePayload) : undefined,
    });
  }
}

function sourcePayload(marketName: string, payload: unknown) {
  return { marketName, payload };
}

function selectionForTheOddsOutcome(event: TheOddsEvent, market: string, outcome: TheOddsOutcome) {
  if (market === "h2h") {
    if (outcome.name === event.home_team) return "home";
    if (outcome.name === event.away_team) return "away";
    return "draw";
  }

  if (market === "totals") {
    return outcome.name.toLowerCase().includes("over") ? "over" : "under";
  }

  if (market === "spreads") {
    return outcome.name === event.home_team ? "home" : "away";
  }

  return outcome.name;
}

function labelForTheOddsOutcome(event: TheOddsEvent, market: string, outcome: TheOddsOutcome) {
  if (market === "h2h") {
    if (outcome.name === event.home_team) return teamZh(event.home_team);
    if (outcome.name === event.away_team) return teamZh(event.away_team);
    return "\u5e73";
  }

  if (market === "totals") {
    const prefix = outcome.name.toLowerCase().includes("over") ? "\u5927" : "\u5c0f";
    return `${prefix} ${formatAsianLine(outcome.point).replace(/^\+/, "")}`.trim();
  }

  if (market === "spreads") {
    return `${teamZh(outcome.name)} ${formatAsianLine(outcome.point)}`.trim();
  }

  return teamZh(outcome.name);
}

function pickTheOddsBookmaker(event: TheOddsEvent) {
  return (
    event.bookmakers.find((bookmaker) => bookmaker.key === THE_ODDS_BOOKMAKER) ||
    event.bookmakers[0]
  );
}

async function refreshMatchOddsFromTheOddsApi() {
  if (!process.env.THE_ODDS_API_KEY) {
    return { skipped: true, reason: "missing THE_ODDS_API_KEY" };
  }

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${THE_ODDS_SPORT_KEY}/odds`);
  url.searchParams.set("apiKey", process.env.THE_ODDS_API_KEY);
  url.searchParams.set("bookmakers", THE_ODDS_BOOKMAKER);
  url.searchParams.set("markets", "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "decimal");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`The Odds API failed: ${response.status}`);

  const events = (await response.json()) as TheOddsEvent[];
  const db = readDb();
  const touchedMatchIds = new Set<string>();

  for (const event of events) {
    const match = upsertMatch(db, {
      id: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: event.commence_time,
    });
    touchedMatchIds.add(match.id);

    const bookmaker = pickTheOddsBookmaker(event);
    if (!bookmaker) continue;

    for (const market of bookmaker.markets) {
      const snapshots = market.outcomes.map((outcome) => ({
        market: market.key,
        selection: selectionForTheOddsOutcome(event, market.key, outcome),
        label: labelForTheOddsOutcome(event, market.key, outcome),
        line: outcome.point,
        price: outcome.price,
        bookmaker: bookmaker.key,
        sourcePayload: sourcePayload(market.key, outcome),
      }));
      writeSnapshots(db, match.id, snapshots);
    }
  }

  removeUntouchedMatches(db, touchedMatchIds);
  writeDb(db);
  return { skipped: false, source: "the-odds-api", count: events.length, bookmaker: THE_ODDS_BOOKMAKER };
}

async function fetchOddsApiIo<T>(path: string, params: Record<string, string>) {
  const key = process.env.ODDS_API_IO_KEY;
  if (!key) throw new Error("missing ODDS_API_IO_KEY");

  const url = new URL(`https://api.odds-api.io/v3/${path}`);
  url.searchParams.set("apiKey", key);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Odds-API.io failed: ${response.status} ${body}`);
  }
  return (await response.json()) as T;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function findMarket(markets: OddsApiIoMarket[], names: string[]) {
  return markets.find((market) => names.includes(market.name));
}

function bookmakerEntries(response: OddsApiIoResponse) {
  const entries = Object.entries(response.bookmakers || {}).filter(
    ([name]) => !name.toLowerCase().includes("no latency"),
  );
  return entries.sort(([nameA], [nameB]) => {
    const indexA = ODDS_API_IO_BOOKMAKERS.indexOf(nameA);
    const indexB = ODDS_API_IO_BOOKMAKERS.indexOf(nameB);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });
}

function pickMarkets(response: OddsApiIoResponse) {
  for (const bookmaker of ODDS_API_IO_BOOKMAKERS) {
    const markets = response.bookmakers?.[bookmaker];
    if (markets?.length) return { bookmaker, markets };
  }

  const fallback = bookmakerEntries(response)[0];
  if (!fallback) return undefined;
  return { bookmaker: fallback[0], markets: fallback[1] };
}

function pickMarketSource(response: OddsApiIoResponse, names: string[]) {
  for (const [bookmaker, markets] of bookmakerEntries(response)) {
    const market = findMarket(markets, names);
    if (market?.odds?.length) return { bookmaker, market };
  }
  return undefined;
}

function marketSources(response: OddsApiIoResponse, names: string[]) {
  return bookmakerEntries(response)
    .map(([bookmaker, markets]) => ({ bookmaker, market: findMarket(markets, names) }))
    .filter((item): item is { bookmaker: string; market: OddsApiIoMarket } => Boolean(item.market));
}

function oddsApiIoSnapshots(response: OddsApiIoResponse) {
  const picked = pickMarkets(response);
  if (!picked) return [];

  const snapshots: SnapshotInput[] = [];

  const mlSource = pickMarketSource(response, ["ML", "Match Result", "Match result"]);
  const mlOdds = mlSource?.market.odds[0];
  if (mlOdds) {
    const home = decimal(mlOdds.home);
    const draw = decimal(mlOdds.draw);
    const away = decimal(mlOdds.away);
    if (home) {
      snapshots.push({
        market: "h2h",
        selection: "home",
        label: teamZh(response.home),
        price: home,
        bookmaker: mlSource.bookmaker,
        sourcePayload: sourcePayload(mlSource.market.name, mlOdds),
      });
    }
    if (draw) {
      snapshots.push({
        market: "h2h",
        selection: "draw",
        label: "\u5e73",
        price: draw,
        bookmaker: mlSource.bookmaker,
        sourcePayload: sourcePayload(mlSource.market.name, mlOdds),
      });
    }
    if (away) {
      snapshots.push({
        market: "h2h",
        selection: "away",
        label: teamZh(response.away),
        price: away,
        bookmaker: mlSource.bookmaker,
        sourcePayload: sourcePayload(mlSource.market.name, mlOdds),
      });
    }
  }

  const spreadSource = marketSources(response, ["Spread", "Asian Handicap"])
    .map((source) => ({
      ...source,
      odd: source.market.odds.find((odd) => {
        return line(odd.hdp) !== undefined && decimal(odd.home) && decimal(odd.away);
      }),
    }))
    .find((source) => source.odd);
  const spreadOdds = spreadSource?.odd;
  const spreadLine = line(spreadOdds?.hdp);
  const spreadHome = decimal(spreadOdds?.home);
  const spreadAway = decimal(spreadOdds?.away);
  if (spreadSource && spreadLine !== undefined && spreadHome && spreadAway) {
    snapshots.push(
      {
        market: "spreads",
        selection: "home",
        label: `${teamZh(response.home)} ${formatAsianLine(spreadLine)}`.trim(),
        line: spreadLine,
        price: spreadHome,
        bookmaker: spreadSource.bookmaker,
        sourcePayload: sourcePayload(spreadSource.market.name, spreadOdds),
      },
      {
        market: "spreads",
        selection: "away",
        label: `${teamZh(response.away)} ${formatAsianLine(-spreadLine)}`.trim(),
        line: -spreadLine,
        price: spreadAway,
        bookmaker: spreadSource.bookmaker,
        sourcePayload: sourcePayload(spreadSource.market.name, spreadOdds),
      },
    );
  }

  const mainSpreadLine = spreadLine;
  const altSpreadSource = pickMarketSource(response, ["Alternative Asian Handicap"]);
  if (altSpreadSource && mainSpreadLine !== undefined) {
    const alternatives = altSpreadSource.market.odds
      .map((odd) => ({
        odd,
        hdp: line(odd.hdp),
        home: decimal(odd.home),
        away: decimal(odd.away),
      }))
      .filter((item): item is { odd: Record<string, string | number>; hdp: number; home: number; away: number } => {
        return item.hdp !== undefined && Boolean(item.home) && Boolean(item.away) && item.hdp !== mainSpreadLine;
      })
      .sort((a, b) => Math.abs(a.hdp - mainSpreadLine) - Math.abs(b.hdp - mainSpreadLine));
    const lower = alternatives
      .filter((item) => item.hdp < mainSpreadLine)
      .sort((a, b) => b.hdp - a.hdp)[0];
    const higher = alternatives
      .filter((item) => item.hdp > mainSpreadLine)
      .sort((a, b) => a.hdp - b.hdp)[0];

    for (const item of [lower, higher].filter(Boolean)) {
      snapshots.push(
        {
          market: "spreads",
          selection: "home",
          label: `${teamZh(response.home)} ${formatAsianLine(item.hdp)}`.trim(),
          line: item.hdp,
          price: item.home,
          bookmaker: altSpreadSource.bookmaker,
          sourcePayload: sourcePayload(altSpreadSource.market.name, item.odd),
        },
        {
          market: "spreads",
          selection: "away",
          label: `${teamZh(response.away)} ${formatAsianLine(-item.hdp)}`.trim(),
          line: -item.hdp,
          price: item.away,
          bookmaker: altSpreadSource.bookmaker,
          sourcePayload: sourcePayload(altSpreadSource.market.name, item.odd),
        },
      );
    }
  }

  const totalsSource = marketSources(response, ["Totals", "Goals Over/Under"])
    .map((source) => ({
      ...source,
      odd: source.market.odds
        .map((odd) => ({ odd, hdp: line(odd.hdp) }))
        .filter((item): item is { odd: Record<string, string | number>; hdp: number } => {
          return item.hdp !== undefined && Boolean(decimal(item.odd.over)) && Boolean(decimal(item.odd.under));
        })
        .sort((a, b) => Math.abs(a.hdp - 2.5) - Math.abs(b.hdp - 2.5))[0],
    }))
    .find((source) => source.odd);
  const totalOdds = totalsSource?.odd;
  const over = decimal(totalOdds?.odd.over);
  const under = decimal(totalOdds?.odd.under);
  if (totalsSource && totalOdds && over && under) {
    const totalLabel = formatAsianLine(totalOdds.hdp).replace(/^\+/, "");
    snapshots.push(
      {
        market: "totals",
        selection: "over",
        label: `\u5927 ${totalLabel}`,
        line: totalOdds.hdp,
        price: over,
        bookmaker: totalsSource.bookmaker,
        sourcePayload: sourcePayload(totalsSource.market.name, totalOdds.odd),
      },
      {
        market: "totals",
        selection: "under",
        label: `\u5c0f ${totalLabel}`,
        line: totalOdds.hdp,
        price: under,
        bookmaker: totalsSource.bookmaker,
        sourcePayload: sourcePayload(totalsSource.market.name, totalOdds.odd),
      },
    );
  }

  const mainTotalLine = totalOdds?.hdp;
  const altTotalsSource =
    pickMarketSource(response, ["Alternative Total Goals", "Alternative Goal Line", "Alternative Totals", "Alternative Goals Over/Under"]) ||
    totalsSource;
  if (altTotalsSource && mainTotalLine !== undefined) {
    const alternatives = altTotalsSource.market.odds
      .map((odd) => ({
        odd,
        hdp: line(odd.hdp),
        over: decimal(odd.over),
        under: decimal(odd.under),
      }))
      .filter((item): item is { odd: Record<string, string | number>; hdp: number; over: number; under: number } => {
        return item.hdp !== undefined && Boolean(item.over) && Boolean(item.under) && item.hdp !== mainTotalLine;
      });
    const lower = alternatives
      .filter((item) => item.hdp < mainTotalLine)
      .sort((a, b) => b.hdp - a.hdp)[0];
    const higher = alternatives
      .filter((item) => item.hdp > mainTotalLine)
      .sort((a, b) => a.hdp - b.hdp)[0];

    for (const item of [lower, higher].filter(Boolean)) {
      const totalLabel = formatAsianLine(item.hdp).replace(/^\+/, "");
      snapshots.push(
        {
          market: "totals",
          selection: "over",
          label: `\u5927 ${totalLabel}`,
          line: item.hdp,
          price: item.over,
          bookmaker: altTotalsSource.bookmaker,
          sourcePayload: sourcePayload(altTotalsSource.market.name, item.odd),
        },
        {
          market: "totals",
          selection: "under",
          label: `\u5c0f ${totalLabel}`,
          line: item.hdp,
          price: item.under,
          bookmaker: altTotalsSource.bookmaker,
          sourcePayload: sourcePayload(altTotalsSource.market.name, item.odd),
        },
      );
    }
  }

  const correctScoreSource = pickMarketSource(response, ["Correct Score"]);
  if (correctScoreSource) {
  for (const outcome of correctScoreSource.market.odds) {
    const price = decimal(outcome.odds);
    const label = String(outcome.label || "");
    if (!price || !/^\d+-\d+$/.test(label)) continue;
    snapshots.push({
      market: "correct_score",
      selection: label,
      label,
      price,
      bookmaker: correctScoreSource.bookmaker,
      sourcePayload: sourcePayload(correctScoreSource.market.name, outcome),
    });
  }
  }

  return snapshots;
}

async function refreshMatchOddsFromOddsApiIo() {
  if (!process.env.ODDS_API_IO_KEY) {
    return { skipped: true, reason: "missing ODDS_API_IO_KEY" };
  }

  const events = await fetchOddsApiIo<OddsApiIoEvent[]>("events", {
    sport: ODDS_API_IO_SPORT,
    league: ODDS_API_IO_LEAGUE,
    limit: "200",
  });
  const db = readDb();
  const touchedMatchIds = new Set<string>();
  const pendingEvents = events.filter((item) => item.status === "pending");
  if (pendingEvents.length === 0) {
    return {
      skipped: true,
      reason: `Odds-API.io returned 0 pending events for ${ODDS_API_IO_LEAGUE}`,
      source: "odds-api-io",
      count: 0,
    };
  }
  const eventById = new Map(pendingEvents.map((event) => [String(event.id), event]));

  for (const batch of chunk(pendingEvents, 10)) {
    const responses = await fetchOddsApiIo<OddsApiIoResponse[]>("odds/multi", {
      eventIds: batch.map((event) => event.id).join(","),
      bookmakers: ODDS_API_IO_BOOKMAKERS.join(","),
    });

    for (const response of responses) {
      const event = eventById.get(String(response.id));
      if (!event) continue;
      const match = upsertMatch(db, {
        id: String(event.id),
        homeTeam: event.home,
        awayTeam: event.away,
        commenceTime: event.date,
      });
      touchedMatchIds.add(match.id);

      const snapshots = oddsApiIoSnapshots(response);
      writeSnapshots(db, match.id, snapshots);
    }
  }

  if (touchedMatchIds.size === 0) {
    return {
      skipped: true,
      reason: `Odds-API.io returned odds for 0 events for ${ODDS_API_IO_LEAGUE}`,
      source: "odds-api-io",
      count: 0,
    };
  }

  removeUntouchedMatches(db, touchedMatchIds);
  writeDb(db);
  return {
    skipped: false,
    source: "odds-api-io",
    count: touchedMatchIds.size,
    bookmaker: ODDS_API_IO_BOOKMAKERS.join(","),
  };
}

function removeUntouchedMatches(db: ReturnType<typeof readDb>, touchedMatchIds: Set<string>) {
  db.matches = db.matches.filter((match) => !match.oddsEventId || touchedMatchIds.has(match.id));
  const activeMatchIds = new Set(db.matches.map((match) => match.id));
  db.oddsSnapshots = db.oddsSnapshots.filter((odd) => activeMatchIds.has(odd.matchId));
}

export async function refreshMatchOdds() {
  if (process.env.ODDS_API_IO_KEY) {
    try {
      const result = await refreshMatchOddsFromOddsApiIo();
      if (!result.skipped && (result.count || 0) > 0) return result;
      const fallback = await refreshMatchOddsFromTheOddsApi();
      return { ...fallback, fallbackFrom: result };
    } catch (error) {
      const fallback = await refreshMatchOddsFromTheOddsApi();
      return {
        ...fallback,
        fallbackFrom: {
          source: "odds-api-io",
          reason: error instanceof Error ? error.message : "Odds-API.io failed",
        },
      };
    }
  }
  return refreshMatchOddsFromTheOddsApi();
}

export async function refreshOutrightOdds() {
  if (!process.env.THE_ODDS_API_KEY) {
    return { skipped: true, reason: "missing THE_ODDS_API_KEY" };
  }

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${THE_ODDS_SPORT_KEY}/odds`);
  url.searchParams.set("apiKey", process.env.THE_ODDS_API_KEY);
  url.searchParams.set("bookmakers", THE_ODDS_BOOKMAKER);
  url.searchParams.set("markets", "outrights");
  url.searchParams.set("oddsFormat", "decimal");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`The Odds API outrights failed: ${response.status}`);

  const events = (await response.json()) as Array<{ bookmakers: TheOddsBookmaker[] }>;
  const db = readDb();
  db.outrightOdds = [];

  for (const event of events) {
    const bookmaker =
      event.bookmakers.find((item) => item.key === THE_ODDS_BOOKMAKER) || event.bookmakers[0];
    if (!bookmaker) continue;

    for (const market of bookmaker.markets) {
      for (const outcome of market.outcomes) {
        db.outrightOdds.push({
          id: createId(),
          teamName: teamZh(outcome.name),
          flag: teamFlag(outcome.name),
          price: outcome.price,
          bookmaker: bookmaker.key,
          fetchedAt: timestamp(),
          sourcePayload: JSON.stringify(sourcePayload(market.key, outcome)),
        });
      }
    }
  }

  writeDb(db);
  return { skipped: false, count: db.outrightOdds.length, bookmaker: THE_ODDS_BOOKMAKER };
}
