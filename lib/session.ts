import { cookies } from "next/headers";
import { readDb } from "@/lib/store";

const COOKIE_NAME = "wc_user_id";

export async function setUserSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
}

export async function clearUserSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const userId = jar.get(COOKIE_NAME)?.value;
  if (!userId) return null;

  const db = readDb();
  return db.users.find((user) => user.id === userId) || null;
}
