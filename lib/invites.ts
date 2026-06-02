import crypto from "node:crypto";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createInviteCode() {
  let code = "WC";
  for (let i = 0; i < 8; i += 1) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

export async function generateInviteCodes(count = 100) {
  const db = readDb();
  const created: string[] = [];

  while (created.length < count) {
    const code = createInviteCode();
    if (!db.inviteCodes.some((invite) => invite.code === code)) {
      db.inviteCodes.push({
        id: createId(),
        code,
        status: "unused",
        createdAt: timestamp(),
      });
      created.push(code);
    }
  }

  writeDb(db);
  return created;
}
