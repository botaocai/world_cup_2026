import { NextResponse } from "next/server";
import { generateInviteCodes } from "@/lib/invites";
import { readDb } from "@/lib/store";

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
  const codes = await generateInviteCodes(count);

  return NextResponse.json({ codes });
}
