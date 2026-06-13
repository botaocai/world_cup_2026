const task = process.argv[2];

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

const appUrl = env("APP_URL", env("RAILWAY_PUBLIC_DOMAIN") ? `https://${env("RAILWAY_PUBLIC_DOMAIN")}` : "http://localhost:3000");
const adminPassword = env("ADMIN_PASSWORD", "admin");

async function post(pathname) {
  const response = await fetch(`${appUrl.replace(/\/$/, "")}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": adminPassword,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

if (task === "refresh-odds") {
  const result = await post("/api/odds/refresh");
  console.log(JSON.stringify({ ok: true, task, result }, null, 2));
} else if (task === "settle-results") {
  const result = await post("/api/admin/results/settle");
  console.log(JSON.stringify({ ok: true, task, result }, null, 2));
} else if (task === "refresh-intelligence") {
  const result = await post("/api/admin/intelligence/refresh");
  console.log(JSON.stringify({ ok: true, task, result }, null, 2));
} else {
  throw new Error("Usage: node scripts/admin-task.mjs refresh-odds|settle-results|refresh-intelligence");
}
