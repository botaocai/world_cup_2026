import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const dbPath = path.join(process.cwd(), "data", "db.json");
const backupPath = path.join(process.cwd(), "data", "db.edge-backup.json");
const autoBackupDir = path.join(process.cwd(), "data", "backups");
const adminPassword = process.env.ADMIN_PASSWORD || readEnv("ADMIN_PASSWORD") || "admin";

function readEnv(key) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  return line ? line.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "") : "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readDb() {
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

async function login(code, displayName) {
  const { response, body } = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ code, displayName }),
  });
  return { status: response.status, body, cookie: response.headers.get("set-cookie") || "" };
}

async function admin(pathname, options = {}) {
  return request(pathname, {
    ...options,
    headers: {
      "x-admin-password": adminPassword,
      ...(options.headers || {}),
    },
  });
}

function seedEdgeData() {
  const db = readDb();
  const inviteId = crypto.randomUUID();
  const matchId = crypto.randomUUID();
  const h2hOddsId = crypto.randomUUID();
  const totalsOddsId = crypto.randomUUID();
  const scoreOddsId = crypto.randomUUID();
  const closedMatchId = crypto.randomUUID();
  const closedOddsId = crypto.randomUUID();
  const code = `EDGE${Date.now().toString().slice(-7)}`;

  db.inviteCodes.push({
    id: inviteId,
    code,
    status: "unused",
    createdAt: new Date().toISOString(),
  });
  db.matches.push(
    {
      id: matchId,
      oddsEventId: matchId,
      homeTeam: "Korea Republic",
      awayTeam: "Czechia",
      homeFlag: "🇰🇷",
      awayFlag: "🇨🇿",
      groupName: "EDGE",
      stage: "test",
      commenceTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: "scheduled",
    },
    {
      id: closedMatchId,
      oddsEventId: closedMatchId,
      homeTeam: "Canada",
      awayTeam: "Bosnia and Herzegovina",
      homeFlag: "🇨🇦",
      awayFlag: "🇧🇦",
      groupName: "EDGE",
      stage: "test",
      commenceTime: new Date(Date.now() + 60 * 1000).toISOString(),
      status: "scheduled",
    },
  );
  db.oddsSnapshots.push(
    {
      id: h2hOddsId,
      matchId,
      market: "h2h",
      selection: "home",
      label: "韩国",
      price: 2.5,
      bookmaker: "edge",
      fetchedAt: new Date().toISOString(),
    },
    {
      id: totalsOddsId,
      matchId,
      market: "totals",
      selection: "over",
      label: "Over 1.5",
      line: 1.5,
      price: 1.9,
      bookmaker: "edge",
      fetchedAt: new Date().toISOString(),
    },
    {
      id: scoreOddsId,
      matchId,
      market: "correct_score",
      selection: "1-0",
      label: "1-0",
      price: 7,
      bookmaker: "edge",
      fetchedAt: new Date().toISOString(),
    },
    {
      id: closedOddsId,
      matchId: closedMatchId,
      market: "h2h",
      selection: "home",
      label: "加拿大",
      price: 1.8,
      bookmaker: "edge",
      fetchedAt: new Date().toISOString(),
    },
  );
  writeDb(db);
  return { code, h2hOddsId, totalsOddsId, scoreOddsId, closedOddsId, matchId };
}

