import { NextResponse } from "next/server";
import { z } from "zod";
import { setUserSession } from "@/lib/session";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

const schema = z.object({
  code: z.string().trim().min(4).max(32),
  displayName: z.string().trim().min(2).max(12).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的邀请码" }, { status: 400 });
  }

  const code = parsed.data.code.toUpperCase();
  const db = readDb();
  const invite = db.inviteCodes.find((item) => item.code === code);

  if (!invite || invite.status === "disabled") {
    return NextResponse.json({ error: "邀请码不存在或已停用" }, { status: 404 });
  }

  const initialBalance = Number(process.env.INITIAL_BALANCE || 3000);
  let user = db.users.find((item) => item.inviteCodeId === invite.id);

  if (!user) {
    const displayName = parsed.data.displayName;
    if (!displayName) {
      return NextResponse.json(
        { error: "首次使用邀请码，请先输入用户名", needsDisplayName: true },
        { status: 409 },
      );
    }

    const nameTaken = db.users.some((item) => item.displayName === displayName);
    if (nameTaken) {
      return NextResponse.json({ error: "这个用户名已经被使用" }, { status: 409 });
    }

    user = {
      id: createId(),
      inviteCodeId: invite.id,
      displayName,
      balance: initialBalance,
      createdAt: timestamp(),
      lastLoginAt: timestamp(),
    };
    db.users.push(user);
    invite.status = "used";
    invite.usedAt = timestamp();
    db.walletTransactions.push({
      id: createId(),
      userId: user.id,
      amount: initialBalance,
      balance: initialBalance,
      type: "initial_grant",
      note: "初始积分",
      createdAt: timestamp(),
    });
  }

  user.lastLoginAt = timestamp();
  writeDb(db);
  await setUserSession(user.id);

  return NextResponse.json({ ok: true });
}
