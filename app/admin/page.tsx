"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Coins, Download, RefreshCw, Search, TicketPlus, Trash2 } from "lucide-react";

type UserRow = { id: string; displayName: string; balance: number; inviteCode: string; lastLoginAt: string; totalBets: number; pendingBets: number; totalStake: number; netProfit: number };
type BetRow = { id: string; orderNo: string; userName: string; matchTitle: string; score: string; selectionLabel: string; price: number; stake: number; status: string; profit: number; createdAt: string };
type TransactionRow = { id: string; userName: string; orderNo: string; amount: number; balance: number; type: string; note?: string; betLabel?: string; createdAt: string };
type InviteRow = { id: string; code: string; status: string; createdAt: string; usedAt?: string; user?: { displayName: string; balance: number } | null };
type OutrightRow = { id: string; teamName: string; flag?: string; price: number; bookmaker: string; fetchedAt: string; pendingBets: number };
type Dashboard = {
  summary: { users: number; totalBalance: number; bets: number; pendingBets: number; netProfit: number; unusedInvites: number };
  users: UserRow[];
  bets: BetRow[];
  transactions: TransactionRow[];
  invites: InviteRow[];
  outrights: OutrightRow[];
};

const statusText: Record<string, string> = { pending: "待结算", won: "已赢", lost: "已输", void: "已退回" };
const txText: Record<string, string> = { initial_grant: "初始积分", bet_stake: "下注扣款", bet_settlement: "派奖结算", admin_adjustment: "后台调整", admin_cancel_bet: "取消退回" };

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [active, setActive] = useState<"players" | "bets" | "settlements" | "invites" | "outrights">("players");
  const [query, setQuery] = useState("");
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [outrightId, setOutrightId] = useState("");
  const [outrightTeam, setOutrightTeam] = useState("");
  const [outrightFlag, setOutrightFlag] = useState("");
  const [outrightPrice, setOutrightPrice] = useState("");
  const [championName, setChampionName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("worldcup_admin_password");
    if (saved) setPassword(saved);
  }, []);

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", "x-admin-password": password, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "操作失败");
    return data;
  }

  async function loadDashboard() {
    setLoading(true);
    setMessage("");
    try {
      const data = await request("/api/admin/dashboard");
      setDashboard(data);
      window.localStorage.setItem("worldcup_admin_password", password);
      setMessage("后台数据已刷新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateInvites() {
    setLoading(true);
    try {
      const data = await request("/api/admin/invites", { method: "POST", body: JSON.stringify({ count: 100 }) });
      setMessage(`已生成 ${data.codes.length} 个邀请码`);
      await loadDashboard();
      setActive("invites");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshOdds() {
    setLoading(true);
    try {
      const data = await request("/api/odds/refresh", { method: "POST" });
      setMessage(`赛事赔率刷新完成：${data.matches?.count ?? 0} 场；冠军赔率接口状态：${data.outrights?.skipped ? "未获取" : "已获取"}`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }

  async function adjustBalance() {
    if (!adjustUserId || !adjustAmount) return setMessage("请选择玩家并输入调整金额");
    setLoading(true);
    try {
      await request("/api/admin/adjust-balance", { method: "POST", body: JSON.stringify({ userId: adjustUserId, amount: Number(adjustAmount), note: adjustNote }) });
      setAdjustAmount("");
      setAdjustNote("");
      setMessage("余额已调整");
      await loadDashboard();
      setActive("settlements");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "调整失败");
    } finally {
      setLoading(false);
    }
  }

  async function cancelBet(betId: string) {
    if (!window.confirm("确定取消这笔待结算订单并退回本金吗？")) return;
    setLoading(true);
    try {
      await request("/api/admin/bets/cancel", { method: "POST", body: JSON.stringify({ betId }) });
      setMessage("订单已取消并退回本金");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "取消失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveOutright() {
    if (!outrightTeam || !outrightPrice) return setMessage("请填写国家和冠军赔率");
    setLoading(true);
    try {
      await request("/api/admin/outrights", { method: "POST", body: JSON.stringify({ id: outrightId || undefined, teamName: outrightTeam, flag: outrightFlag, price: Number(outrightPrice) }) });
      setOutrightId("");
      setOutrightTeam("");
      setOutrightFlag("");
      setOutrightPrice("");
      setMessage("冠军赔率已保存");
      await loadDashboard();
      setActive("outrights");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function deleteOutright(id: string) {
    if (!window.confirm("确定删除这条冠军赔率吗？")) return;
    setLoading(true);
    try {
      await request("/api/admin/outrights", { method: "DELETE", body: JSON.stringify({ id }) });
      setMessage("冠军赔率已删除");
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setLoading(false);
    }
  }

  async function settleChampion() {
    if (!championName) return setMessage("请输入冠军队名");
    if (!window.confirm(`确定按“${championName}”结算所有冠军竞猜吗？`)) return;
    setLoading(true);
    try {
      const data = await request("/api/admin/outrights/settle", {
        method: "POST",
        body: JSON.stringify({ champion: championName }),
      });
      setMessage(`冠军竞猜已结算：${data.settled.length} 单`);
      await loadDashboard();
      setActive("bets");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "结算失败");
    } finally {
      setLoading(false);
    }
  }

  async function exportData(type: "players" | "bets" | "transactions" | "json") {
    if (!password) return setMessage("请先输入管理员密码");
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/export?type=${type}`, {
        headers: { "x-admin-password": password },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "导出失败");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `worldcup-${type}.csv`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
      setMessage("导出完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出失败");
    } finally {
      setLoading(false);
    }
  }

  const filteredBets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!dashboard || !needle) return dashboard?.bets || [];
    return dashboard.bets.filter((bet) => [bet.orderNo, bet.userName, bet.matchTitle, bet.selectionLabel, bet.status].join(" ").toLowerCase().includes(needle));
  }, [dashboard, query]);

  const filteredTransactions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!dashboard || !needle) return dashboard?.transactions || [];
    return dashboard.transactions.filter((tx) => [tx.userName, tx.orderNo, tx.type, tx.note].join(" ").toLowerCase().includes(needle));
  }, [dashboard, query]);

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <h1>后台管理</h1>
          <p>管理邀请码、玩家余额、下注记录、结算流水和冠军赔率。</p>
        </div>
        <div className="admin-login">
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="管理员密码" />
          <button className="button" onClick={loadDashboard} disabled={loading}>进入后台</button>
        </div>
      </header>

      {message ? <div className="admin-message">{message}</div> : null}

      {dashboard ? (
        <>
          <section className="admin-summary">
            <SummaryCard label="玩家" value={dashboard.summary.users} />
            <SummaryCard label="总余额" value={dashboard.summary.totalBalance} />
            <SummaryCard label="订单" value={dashboard.summary.bets} />
            <SummaryCard label="待结算" value={dashboard.summary.pendingBets} />
            <SummaryCard label="净盈亏" value={dashboard.summary.netProfit} signed />
            <SummaryCard label="可用邀请码" value={dashboard.summary.unusedInvites} />
          </section>

          <section className="admin-actions">
            <button className="button secondary" onClick={loadDashboard} disabled={loading}><RefreshCw size={16} /> 刷新数据</button>
            <button className="button secondary" onClick={refreshOdds} disabled={loading}><RefreshCw size={16} /> 刷新赔率</button>
            <button className="button secondary" onClick={generateInvites} disabled={loading}><TicketPlus size={16} /> 生成100个邀请码</button>
            <button className="button secondary" onClick={() => exportData("players")} disabled={loading}><Download size={16} /> 导出玩家汇总</button>
            <button className="button secondary" onClick={() => exportData("bets")} disabled={loading}><Download size={16} /> 导出下注明细</button>
            <button className="button secondary" onClick={() => exportData("transactions")} disabled={loading}><Download size={16} /> 导出资金流水</button>
            <button className="button secondary" onClick={() => exportData("json")} disabled={loading}><Download size={16} /> 导出完整数据</button>
          </section>

          <section className="admin-panel wide">
            <h2>调整玩家余额</h2>
            <div className="admin-form-grid">
              <select className="select" value={adjustUserId} onChange={(event) => setAdjustUserId(event.target.value)}>
                <option value="">选择玩家</option>
                {dashboard.users.map((user) => <option value={user.id} key={user.id}>{user.displayName}（余额 {formatPoints(user.balance)}）</option>)}
              </select>
              <input className="input" type="number" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} placeholder="调整金额，例如 500 或 -200" />
              <input className="input" value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} placeholder="备注，可选" />
              <button className="button" onClick={adjustBalance} disabled={loading}><Coins size={16} /> 确认调整</button>
            </div>
          </section>

          <section className="admin-panel wide">
            <div className="admin-tabs">
              {[
                ["players", "玩家"],
                ["bets", "下注记录"],
                ["settlements", "结算流水"],
                ["invites", "邀请码"],
                ["outrights", "冠军赔率"],
              ].map(([id, label]) => (
                <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id as typeof active)}>{label}</button>
              ))}
            </div>

            {active === "bets" || active === "settlements" ? (
              <label className="admin-search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索玩家、订单号、比赛或状态" />
              </label>
            ) : null}

            {active === "players" ? <PlayersTable users={dashboard.users} /> : null}
            {active === "bets" ? <BetsTable bets={filteredBets} onCancel={cancelBet} /> : null}
            {active === "settlements" ? <TransactionsTable transactions={filteredTransactions} /> : null}
            {active === "invites" ? <InvitesTable invites={dashboard.invites} /> : null}
            {active === "outrights" ? (
              <OutrightsPanel
                outrights={dashboard.outrights}
                team={outrightTeam}
                flag={outrightFlag}
                price={outrightPrice}
                editingId={outrightId}
                setTeam={setOutrightTeam}
                setFlag={setOutrightFlag}
                setPrice={setOutrightPrice}
                onSave={saveOutright}
                onDelete={deleteOutright}
                championName={championName}
                setChampionName={setChampionName}
                onSettleChampion={settleChampion}
                onEdit={(odd) => {
                  setOutrightId(odd.id);
                  setOutrightTeam(odd.teamName);
                  setOutrightFlag(odd.flag || "");
                  setOutrightPrice(String(odd.price));
                }}
                onClear={() => {
                  setOutrightId("");
                  setOutrightTeam("");
                  setOutrightFlag("");
                  setOutrightPrice("");
                }}
              />
            ) : null}
          </section>
        </>
      ) : (
        <section className="admin-empty">输入管理员密码后点击“进入后台”，就可以查看和管理数据。</section>
      )}
    </main>
  );
}

function SummaryCard({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return <div className="summary-card"><span>{label}</span><strong className={signed && value < 0 ? "loss" : signed ? "profit" : ""}>{signed && value > 0 ? "+" : ""}{formatPoints(value)}</strong></div>;
}

function PlayersTable({ users }: { users: UserRow[] }) {
  return <Table headers={["玩家", "邀请码", "余额", "下注", "待结算", "总投注", "净盈亏", "最后登录"]}>{users.map((u) => <tr key={u.id}><td><strong>{u.displayName}</strong></td><td>{u.inviteCode}</td><td>{formatPoints(u.balance)}</td><td>{u.totalBets}</td><td>{u.pendingBets}</td><td>{formatPoints(u.totalStake)}</td><td className={u.netProfit >= 0 ? "profit" : "loss"}>{u.netProfit > 0 ? "+" : ""}{formatPoints(u.netProfit)}</td><td>{formatTime(u.lastLoginAt)}</td></tr>)}</Table>;
}

function BetsTable({ bets, onCancel }: { bets: BetRow[]; onCancel: (betId: string) => void }) {
  return <Table headers={["订单", "玩家", "比赛", "投注项", "金额", "赔率", "状态", "盈亏", "时间", "操作"]}>{bets.map((b) => <tr key={b.id}><td>{b.orderNo}</td><td>{b.userName}</td><td>{b.matchTitle}{b.score ? <span className="admin-score"> {b.score}</span> : null}</td><td>{b.selectionLabel}</td><td>{formatPoints(b.stake)}</td><td>{b.price.toFixed(2)}</td><td>{statusText[b.status] || b.status}</td><td className={b.profit >= 0 ? "profit" : "loss"}>{b.status === "pending" ? "-" : `${b.profit > 0 ? "+" : ""}${formatPoints(b.profit)}`}</td><td>{formatTime(b.createdAt)}</td><td>{b.status === "pending" ? <button className="mini-danger" onClick={() => onCancel(b.id)}><Ban size={13} /> 取消</button> : "-"}</td></tr>)}</Table>;
}

function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  return <Table headers={["时间", "玩家", "类型", "订单", "变动", "余额", "备注"]}>{transactions.map((tx) => <tr key={tx.id}><td>{formatTime(tx.createdAt)}</td><td>{tx.userName}</td><td>{txText[tx.type] || tx.type}</td><td>{tx.orderNo || "-"}</td><td className={tx.amount >= 0 ? "profit" : "loss"}>{tx.amount > 0 ? "+" : ""}{formatPoints(tx.amount)}</td><td>{formatPoints(tx.balance)}</td><td>{tx.note || tx.betLabel || "-"}</td></tr>)}</Table>;
}

function InvitesTable({ invites }: { invites: InviteRow[] }) {
  return <Table headers={["邀请码", "状态", "玩家", "余额", "创建时间", "使用时间"]}>{invites.map((i) => <tr key={i.id}><td><strong>{i.code}</strong></td><td>{i.status === "used" ? "已使用" : i.status === "disabled" ? "已停用" : "未使用"}</td><td>{i.user?.displayName || "-"}</td><td>{i.user ? formatPoints(i.user.balance) : "-"}</td><td>{formatTime(i.createdAt)}</td><td>{formatTime(i.usedAt)}</td></tr>)}</Table>;
}

function OutrightsPanel(props: {
  outrights: OutrightRow[];
  team: string;
  flag: string;
  price: string;
  editingId: string;
  setTeam: (value: string) => void;
  setFlag: (value: string) => void;
  setPrice: (value: string) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  championName: string;
  setChampionName: (value: string) => void;
  onSettleChampion: () => void;
  onEdit: (odd: OutrightRow) => void;
  onClear: () => void;
}) {
  return (
    <>
      <div className="admin-form-grid outright-form">
        <input className="input" value={props.team} onChange={(event) => props.setTeam(event.target.value)} placeholder="国家，例如 巴西 或 Brazil" />
        <input className="input" value={props.flag} onChange={(event) => props.setFlag(event.target.value)} placeholder="国旗，可选" />
        <input className="input" type="number" step="0.01" value={props.price} onChange={(event) => props.setPrice(event.target.value)} placeholder="冠军赔率，例如 6.50" />
        <button className="button" onClick={props.onSave}>{props.editingId ? "保存修改" : "新增赔率"}</button>
      </div>
      <div className="admin-form-grid outright-form">
        <input className="input" value={props.championName} onChange={(event) => props.setChampionName(event.target.value)} placeholder="最终冠军，例如 巴西 或 Brazil" />
        <button className="button" onClick={props.onSettleChampion}>结算冠军竞猜</button>
      </div>
      {props.editingId ? <button className="button secondary admin-clear-button" onClick={props.onClear}>取消编辑</button> : null}
      <Table headers={["国家", "赔率", "来源", "待结算投注", "更新时间", "操作"]}>
        {props.outrights.map((odd) => <tr key={odd.id}><td><strong>{odd.flag || ""} {odd.teamName}</strong></td><td>{odd.price.toFixed(2)}</td><td>{odd.bookmaker}</td><td>{odd.pendingBets}</td><td>{formatTime(odd.fetchedAt)}</td><td><button className="mini-button" onClick={() => props.onEdit(odd)}>编辑</button> <button className="mini-danger" onClick={() => props.onDelete(odd.id)}><Trash2 size={13} /> 删除</button></td></tr>)}
      </Table>
    </>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
