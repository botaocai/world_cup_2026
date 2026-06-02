import { redirect } from "next/navigation";
import { BottomTabs } from "@/components/BottomTabs";
import { formatPoints } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-row">
          <div>
            <div className="title">2026世界杯</div>
            <div style={{ fontSize: 12, color: "#d8cfc6" }}>{user.displayName}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#d8cfc6" }}>积分余额</div>
            <div className="balance">{formatPoints(user.balance)}</div>
          </div>
        </div>
      </header>
      {children}
      <BottomTabs />
    </div>
  );
}
