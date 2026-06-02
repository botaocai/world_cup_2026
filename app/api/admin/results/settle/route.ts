import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

function isAdmin(request: Request) {
  const password = request.headers.get("x-admin-password");
  return password && password === (process.env.ADMIN_PASSWORD || "admin");
}

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "无权限" }, { status: 401 });
  }

  try {
    const { stdout, stderr } = await execFileAsync("node", ["scripts/settle-results.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      timeout: 120_000,
    });
    const parsed = JSON.parse(stdout || "{}");
    return NextResponse.json({ ...parsed, stderr: stderr || undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "settlement failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
