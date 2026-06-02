import { NextResponse } from "next/server";
import { z } from "zod";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().int().refine((value) => value !== 0),
  note: z.string().trim().max(80).optional(),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "调整信息不完整" }, { status: 400 });
  }

  const db = readDb();
  const user = db.users.find((item) => item.id === parsed.data.userId);
  if (!user) {
    return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
  }

  const nextBalance = user.balance + parsed.data.amount;
  if (nextBalance < 0) {
    return NextResponse.json({ error: "调整后余额不能小于 0" }, { status: 400 });
  }

  user.balance = nextBalance;
  db.walletTransactions.push({
    id: createId(),
    userId: user.id,
    amount: parsed.data.amount,
    balance: user.balance,
    type: "admin_adjustment",
    note: parsed.data.note || "后台调整余额",
    createdAt: timestamp(),
  });

  writeDb(db);
  return NextResponse.json({ ok: true, balance: user.balance });
}
