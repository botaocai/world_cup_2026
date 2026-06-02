import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type User = {
  id: string;
  inviteCodeId: string;
  displayName: string;
  balance: number;
  createdAt: string;
  lastLoginAt: string;
};

export type InviteCode = {
  id: string;
  code: string;
  status: "unused" | "used" | "disabled";
  createdAt: string;
  usedAt?: string;
};

export type Match = {
  id: string;
  externalId?: string;
  oddsEventId?: string;
  homeTeam: string;
  awayTeam: string;
  homeFlag?: string;
  awayFlag?: string;
  groupName?: string;
  stage: string;
  commenceTime: string;
  status: "scheduled" | "live" | "finished" | "cancelled";
  homeScore?: number;
  awayScore?: number;
  lastSyncedAt?: string;
};

export type OddsSnapshot = {
  id: string;
  matchId: string;
  market: string;
  selection: string;
  label: string;
  line?: number;
  price: number;
  bookmaker: string;
  fetchedAt: string;
  sourcePayload?: string;
};

export type OutrightOdds = {
  id: string;
  teamName: string;
  flag?: string;
  price: number;
  bookmaker: string;
  fetchedAt: string;
  sourcePayload?: string;
};

export type Bet = {
  id: string;
  orderNo: string;
  userId: string;
  type: "match" | "outright";
  matchId?: string;
  oddsSnapshotId?: string;
  outrightOddsId?: string;
  market: string;
  selection: string;
  selectionLabel: string;
  line?: number;
  price: number;
  stake: number;
  possiblePayout: number;
  status: "pending" | "won" | "lost" | "void";
  profit: number;
  settledAt?: string;
  createdAt: string;
};

export type WalletTransaction = {
  id: string;
  userId: string;
  betId?: string;
  amount: number;
  balance: number;
  type: string;
  note?: string;
  createdAt: string;
};

export type Db = {
  users: User[];
  inviteCodes: InviteCode[];
  matches: Match[];
  oddsSnapshots: OddsSnapshot[];
  outrightOdds: OutrightOdds[];
  bets: Bet[];
  walletTransactions: WalletTransaction[];
};

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "db.json");
const backupDir = path.join(dataDir, "backups");
const maxBackups = Number(process.env.DB_MAX_BACKUPS || 50);

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function seedDb(): Db {
  const match1 = id();
  const match2 = id();
  const match3 = id();
  const matches: Match[] = [
    {
      id: match1,
      oddsEventId: "Mexico-South Africa",
      homeTeam: "Mexico",
      awayTeam: "South Africa",
      homeFlag: "🇲🇽",
      awayFlag: "🇿🇦",
      groupName: "A小组",
      stage: "group",
      commenceTime: "2026-06-11T19:00:00.000Z",
      status: "scheduled",
    },
    {
      id: match2,
      oddsEventId: "Korea Republic-Czechia",
      homeTeam: "Korea Republic",
      awayTeam: "Czechia",
      homeFlag: "🇰🇷",
      awayFlag: "🇨🇿",
      groupName: "A小组",
      stage: "group",
      commenceTime: "2026-06-12T02:00:00.000Z",
      status: "scheduled",
    },
    {
      id: match3,
      oddsEventId: "Brazil-Germany",
      homeTeam: "Brazil",
      awayTeam: "Germany",
      homeFlag: "🇧🇷",
      awayFlag: "🇩🇪",
      groupName: "B小组",
      stage: "group",
      commenceTime: "2026-06-13T00:00:00.000Z",
      status: "scheduled",
    },
  ];

  const template = [
    ["spreads", "home", "墨西哥 -1/1.5", -1.25, 1.08],
    ["spreads", "away", "南非 +1/1.5", 1.25, 0.78],
    ["totals", "over", "大 2/2.5", 2.25, 0.84],
    ["totals", "under", "小 2/2.5", 2.25, 1],
    ["h2h", "home", "墨西哥", undefined, 1.45],
    ["h2h", "draw", "平", undefined, 4.25],
    ["h2h", "away", "南非", undefined, 7.8],
  ] as const;

  return {
    users: [],
    inviteCodes: [{ id: id(), code: "TEST2026", status: "unused", createdAt: now() }],
    matches,
    oddsSnapshots: matches.flatMap((match) =>
      template.map(([market, selection, label, line, price]) => ({
        id: id(),
        matchId: match.id,
        market,
        selection,
        label,
        line,
        price,
        bookmaker: "demo",
        fetchedAt: now(),
      })),
    ),
    outrightOdds: [
      ["巴西", "🇧🇷", 6.5],
      ["法国", "🇫🇷", 7],
      ["阿根廷", "🇦🇷", 8],
      ["英格兰", "🏴", 8.5],
      ["西班牙", "🇪🇸", 9],
      ["德国", "🇩🇪", 11],
      ["墨西哥", "🇲🇽", 29],
      ["韩国", "🇰🇷", 81],
    ].map(([teamName, flag, price]) => ({
      id: id(),
      teamName: String(teamName),
      flag: String(flag),
      price: Number(price),
      bookmaker: "demo",
      fetchedAt: now(),
    })),
    bets: [],
    walletTransactions: [],
  };
}

export function readDb(): Db {
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const seeded = seedDb();
    fs.writeFileSync(dbPath, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8")) as Db;
}

export function writeDb(db: Db) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) {
    fs.mkdirSync(backupDir, { recursive: true });
    const backupName = `db-${now().replace(/[:.]/g, "-")}.json`;
    fs.copyFileSync(dbPath, path.join(backupDir, backupName));
    pruneBackups();
  }
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function pruneBackups() {
  if (!fs.existsSync(backupDir) || !Number.isFinite(maxBackups) || maxBackups <= 0) return;
  const backups = fs
    .readdirSync(backupDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      mtime: fs.statSync(path.join(backupDir, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const backup of backups.slice(maxBackups)) {
    fs.rmSync(path.join(backupDir, backup.file), { force: true });
  }
}

export function createId() {
  return id();
}

export function timestamp() {
  return now();
}
