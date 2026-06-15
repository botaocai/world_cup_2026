import { NextResponse } from "next/server";
import { z } from "zod";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

const schema = z.object({
  betId: z.string().min(1),
  price: z.number().min(1.01).max(1000),
  note: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "订单或赔率信息不完整" }, { status: 400 });
  }

  const db = readDb();
  const bet = db.bets.find((item) => item.id === parsed.data.betId);
  if (!bet) {
    return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  }
  if (bet.status !== "pending") {
    return NextResponse.json({ error: "只能修改未结算订单的赔率" }, { status: 400 });
  }

  const user = db.users.find((item) => item.id === bet.userId);
  if (!user) {
    return NextResponse.json({ error: "玩家不存在" }, { status: 404 });
  }

  const oldPrice = bet.price;
  bet.price = Number(parsed.data.price.toFixed(3));
  bet.possiblePayout = Math.round(bet.stake * bet.price);

  db.walletTransactions.push({
    id: createId(),
    userId: user.id,
    betId: bet.id,
    amount: 0,
    balance: user.balance,
    type: "admin_edit_bet_price",
    note: parsed.data.note || `后台修改赔率：${oldPrice} -> ${bet.price}`,
    createdAt: timestamp(),
  });

  writeDb(db);
  return NextResponse.json({ ok: true, oldPrice, newPrice: bet.price, possiblePayout: bet.possiblePayout });
}
