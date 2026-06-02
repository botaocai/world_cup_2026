import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Please login first" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      displayName: user.displayName,
      balance: user.balance,
    },
  });
}
