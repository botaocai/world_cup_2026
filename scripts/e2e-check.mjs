import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const baseUrl = process.env.E2E_BASE_URL || "http://localhost:3000";
const dbPath = path.join(process.cwd(), "data", "db.json");
const backupPath = path.join(process.cwd(), "data", "db.e2e-backup.json");
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

function addInvite(db, code) {
  db.inviteCodes.push({
    id: crypto.randomUUID(),
    code,
    status: "unused",
    createdAt: new Date().toISOString(),
  });
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

async function run() {
  assert(fs.existsSync(dbPath), "data/db.json not found. Refresh odds or start the app first.");
  fs.copyFileSync(dbPath, backupPath);

  const created = {
    inviteCode: `E2E${Date.now().toString().slice(-7)}`,
    cutoffInvite: `CUT${Date.now().toString().slice(-7)}`,
    userName: `测试${Date.now().toString().slice(-4)}`,
  };

  try {
    let db = readDb();
    addInvite(db, created.inviteCode);
    addInvite(db, created.cutoffInvite);
    writeDb(db);

    const unauthAdmin = await request("/api/admin/dashboard", {
      headers: { "x-admin-password": "wrong-password" },
    });
    assert(unauthAdmin.response.status === 401, "admin dashboard should reject wrong password");

    const firstLoginMissingName = await login(created.inviteCode);
    assert(firstLoginMissingName.status === 409, "first invite login without username should require username");
    assert(firstLoginMissingName.body.needsDisplayName === true, "missing username response should mark needsDisplayName");

    const firstLogin = await login(created.inviteCode, created.userName);
    assert(firstLogin.status === 200, "first invite login with username should succeed");
    assert(firstLogin.cookie.includes("wc_user_id"), "login should set user cookie");

    const relogin = await login(created.inviteCode);
    assert(relogin.status === 200, "used invite should login again without username");

    const duplicateName = await login(created.cutoffInvite, created.userName);
    assert(duplicateName.status === 409, "duplicate display name should be rejected");

    db = readDb();
    const user = db.users.find((item) => item.displayName === created.userName);
    assert(user, "created user should exist in db");
    assert(user.balance === 3000, "created user should receive 3000 points");

    const openMatchId = crypto.randomUUID();
    const openOddsId = crypto.randomUUID();
    const cutoffMatchId = crypto.randomUUID();
    const cutoffOddsId = crypto.randomUUID();
    const now = Date.now();

    db.matches.push(
      {
        id: openMatchId,
        oddsEventId: openMatchId,
        homeTeam: "Brazil",
        awayTeam: "Germany",
        homeFlag: "🇧🇷",
        awayFlag: "🇩🇪",
        groupName: "E2E测试",
        stage: "test",
        commenceTime: new Date(now + 10 * 60 * 1000).toISOString(),
        status: "scheduled",
      },
      {
        id: cutoffMatchId,
        oddsEventId: cutoffMatchId,
        homeTeam: "France",
        awayTeam: "Spain",
        homeFlag: "🇫🇷",
        awayFlag: "🇪🇸",
        groupName: "E2E测试",
        stage: "test",
        commenceTime: new Date(now + 30 * 1000).toISOString(),
        status: "scheduled",
      },
    );
    db.oddsSnapshots.push(
      {
        id: openOddsId,
        matchId: openMatchId,
        market: "h2h",
        selection: "home",
        label: "巴西",
        price: 2,
        bookmaker: "e2e",
        fetchedAt: new Date().toISOString(),
      },
      {
        id: cutoffOddsId,
        matchId: cutoffMatchId,
        market: "h2h",
        selection: "home",
        label: "法国",
        price: 2,
        bookmaker: "e2e",
        fetchedAt: new Date().toISOString(),
      },
    );
    writeDb(db);

    const cookie = firstLogin.cookie.split(";")[0];
    const cutoffBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: cutoffOddsId, stake: 100 }),
    });
    assert(cutoffBet.response.status === 400, "bet inside 1 minute cutoff should be rejected");

    const goodBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: openOddsId, stake: 200 }),
    });
    assert(goodBet.response.status === 200, "normal bet should succeed");

    db = readDb();
    const bet = db.bets.find((item) => item.oddsSnapshotId === openOddsId);
    const updatedUser = db.users.find((item) => item.id === user.id);
    assert(bet && bet.status === "pending", "normal bet should create pending order");
    assert(updatedUser.balance === 2800, "normal bet should deduct stake");

    const insufficient = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "match", oddsId: openOddsId, stake: 3000 }),
    });
    assert(insufficient.response.status === 400, "insufficient balance should be rejected");

    const dashboardAfterBet = await admin("/api/admin/dashboard");
    assert(dashboardAfterBet.response.status === 200, "admin dashboard should load");
    assert(
      dashboardAfterBet.body.bets.some((item) => item.id === bet.id && item.userName === created.userName),
      "admin dashboard should include created bet",
    );

    const adjust = await admin("/api/admin/adjust-balance", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, amount: 150, note: "E2E加分" }),
    });
    assert(adjust.response.status === 200, "admin balance adjustment should succeed");
    db = readDb();
    assert(db.users.find((item) => item.id === user.id).balance === 2950, "admin adjustment should update balance");

    const cancel = await admin("/api/admin/bets/cancel", {
      method: "POST",
      body: JSON.stringify({ betId: bet.id, note: "E2E取消" }),
    });
    assert(cancel.response.status === 200, "admin pending bet cancellation should succeed");
    db = readDb();
    const cancelledBet = db.bets.find((item) => item.id === bet.id);
    const cancelledUser = db.users.find((item) => item.id === user.id);
    assert(cancelledBet.status === "void", "cancelled bet should be void");
    assert(cancelledUser.balance === 3150, "cancelled bet should refund stake after adjustment");
    assert(
      db.walletTransactions.some((tx) => tx.userId === user.id && tx.type === "admin_adjustment") &&
        db.walletTransactions.some((tx) => tx.userId === user.id && tx.type === "admin_cancel_bet"),
      "admin actions should write wallet transactions",
    );

    const finalDashboard = await admin("/api/admin/dashboard");
    assert(
      finalDashboard.body.transactions.some((tx) => tx.userName === created.userName && tx.type === "admin_cancel_bet"),
      "dashboard should expose cancellation transaction",
    );

    const outrightCreate = await admin("/api/admin/outrights", {
      method: "POST",
      body: JSON.stringify({ teamName: "E2E Champion", price: 8 }),
    });
    assert(outrightCreate.response.status === 200, "manual outright odds should be saved");

    db = readDb();
    const outright = db.outrightOdds.find((item) => item.teamName === "E2E Champion");
    assert(outright && outright.price === 8, "manual outright should exist at original price");

    const outrightBet = await request("/api/bets", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ kind: "outright", oddsId: outright.id, stake: 100 }),
    });
    assert(outrightBet.response.status === 200, "outright bet should succeed");

    const outrightUpdate = await admin("/api/admin/outrights", {
      method: "POST",
      body: JSON.stringify({ id: outright.id, teamName: "E2E Champion", price: 2 }),
    });
    assert(outrightUpdate.response.status === 200, "manual outright odds should be editable");

    const settleOutright = await admin("/api/admin/outrights/settle", {
      method: "POST",
      body: JSON.stringify({ champion: "E2E Champion" }),
    });
    assert(settleOutright.response.status === 200, "outright settlement should succeed");
    const settledOutright = settleOutright.body.settled.find((item) => item.selection === "E2E Champion");
    assert(settledOutright.lockedPrice === 8, "outright settlement should use locked bet price, not latest price");
    assert(settledOutright.payout === 800, "outright payout should be stake times locked price");

    return {
      ok: true,
      checks: [
        "admin wrong password",
        "first login username requirement",
        "duplicate username",
        "normal login",
        "cutoff bet rejected",
        "normal bet created",
        "insufficient balance",
        "admin dashboard",
        "admin balance adjustment",
        "admin cancel pending bet",
        "wallet transaction audit",
        "manual outright odds",
        "outright locked price settlement",
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
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, dbPath);
      fs.unlinkSync(backupPath);
    }
    console.error(error);
    process.exit(1);
  });
