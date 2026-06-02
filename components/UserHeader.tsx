"use client";

import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatPoints } from "@/lib/format";

export function UserHeader({
  displayName,
  balance,
}: {
  displayName: string;
  balance: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentBalance, setCurrentBalance] = useState(balance);

  const refreshUser = useCallback(async () => {
    const response = await fetch("/api/me", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data.user?.balance === "number") {
      setCurrentBalance(data.user.balance);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [pathname, refreshUser]);

  useEffect(() => {
    const onFocus = () => refreshUser();
    const onRefresh = () => refreshUser();
    window.addEventListener("focus", onFocus);
    window.addEventListener("worldcup:refresh-user", onRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("worldcup:refresh-user", onRefresh);
    };
  }, [refreshUser]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="topbar-row">
        <div>
          <div className="title">2026世界杯</div>
          <div className="player-name">{displayName}</div>
        </div>
        <div className="topbar-right">
          <div>
            <div className="balance-label">积分余额</div>
            <div className="balance">{formatPoints(currentBalance)}</div>
          </div>
          <button className="logout-button" onClick={logout} type="button" aria-label="退出登录">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
