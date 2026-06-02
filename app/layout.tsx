import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "世界杯竞猜",
  description: "朋友间虚拟积分世界杯竞猜",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
