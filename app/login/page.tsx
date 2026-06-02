"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedCode = window.localStorage.getItem("worldcup_last_invite_code");
    if (savedCode) setCode(savedCode);
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const normalizedCode = code.trim().toUpperCase();
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: normalizedCode,
        displayName: needsDisplayName ? displayName : undefined,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      if (data.needsDisplayName) setNeedsDisplayName(true);
      setError(data.error || "登录失败");
      return;
    }

    window.localStorage.setItem("worldcup_last_invite_code", normalizedCode);
    router.push("/app/matches");
    router.refresh();
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={login}>
        <h1>世界杯竞猜</h1>
        <p>
          输入邀请码即可进入。首次使用邀请码时，需要先设置一个排行榜里显示的用户名。
        </p>
        <input
          className="input"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="输入邀请码"
          autoFocus
        />
        {needsDisplayName ? (
          <>
            <div style={{ height: 12 }} />
            <input
              className="input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="输入用户名，2-12个字"
            />
          </>
        ) : null}
        <div style={{ height: 12 }} />
        <button className="button" disabled={loading || !code.trim()}>
          {loading ? "登录中..." : needsDisplayName ? "创建账号" : "进入竞猜"}
        </button>
        {error ? <div className="error">{error}</div> : null}
      </form>
    </main>
  );
}