async function run() {
  assert(fs.existsSync(dbPath), "data/db.json not found");
  fs.copyFileSync(dbPath, backupPath);

  try {
    const ids = seedEdgeData();

    const firstLogin = await login(ids.code, `边界${Date.now().toString().slice(-4)}`);
    assert(firstLogin.status === 200, "edge user login should succeed");
    const cookie = firstLogin.cookie.split(";")[0];
    let db = readDb();
    const userId = db.users.find((user) => user.inviteCodeId === db.inviteCodes.find((invite) => invite.code === ids.code).id).id;

    const noCookieBet = await request("/api/bets", {
      method: "POST",
      body: JSON.stringify({ kind: "match", oddsId: ids.h2hOddsId, stake: 10 }),
    });
    assert(noCookieBet.response.status === 401, "bet without login should be rejected");

    const badStakeZero = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: ids.h2hOddsId, stake: 0 }),
    });
    assert(badStakeZero.response.status === 400, "zero stake should be rejected");

    const badStakeOverMax = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: ids.h2hOddsId, stake: 3001 }),
    });
    assert(badStakeOverMax.response.status === 400, "stake over max should be rejected");

    const missingOdds = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: crypto.randomUUID(), stake: 10 }),
    });
    assert(missingOdds.response.status === 404, "missing odds should be rejected");

    const cutoffBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: ids.closedOddsId, stake: 10 }),
    });
    assert(cutoffBet.response.status === 400, "exact cutoff should reject betting");

    const normalBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: ids.h2hOddsId, stake: 100 }),
    });
    assert(normalBet.response.status === 200, "normal edge bet should succeed");

    const correctScoreBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: ids.scoreOddsId, stake: 20 }),
    });
    assert(correctScoreBet.response.status === 200, "correct score bet should succeed");

    const totalsBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: ids.totalsOddsId, stake: 30 }),
    });
    assert(totalsBet.response.status === 200, "totals bet should succeed");

    const unauthAdjust = await request("/api/admin/adjust-balance", {
      method: "POST",
      headers: { "x-admin-password": "wrong" },
      body: JSON.stringify({ userId, amount: 10 }),
    });
    assert(unauthAdjust.response.status === 401, "admin adjustment should reject wrong password");

    const zeroAdjust = await admin("/api/admin/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ userId, amount: 0 }),
    });
    assert(zeroAdjust.response.status === 400, "zero adjustment should be rejected");

    const missingUserAdjust = await admin("/api/admin/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ userId: crypto.randomUUID(), amount: 10 }),
    });
    assert(missingUserAdjust.response.status === 404, "adjustment for missing user should be rejected");

    const deductTooMuch = await admin("/api/admin/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ userId, amount: -999999 }),
    });
    assert(deductTooMuch.response.status === 400, "adjustment below zero should be rejected");

    const addPoints = await admin("/api/admin/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ userId, amount: 250, note: "edge add" }),
    });
    assert(addPoints.response.status === 200, "positive adjustment should succeed");

    const deductPoints = await admin("/api/admin/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ userId, amount: -125, note: "edge deduct" }),
    });
    assert(deductPoints.response.status === 200, "negative adjustment should succeed");

    db = readDb();
    const user = db.users.find((item) => item.id === userId);
    assert(user.balance === 3000 - 100 - 20 - 30 + 250 - 125, "admin add/deduct and stakes should update balance correctly");

    const manualResult = await admin("/api/admin/matches/result", {
      method: "POST",
      body: JSON.stringify({ matchId: ids.matchId, homeScore: 2, awayScore: 0 }),
    });
    assert(manualResult.response.status === 200, "manual match result should update and settle");
    assert(manualResult.body.settled.length >= 3, "manual match result should settle pending match bets");
    assert(manualResult.body.markets.h2h >= 1, "manual result should settle h2h bets");
    assert(manualResult.body.markets.totals >= 1, "manual result should settle totals bets");
    assert(manualResult.body.markets.correct_score >= 1, "manual result should settle correct score bets");

    db = readDb();
    const bet = db.bets.find((item) => item.oddsSnapshotId === ids.h2hOddsId);

    const cancelSettled = await admin("/api/admin/bets/cancel", {
      method: "POST",
      body: JSON.stringify({ betId: bet.id }),
    });
    assert(cancelSettled.response.status === 400, "settled bet cancellation should be rejected");

    const ai = await request("/api/ai/chat", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "韩国 vs 捷克怎么看？" },
          { role: "assistant", content: "主方向看小球。" },
          { role: "user", content: "那我历史投注有什么问题？" },
        ],
      }),
    });
    assert(ai.response.status === 200, "AI chat should respond");
    assert(String(ai.body.answer || "").includes("玩家") || String(ai.body.answer || "").includes("投注"), "AI should analyze player betting context");

    const dashboard = await admin("/api/admin/dashboard");
    assert(dashboard.response.status === 200, "admin dashboard should load after edge operations");
    assert(dashboard.body.transactions.some((tx) => tx.userName === user.displayName && tx.type === "admin_adjustment"), "dashboard should expose admin adjustment transactions");

    const unauthExport = await request("/api/admin/export?type=players", {
      headers: { "x-admin-password": "wrong" },
    });
    assert(unauthExport.response.status === 401, "exports should reject wrong admin password");

    for (const type of ["players", "bets", "transactions", "json"]) {
      const exported = await admin(`/api/admin/export?type=${type}`);
      assert(exported.response.status === 200, `${type} export should succeed`);
      assert(String(exported.body.raw || JSON.stringify(exported.body)).length > 20, `${type} export should return data`);
    }

    const reset = await admin("/api/admin/balances/reset", { method: "POST" });
    assert(reset.response.status === 200, "admin reset balances should succeed");
    db = readDb();
    assert(db.users.every((item) => item.balance === 3000), "reset balances should set every user to initial balance");

    const restoreJson = JSON.parse(fs.readFileSync(backupPath, "utf8"));
    const importDb = await admin("/api/admin/db/import", {
      method: "POST",
      body: JSON.stringify(restoreJson),
    });
    assert(importDb.response.status === 200, "admin db import should succeed");

    const autoBackups = fs.existsSync(autoBackupDir) ? fs.readdirSync(autoBackupDir).filter((file) => file.endsWith(".json")) : [];
    assert(autoBackups.length > 0, "automatic db backups should be created during writes");

    return {
      ok: true,
      checks: [
        "unauthenticated bet rejected",
        "stake zero rejected",
        "stake over max rejected",
        "missing odds rejected",
        "cutoff rejected",
        "normal bet",
        "correct score bet",
        "totals bet",
        "admin wrong password rejected",
        "zero adjustment rejected",
        "missing user adjustment rejected",
        "negative-balance adjustment rejected",
        "admin add points",
        "admin deduct points",
        "manual match result settlement",
        "manual h2h/totals/correct score settlement",
        "settled bet cancel rejected",
        "AI multi-turn player analysis",
        "dashboard transaction audit",
        "admin exports",
        "admin reset balances",
        "admin db import",
        "automatic db backups",
      ],
    };
  } finally {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, dbPath);
      fs.unlinkSync(backupPath);
    }
  }
}

run()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, dbPath);
      fs.unlinkSync(backupPath);
    }
    console.error(error);
    process.exit(1);
  });
