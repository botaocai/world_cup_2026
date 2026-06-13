import { LeaderboardDetails } from "@/components/LeaderboardDetails";
import { getCurrentUser } from "@/lib/session";
import { readDb } from "@/lib/store";
import { teamZh } from "@/lib/teams";

export default async function LeaderboardPage() {
  const currentUser = await getCurrentUser();
  const db = readDb();
  const rows = db.users
    .map((user) => {
      const bets = db.bets
        .filter((bet) => bet.userId === user.id && bet.status !== "void")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const settled = bets.filter((bet) => bet.status === "won" || bet.status === "lost");
      const pendingBets = bets.filter((bet) => bet.status === "pending");
      const profit = settled.reduce((sum, bet) => sum + bet.profit, 0);
      const stake = bets.reduce((sum, bet) => sum + bet.stake, 0);
      const won = settled.filter((bet) => bet.status === "won").length;
      const lost = settled.filter((bet) => bet.status === "lost").length;

      return {
        user: {
          id: user.id,
          displayName: user.displayName,
          balance: user.balance,
        },
        profit,
        stake,
        won,
        lost,
        pending: pendingBets.length,
        currentBets: pendingBets.map((bet) => betView(db, bet)),
        historyBets: settled.map((bet) => betView(db, bet)),
      };
    })
    .sort((a, b) => b.profit - a.profit || b.user.balance - a.user.balance)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      isCurrent: row.user.id === currentUser?.id,
    }));

  return (
    <main className="content">
      <div className="section-label">排行榜</div>
      <LeaderboardDetails rows={rows} />
    </main>
  );
}

function betView(db: ReturnType<typeof readDb>, bet: (ReturnType<typeof readDb>)["bets"][number]) {
  const match = bet.matchId ? db.matches.find((item) => item.id === bet.matchId) : null;
  const title = match ? `${teamZh(match.homeTeam)} vs ${teamZh(match.awayTeam)}` : bet.type === "outright" ? "冠军竞猜" : bet.selection;
  return {
    id: bet.id,
    orderNo: bet.orderNo,
    title,
    selectionLabel: bet.selectionLabel,
    price: bet.price,
    stake: bet.stake,
    possiblePayout: bet.possiblePayout,
    status: bet.status,
    profit: bet.profit,
    createdAt: bet.createdAt,
  };
}
