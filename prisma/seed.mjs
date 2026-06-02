import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const teams = [
  ["Mexico", "🇲🇽", "MEX"],
  ["South Africa", "🇿🇦", "RSA"],
  ["Korea Republic", "🇰🇷", "KOR"],
  ["Czechia", "🇨🇿", "CZE"],
  ["Brazil", "🇧🇷", "BRA"],
  ["Argentina", "🇦🇷", "ARG"],
  ["France", "🇫🇷", "FRA"],
  ["England", "🏴", "ENG"],
  ["Spain", "🇪🇸", "ESP"],
  ["Germany", "🇩🇪", "GER"],
];

const matches = [
  {
    homeTeam: "Mexico",
    awayTeam: "South Africa",
    homeFlag: "🇲🇽",
    awayFlag: "🇿🇦",
    groupName: "A小组",
    commenceTime: new Date("2026-06-11T19:00:00.000Z"),
  },
  {
    homeTeam: "Korea Republic",
    awayTeam: "Czechia",
    homeFlag: "🇰🇷",
    awayFlag: "🇨🇿",
    groupName: "A小组",
    commenceTime: new Date("2026-06-12T02:00:00.000Z"),
  },
  {
    homeTeam: "Brazil",
    awayTeam: "Germany",
    homeFlag: "🇧🇷",
    awayFlag: "🇩🇪",
    groupName: "B小组",
    commenceTime: new Date("2026-06-13T00:00:00.000Z"),
  },
];

const odds = [
  ["spreads", "home", "让 -1/1.5", -1.25, 1.08],
  ["spreads", "away", "受让 +1/1.5", 1.25, 0.78],
  ["totals", "over", "大 2/2.5", 2.25, 0.84],
  ["totals", "under", "小 2/2.5", 2.25, 1.0],
  ["h2h", "home", "主胜", null, 1.45],
  ["h2h", "draw", "平局", null, 4.25],
  ["h2h", "away", "客胜", null, 7.8],
];

for (const [name, flag, fifaCode] of teams) {
  await prisma.team.upsert({
    where: { name },
    update: { flag, fifaCode },
    create: { name, flag, fifaCode },
  });
}

for (const match of matches) {
  const saved = await prisma.match.upsert({
    where: { oddsEventId: `${match.homeTeam}-${match.awayTeam}` },
    update: match,
    create: { ...match, oddsEventId: `${match.homeTeam}-${match.awayTeam}` },
  });

  for (const [market, selection, label, line, price] of odds) {
    await prisma.oddsSnapshot.create({
      data: {
        matchId: saved.id,
        market,
        selection,
        label,
        line,
        price: Number(price),
        bookmaker: "demo",
      },
    });
  }
}

const outrightPrices = [
  ["Brazil", "🇧🇷", 6.5],
  ["France", "🇫🇷", 7.0],
  ["Argentina", "🇦🇷", 8.0],
  ["England", "🏴", 8.5],
  ["Spain", "🇪🇸", 9.0],
  ["Germany", "🇩🇪", 11.0],
  ["Mexico", "🇲🇽", 29.0],
  ["Korea Republic", "🇰🇷", 81.0],
];

for (const [teamName, flag, price] of outrightPrices) {
  await prisma.outrightOdds.create({
    data: { teamName, flag, price: Number(price), bookmaker: "demo" },
  });
}

await prisma.appSetting.upsert({
  where: { key: "initialBalance" },
  update: { value: "3000" },
  create: { key: "initialBalance", value: "3000" },
});

await prisma.inviteCode.upsert({
  where: { code: "TEST2026" },
  update: {},
  create: { code: "TEST2026" },
});

await prisma.$disconnect();
