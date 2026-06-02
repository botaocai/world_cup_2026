import { NextResponse } from "next/server";
import { z } from "zod";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";
import { teamFlag, teamZh } from "@/lib/teams";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const upsertSchema = z.object({
  id: z.string().optional(),
  teamName: z.string().trim().min(1).max(40),
  price: z.coerce.number().positive(),
  flag: z.string().trim().max(8).optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = upsertSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "冠军赔率信息不完整" }, { status: 400 });
  }

  const db = readDb();
  const teamName = teamZh(parsed.data.teamName);
  const flag = parsed.data.flag || teamFlag(parsed.data.teamName) || teamFlag(teamName);
  const existing = parsed.data.id
    ? db.outrightOdds.find((item) => item.id === parsed.data.id)
    : db.outrightOdds.find((item) => item.teamName === teamName);

  if (existing) {
    existing.teamName = teamName;
    existing.flag = flag;
    existing.price = parsed.data.price;
    existing.bookmaker = "manual";
    existing.fetchedAt = timestamp();
  } else {
    db.outrightOdds.push({
      id: createId(),
      teamName,
      flag,
      price: parsed.data.price,
      bookmaker: "manual",
      fetchedAt: timestamp(),
    });
  }

  writeDb(db);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少冠军赔率 ID" }, { status: 400 });
  }

  const db = readDb();
  const hasPendingBet = db.bets.some(
    (bet) => bet.outrightOddsId === parsed.data.id && bet.status === "pending",
  );
  if (hasPendingBet) {
    return NextResponse.json({ error: "该冠军赔率已有待结算投注，不能删除" }, { status: 400 });
  }

  db.outrightOdds = db.outrightOdds.filter((item) => item.id !== parsed.data.id);
  writeDb(db);
  return NextResponse.json({ ok: true });
}
