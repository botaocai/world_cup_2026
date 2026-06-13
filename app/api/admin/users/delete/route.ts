import { NextResponse } from "next/server";
import { z } from "zod";
import { readDb, timestamp, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  userId: z.string().min(1),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "玩家信息不完整" }, { status: 400 });
  }

  const db = readDb();
  const user = db.users.find((item) => item.id === parsed.data.userId);
  if (!user) {
    return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
  }

  const removed = {
    bets: db.bets.filter((bet) => bet.userId === user.id).length,
    transactions: db.walletTransactions.filter((tx) => tx.userId === user.id).length,
  };

  db.users = db.users.filter((item) => item.id !== user.id);
  db.bets = db.bets.filter((bet) => bet.userId !== user.id);
  db.walletTransactions = db.walletTransactions.filter((tx) => tx.userId !== user.id);

  const invite = db.inviteCodes.find((item) => item.id === user.inviteCodeId);
  if (invite) {
    invite.status = "disabled";
    invite.note = [invite.note, `账号已删除：${user.displayName} ${timestamp()}`].filter(Boolean).join("；");
  }

  writeDb(db);
  return NextResponse.json({ ok: true, user: user.displayName, removed });
}
