import crypto from "node:crypto";
import { createId, readDb, timestamp, writeDb } from "@/lib/store";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createInviteCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

export async function generateInviteCodes(count = 100, note = "") {
  const db = readDb();
  const created: string[] = [];

  while (created.length < count) {
    const code = createInviteCode();
    if (!db.inviteCodes.some((invite) => invite.code === code)) {
      db.inviteCodes.push({
        id: createId(),
        code,
        status: "unused",
        note: note.trim() || undefined,
        createdAt: timestamp(),
      });
      created.push(code);
    }
  }

  writeDb(db);
  return created;
}
