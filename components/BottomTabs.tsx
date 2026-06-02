"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, ChartColumn, ClipboardList, ListOrdered, Trophy } from "lucide-react";

const tabs = [
  { href: "/app/matches", label: "赛事竞猜", icon: Trophy },
  { href: "/app/outrights", label: "冠军竞猜", icon: Trophy },
  { href: "/app/ai", label: "问问AI", icon: Bot, ai: true },
  { href: "/app/bets", label: "投注记录", icon: ClipboardList },
  { href: "/app/ledger", label: "盈亏记录", icon: ChartColumn },
  { href: "/app/leaderboard", label: "排行榜", icon: ListOrdered },
];

export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="tabbar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.href;
        return (
          <Link
            className={`tab ${active ? "active" : ""} ${tab.ai ? "ai-tab" : ""}`}
            href={tab.href}
            key={tab.href}
          >
            <Icon size={20} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
