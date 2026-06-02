import { NextResponse } from "next/server";
import { generateInviteCodes } from "@/lib/invites";
import { readDb, writeDb } from "@/lib/store";

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const db = readDb();
  const invites = db.inviteCodes
    .map((invite) => ({
      ...invite,
      user: db.users.find((user) => user.inviteCodeId === invite.id) || null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ invites });
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const count = Math.min(Number(body.count || 100), 500);
  const note = typeof body.note === "string" ? body.note.slice(0, 80) : "";
  const codes = await generateInviteCodes(count, note);

  return NextResponse.json({ codes });
}

export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 80) : "";
  const db = readDb();
  const invite = db.inviteCodes.find((item) => item.id === id);
  if (!invite) {
    return NextResponse.json({ error: "邀请码不存在" }, { status: 404 });
  }

  invite.note = note || undefined;
  writeDb(db);
  return NextResponse.json({ ok: true, invite });
}
