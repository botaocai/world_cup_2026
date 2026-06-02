import { formatDate, formatPoints } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { readDb } from "@/lib/store";

export default async function LedgerPage() {
  const user = await getCurrentUser();
  const bets = readDb().bets
    .filter((bet) => bet.userId === user!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rows = new Map<string, { stake: number; payout: number; profit: number }>();
  for (const bet of bets) {
    const key = formatDate(bet.createdAt);
    const row = rows.get(key) || { stake: 0, payout: 0, profit: 0 };
    row.stake += bet.stake;
    if (bet.status === "won") row.payout += bet.possiblePayout;
    if (bet.status !== "pending") row.profit += bet.profit;
    rows.set(key, row);
  }

  return (
    <main className="content">
      <div className="section-label">盈亏记录</div>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>投注金额</th>
            <th>派彩金额</th>
            <th>净盈亏</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(rows.entries()).map(([date, row]) => (
            <tr key={date}>
              <td>{date}</td>
              <td>{formatPoints(row.stake)}</td>
              <td>{formatPoints(row.payout)}</td>
              <td className={row.profit >= 0 ? "profit" : "loss"}>{formatPoints(row.profit)}</td>
            </tr>
          ))}
          {rows.size === 0 ? (
            <tr>
              <td colSpan={4}>暂无记录</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
