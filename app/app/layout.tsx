import { redirect } from "next/navigation";
import { BottomTabs } from "@/components/BottomTabs";
import { UserHeader } from "@/components/UserHeader";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="shell">
      <UserHeader displayName={user.displayName} balance={user.balance} />
      {children}
      <BottomTabs />
    </div>
  );
}
