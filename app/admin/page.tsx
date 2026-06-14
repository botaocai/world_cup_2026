"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Bot, Coins, Download, RefreshCw, Search, TicketPlus, Trash2 } from "lucide-react";

type UserRow = { id: string; displayName: string; balance: number; inviteCode: string; lastLoginAt: string; totalBets: number; pendingBets: number; totalStake: number; netProfit: number };
type BetRow = { id: string; orderNo: string; userName: string; matchTitle: string; score: string; selectionLabel: string; price: number; stake: number; status: string; profit: number; createdAt: string };
type TransactionRow = { id: string; userName: string; orderNo: string; amount: number; balance: number; type: string; note?: string; betLabel?: string; createdAt: string };
type InviteRow = { id: string; code: string; status: string; note?: string; createdAt: string; usedAt?: string; user?: { displayName: string; balance: number } | null };
type OutrightRow = { id: string; teamName: string; flag?: string; price: number; bookmaker: string; fetchedAt: string; pendingBets: number };
type MatchRow = { id: string; homeTeamZh: string; awayTeamZh: string; commenceTime: string; status: string; homeScore?: number; awayScore?: number; pendingBets: number; totalBets: number; groupName?: string };
type AiContestAgentRow = { id: string; name: string; provider: string; model: string; balance: number; strategyType?: string; strategy?: string; bankrollRule?: string; status: string; error?: string; totalBets: number; pendingBets: number; profit: number; settledProfit: number };
type AiContestBetRow = { id: string; agentName: string; matchTitle: string; selectionLabel: string; stake: number; price: number; confidence: string; reason: string; status: string; profit: number; createdAt: string };
type AiContestRoundRow = { id: string; agentName: string; windowHours: number; matchIds: string[]; strategyType?: string; strategy?: string; bankrollRule?: string; strategyChange?: string; skipReason?: string; error?: string; createdAt: string };
type AiContestModelRow = { id: string; name: string; provider: string; model: string; apiKeyEnv: string; hasKey: boolean };
type AiContestDiscussionRow = { id: string; agentName: string; matchTitle: string; stance: string; keyPoints: string[]; preferredAngles: string[]; riskWarning: string; error?: string; createdAt: string };
type AiContest = { configuredModels: AiContestModelRow[]; agents: AiContestAgentRow[]; bets: AiContestBetRow[]; rounds: AiContestRoundRow[]; discussions: AiContestDiscussionRow[] };
type ActiveTab = "players" | "bets" | "settlements" | "invites" | "outrights" | "results" | "aiContest";
type Dashboard = {
  summary: { users: number; totalBalance: number; bets: number; pendingBets: number; netProfit: number; unusedInvites: number };
  users: UserRow[];
  bets: BetRow[];
  transactions: TransactionRow[];
  invites: InviteRow[];
  outrights: OutrightRow[];
  matches: MatchRow[];
};

const statusText: Record<string, string> = { pending: "待结算", won: "已赢", lost: "已输", void: "已退回" };
const txText: Record<string, string> = { initial_grant: "初始积分", bet_stake: "下注扣款", bet_settlement: "派奖结算", admin_adjustment: "后台调整", admin_cancel_bet: "取消退回", outright_settlement: "冠军结算", admin_reset_balance: "余额重置" };

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [aiContest, setAiContest] = useState<AiContest | null>(null);
  const [active, setActive] = useState<ActiveTab>("players");
  const [query, setQuery] = useState("");
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [outrightId, setOutrightId] = useState("");
  const [outrightTeam, setOutrightTeam] = useState("");
  const [outrightFlag, setOutrightFlag] = useState("");
  const [outrightPrice, setOutrightPrice] = useState("");
  const [championName, setChampionName] = useState("");
  const [resultMatchId, setResultMatchId] = useState("");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
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
      const data = await request("/api/admin/invites", { method: "POST", body: JSON.stringify({ count: 100, note: inviteNote }) });
      setMessage(`已生成 ${data.codes.length} 个邀请码`);
      setInviteNote("");
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
      const fallback = data.matches?.fallbackFrom
        ? `；fallback：${data.matches.fallbackFrom.source || "-"} ${data.matches.fallbackFrom.reason || ""}`
        : "";
      const outrightStatus = data.outrights?.skipped
        ? `冠军未获取：${data.outrights?.reason || "-"}`
        : "冠军已获取";
      setMessage(`刷新赔率完成：${data.matches?.source || "-"}，${data.matches?.count ?? 0} 场${fallback}；${outrightStatus}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshIntelligence() {
    setLoading(true);
    setMessage("AI情报生成中：正在处理12小时窗口内比赛，可能需要几十秒。");
    try {
      const data = await request("/api/admin/intelligence/refresh", { method: "POST" });
      const failures = Array.isArray(data.results) ? data.results.filter((item: { failed?: boolean }) => item.failed) : [];
      const failureText = failures.length ? `；失败原因：${failures.map((item: { error?: string }) => item.error || "未知错误").slice(0, 2).join(" / ")}` : "";
      const finalMessage = `AI情报生成完成：生成 ${data.generated} 场，失败 ${data.failed} 场，12小时窗口内待处理 ${data.dueMatches} 场${failureText}`;
      await loadDashboard();
      setMessage(finalMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI情报生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function forceRefreshIntelligence() {
    setLoading(true);
    setMessage("AI情报强制刷新中：正在重新收集外网信息并调用模型，线上可能需要1-3分钟，请不要重复点击。");
    try {
      const data = await request("/api/admin/intelligence/refresh?force=1&hours=24", { method: "POST" });
      const failures = Array.isArray(data.results) ? data.results.filter((item: { failed?: boolean }) => item.failed) : [];
      const failureText = failures.length ? `；失败原因：${failures.map((item: { error?: string }) => item.error || "未知错误").slice(0, 2).join(" / ")}` : "";
      const finalMessage = `AI情报强制刷新完成：未来24小时内刷新 ${data.generated} 场，失败 ${data.failed} 场，共处理 ${data.dueMatches} 场${failureText}`;
      await loadDashboard();
      setMessage(finalMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI情报强制刷新失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadAiContest() {
    setLoading(true);
    try {
      const data = await request("/api/admin/ai-contest");
      setAiContest(data);
      setMessage("AI下注王沙盒已刷新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI下注王读取失败");
    } finally {
      setLoading(false);
    }
  }

  async function aiContestAction(action: "init" | "run" | "reset") {
    if (action === "reset" && !window.confirm("确定重置 AI下注王 沙盒吗？这只会清空 AI 模型账户和 AI 注单，不影响真人数据。")) return;
    setLoading(true);
      setMessage(action === "run" ? "AI模型正在先讨论比赛，再制定策略并下注，可能需要几分钟。" : "AI下注王处理中...");
    try {
      const data = await request("/api/admin/ai-contest", {
        method: "POST",
        body: JSON.stringify({ action, windowHours: 24 }),
      });
      setAiContest(data);
      const errorCount = data.agents?.filter((agent: AiContestAgentRow) => agent.status === "error").length || 0;
      setMessage(action === "run" ? `AI下注完成：${data.bets?.length || 0} 笔AI注单，${errorCount} 个模型报错` : "AI下注王沙盒已更新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI下注王操作失败");
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

  async function resetAllBalances() {
    if (!window.confirm("确定把所有玩家当前余额重置为 3000 分吗？下注记录不会删除。")) return;
    setLoading(true);
    try {
      const data = await request("/api/admin/balances/reset", { method: "POST" });
      setMessage(`已恢复 ${data.changed.length} 个玩家到 ${data.target} 分`);
      await loadDashboard();
      setActive("settlements");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置失败");
    } finally {
      setLoading(false);
    }
  }

  async function resetInitialState() {
    const confirmed = window.confirm("确定恢复到初始状态吗？这会删除所有玩家、邀请码、下注记录和资金流水，并清空已填赛果。当前数据会先自动备份。");
    if (!confirmed) return;
    setLoading(true);
    try {
      const data = await request("/api/admin/db/reset", { method: "POST" });
      setMessage(`已恢复初始状态：清除 ${data.cleared.users} 个玩家、${data.cleared.invites} 个邀请码、${data.cleared.bets} 个订单`);
      await loadDashboard();
      setActive("players");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复初始状态失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveInviteNote(id: string, note: string) {
    setLoading(true);
    try {
      await request("/api/admin/invites", { method: "PATCH", body: JSON.stringify({ id, note }) });
      setMessage("邀请码备注已保存");
      await loadDashboard();
      setActive("invites");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存备注失败");
    } finally {
      setLoading(false);
    }
  }

  async function importDatabase(file?: File | null) {
    if (!file) return;
    if (!window.confirm("确定用这个 JSON 覆盖线上数据库吗？当前线上数据会先自动备份。")) return;
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = await request("/api/admin/db/import", {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      setMessage(`数据库已恢复：${data.users} 个玩家，${data.bets} 个订单，${data.matches} 场比赛`);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setLoading(false);
    }
  }

  async function updateMatchResult() {
    if (!resultMatchId || homeScore === "" || awayScore === "") return setMessage("请选择比赛并填写比分");
    setLoading(true);
    try {
      const data = await request("/api/admin/matches/result", {
        method: "POST",
        body: JSON.stringify({ matchId: resultMatchId, homeScore: Number(homeScore), awayScore: Number(awayScore) }),
      });
      const marketText = data.markets ? Object.entries(data.markets).map(([market, count]) => `${market}:${count}`).join("，") : "";
      setMessage(`赛果已更新，并结算 ${data.settled.length} 单${marketText ? `（${marketText}）` : ""}`);
      setHomeScore("");
      setAwayScore("");
      await loadDashboard();
      setActive("bets");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新赛果失败");
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

  async function deleteUser(userId: string, name: string) {
    if (!window.confirm(`确定删除玩家「${name}」吗？这会删除他的账号、下注记录和资金流水，并禁用对应邀请码。`)) return;
    setLoading(true);
    try {
      const data = await request("/api/admin/users/delete", { method: "POST", body: JSON.stringify({ userId }) });
      setMessage(`已删除玩家 ${data.user}，移除 ${data.removed.bets} 条下注、${data.removed.transactions} 条流水`);
      await loadDashboard();
      setActive("players");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除玩家失败");
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
          <p>管理邀请码、玩家余额、下注记录、结算流水、赛果和冠军赔率。</p>
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
            <button className="button secondary" onClick={refreshOdds} disabled={loading}><RefreshCw size={16} /> 刷新赔率/赛程</button>
            <button className="button secondary" onClick={refreshIntelligence} disabled={loading}><Bot size={16} /> 生成AI情报</button>
            <button className="button secondary" onClick={forceRefreshIntelligence} disabled={loading}><Bot size={16} /> 强制刷新24小时AI</button>
            <input className="input" value={inviteNote} onChange={(event) => setInviteNote(event.target.value)} placeholder="本批邀请码备注，可选" />
            <button className="button secondary" onClick={generateInvites} disabled={loading}><TicketPlus size={16} /> 生成100个邀请码</button>
            <button className="button secondary" onClick={() => exportData("players")} disabled={loading}><Download size={16} /> 导出玩家汇总</button>
            <button className="button secondary" onClick={() => exportData("bets")} disabled={loading}><Download size={16} /> 导出下注明细</button>
            <button className="button secondary" onClick={() => exportData("transactions")} disabled={loading}><Download size={16} /> 导出资金流水</button>
            <button className="button secondary" onClick={() => exportData("json")} disabled={loading}><Download size={16} /> 导出完整数据</button>
            <label className={`button secondary admin-upload ${loading ? "disabled" : ""}`}>
              <Download size={16} /> 导入完整数据
              <input type="file" accept="application/json,.json" disabled={loading} onChange={(event) => importDatabase(event.target.files?.[0])} />
            </label>
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
            <button className="button secondary admin-reset-button" onClick={resetAllBalances} disabled={loading}>一键恢复所有人到3000分</button>
            <button className="button secondary admin-danger-reset-button" onClick={resetInitialState} disabled={loading}>一键恢复到初始状态</button>
          </section>

          <section className="admin-panel wide">
            <div className="admin-tabs">
              {[
                ["players", "玩家"],
                ["bets", "下注记录"],
                ["settlements", "结算流水"],
                ["results", "赛果更新"],
                ["invites", "邀请码"],
                ["outrights", "冠军赔率"],
                ["aiContest", "AI下注王"],
              ].map(([id, label]) => (
                <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id as ActiveTab)}>{label}</button>
              ))}
            </div>

            {active === "bets" || active === "settlements" ? (
              <label className="admin-search">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索玩家、订单号、比赛或状态" />
              </label>
            ) : null}

            {active === "players" ? <PlayersTable users={dashboard.users} onDelete={deleteUser} /> : null}
            {active === "bets" ? <BetsTable bets={filteredBets} onCancel={cancelBet} /> : null}
            {active === "settlements" ? <TransactionsTable transactions={filteredTransactions} /> : null}
            {active === "results" ? <ResultsPanel matches={dashboard.matches} matchId={resultMatchId} setMatchId={setResultMatchId} homeScore={homeScore} setHomeScore={setHomeScore} awayScore={awayScore} setAwayScore={setAwayScore} onSave={updateMatchResult} /> : null}
            {active === "invites" ? <InvitesTable invites={dashboard.invites} onSaveNote={saveInviteNote} /> : null}
            {active === "aiContest" ? <AiContestPanel contest={aiContest} onLoad={loadAiContest} onAction={aiContestAction} loading={loading} /> : null}
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

function PlayersTable({ users, onDelete }: { users: UserRow[]; onDelete: (userId: string, name: string) => void }) {
  return <Table headers={["玩家", "邀请码", "余额", "下注", "待结算", "总投注", "净盈亏", "最后登录", "操作"]}>{users.map((u) => <tr key={u.id}><td><strong>{u.displayName}</strong></td><td>{u.inviteCode}</td><td>{formatPoints(u.balance)}</td><td>{u.totalBets}</td><td>{u.pendingBets}</td><td>{formatPoints(u.totalStake)}</td><td className={u.netProfit >= 0 ? "profit" : "loss"}>{u.netProfit > 0 ? "+" : ""}{formatPoints(u.netProfit)}</td><td>{formatTime(u.lastLoginAt)}</td><td><button className="mini-danger" onClick={() => onDelete(u.id, u.displayName)}><Trash2 size={13} /> 删除</button></td></tr>)}</Table>;
}

function BetsTable({ bets, onCancel }: { bets: BetRow[]; onCancel: (betId: string) => void }) {
  return <Table headers={["订单", "玩家", "比赛", "投注项", "金额", "赔率", "状态", "盈亏", "时间", "操作"]}>{bets.map((b) => <tr key={b.id}><td>{b.orderNo}</td><td>{b.userName}</td><td>{b.matchTitle}{b.score ? <span className="admin-score"> {b.score}</span> : null}</td><td>{b.selectionLabel}</td><td>{formatPoints(b.stake)}</td><td>{b.price.toFixed(2)}</td><td>{statusText[b.status] || b.status}</td><td className={b.profit >= 0 ? "profit" : "loss"}>{b.status === "pending" ? "-" : `${b.profit > 0 ? "+" : ""}${formatPoints(b.profit)}`}</td><td>{formatTime(b.createdAt)}</td><td>{b.status === "pending" ? <button className="mini-danger" onClick={() => onCancel(b.id)}><Ban size={13} /> 取消</button> : "-"}</td></tr>)}</Table>;
}

function TransactionsTable({ transactions }: { transactions: TransactionRow[] }) {
  return <Table headers={["时间", "玩家", "类型", "订单", "变动", "余额", "备注"]}>{transactions.map((tx) => <tr key={tx.id}><td>{formatTime(tx.createdAt)}</td><td>{tx.userName}</td><td>{txText[tx.type] || tx.type}</td><td>{tx.orderNo || "-"}</td><td className={tx.amount >= 0 ? "profit" : "loss"}>{tx.amount > 0 ? "+" : ""}{formatPoints(tx.amount)}</td><td>{formatPoints(tx.balance)}</td><td>{tx.note || tx.betLabel || "-"}</td></tr>)}</Table>;
}

function ResultsPanel(props: {
  matches: MatchRow[];
  matchId: string;
  setMatchId: (value: string) => void;
  homeScore: string;
  setHomeScore: (value: string) => void;
  awayScore: string;
  setAwayScore: (value: string) => void;
  onSave: () => void;
}) {
  const selected = props.matches.find((match) => match.id === props.matchId);
  return (
    <>
      <div className="admin-form-grid results-form">
        <select className="select" value={props.matchId} onChange={(event) => props.setMatchId(event.target.value)}>
          <option value="">选择比赛</option>
          {props.matches.map((match) => (
            <option value={match.id} key={match.id}>
              {formatTime(match.commenceTime)} {match.homeTeamZh} vs {match.awayTeamZh}
            </option>
          ))}
        </select>
        <input className="input" type="number" min={0} value={props.homeScore} onChange={(event) => props.setHomeScore(event.target.value)} placeholder={selected ? `${selected.homeTeamZh}进球` : "主队进球"} />
        <input className="input" type="number" min={0} value={props.awayScore} onChange={(event) => props.setAwayScore(event.target.value)} placeholder={selected ? `${selected.awayTeamZh}进球` : "客队进球"} />
        <button className="button" onClick={props.onSave}>更新并结算</button>
      </div>
      <Table headers={["时间", "比赛", "状态", "比分", "总订单", "待结算"]}>
        {props.matches.map((match) => <tr key={match.id}><td>{formatTime(match.commenceTime)}</td><td>{match.homeTeamZh} vs {match.awayTeamZh}</td><td>{match.status}</td><td>{match.homeScore !== undefined && match.awayScore !== undefined ? `${match.homeScore}:${match.awayScore}` : "-"}</td><td>{match.totalBets}</td><td>{match.pendingBets}</td></tr>)}
      </Table>
    </>
  );
}

function InvitesTable({ invites, onSaveNote }: { invites: InviteRow[]; onSaveNote: (id: string, note: string) => void }) {
  return <Table headers={["邀请码", "备注", "状态", "玩家", "余额", "创建时间", "使用时间", "操作"]}>{invites.map((i) => <InviteRowItem invite={i} onSaveNote={onSaveNote} key={i.id} />)}</Table>;
}

function InviteRowItem({ invite, onSaveNote }: { invite: InviteRow; onSaveNote: (id: string, note: string) => void }) {
  const [note, setNote] = useState(invite.note || "");
  return (
    <tr>
      <td><strong>{invite.code}</strong></td>
      <td><input className="input invite-note-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="只在后台可见" /></td>
      <td>{invite.status === "used" ? "已使用" : invite.status === "disabled" ? "已停用" : "未使用"}</td>
      <td>{invite.user?.displayName || "-"}</td>
      <td>{invite.user ? formatPoints(invite.user.balance) : "-"}</td>
      <td>{formatTime(invite.createdAt)}</td>
      <td>{formatTime(invite.usedAt)}</td>
      <td><button className="mini-button" onClick={() => onSaveNote(invite.id, note)}>保存备注</button></td>
    </tr>
  );
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

function AiContestPanel({
  contest,
  onLoad,
  onAction,
  loading,
}: {
  contest: AiContest | null;
  onLoad: () => void;
  onAction: (action: "init" | "run" | "reset") => void;
  loading: boolean;
}) {
  return (
    <>
      <div className="admin-form-grid">
        <button className="button secondary" onClick={onLoad} disabled={loading}>刷新AI沙盒</button>
        <button className="button secondary" onClick={() => onAction("init")} disabled={loading}>初始化模型账户</button>
        <button className="button" onClick={() => onAction("run")} disabled={loading}>未来24小时下注</button>
        <button className="button secondary admin-danger-reset-button" onClick={() => onAction("reset")} disabled={loading}>重置AI大赛</button>
      </div>

      {!contest ? <p className="muted">先点击“刷新AI沙盒”。这里的数据独立于真人玩家和真人下注。</p> : null}

      {contest ? (
        <>
          <h3 className="admin-subtitle">模型配置</h3>
          <Table headers={["模型", "供应商", "Model", "Key变量", "Key状态"]}>
            {contest.configuredModels.map((model) => (
              <tr key={model.id}>
                <td><strong>{model.name}</strong></td>
                <td>{model.provider}</td>
                <td>{model.model}</td>
                <td>{model.apiKeyEnv}</td>
                <td>{model.hasKey ? "已配置" : "缺少Key"}</td>
              </tr>
            ))}
            {contest.configuredModels.length === 0 ? <tr><td colSpan={5}>暂无模型。配置 AI_CONTEST_MODELS 或 LLM_API_KEY 后再初始化。</td></tr> : null}
          </Table>

          <h3 className="admin-subtitle">AI积分榜</h3>
          <Table headers={["AI", "余额", "盈亏", "状态", "下注", "待结算", "流派", "策略", "资金管理", "错误"]}>
            {contest.agents.map((agent) => (
              <tr key={agent.id}>
                <td><strong>{agent.name}</strong><br /><span className="muted">{agent.model}</span></td>
                <td>{formatPoints(agent.balance)}</td>
                <td className={agent.profit >= 0 ? "profit" : "loss"}>{agent.profit > 0 ? "+" : ""}{formatPoints(agent.profit)}</td>
                <td>{agent.status}</td>
                <td>{agent.totalBets}</td>
                <td>{agent.pendingBets}</td>
                <td>{agent.strategyType || "-"}</td>
                <td>{agent.strategy || "-"}</td>
                <td>{agent.bankrollRule || "-"}</td>
                <td>{agent.error || "-"}</td>
              </tr>
            ))}
          </Table>

          <h3 className="admin-subtitle">AI下注记录</h3>
          <Table headers={["时间", "AI", "比赛", "投注项", "金额", "赔率", "信心", "状态", "盈亏", "理由"]}>
            {contest.bets.slice(0, 80).map((bet) => (
              <tr key={bet.id}>
                <td>{formatTime(bet.createdAt)}</td>
                <td>{bet.agentName}</td>
                <td>{bet.matchTitle}</td>
                <td>{bet.selectionLabel}</td>
                <td>{formatPoints(bet.stake)}</td>
                <td>{bet.price.toFixed(2)}</td>
                <td>{bet.confidence}</td>
                <td>{statusText[bet.status] || bet.status}</td>
                <td className={bet.profit >= 0 ? "profit" : "loss"}>{bet.status === "pending" ? "-" : `${bet.profit > 0 ? "+" : ""}${formatPoints(bet.profit)}`}</td>
                <td>{bet.reason || "-"}</td>
              </tr>
            ))}
          </Table>

          <h3 className="admin-subtitle">赛前讨论</h3>
          <Table headers={["时间", "AI", "比赛", "立场", "关键点", "可考虑玩法", "风险"]}>
            {contest.discussions.slice(0, 80).map((discussion) => (
              <tr key={discussion.id}>
                <td>{formatTime(discussion.createdAt)}</td>
                <td>{discussion.agentName}</td>
                <td>{discussion.matchTitle}</td>
                <td>{discussion.stance}</td>
                <td>{discussion.keyPoints.join(" / ") || "-"}</td>
                <td>{discussion.preferredAngles.join(" / ") || "-"}</td>
                <td>{discussion.error || discussion.riskWarning || "-"}</td>
              </tr>
            ))}
          </Table>

          <h3 className="admin-subtitle">策略轮次</h3>
          <Table headers={["时间", "AI", "窗口", "比赛数", "流派", "策略", "策略变化", "资金管理", "跳过原因", "错误"]}>
            {contest.rounds.slice(0, 50).map((round) => (
              <tr key={round.id}>
                <td>{formatTime(round.createdAt)}</td>
                <td>{round.agentName}</td>
                <td>{round.windowHours}h</td>
                <td>{round.matchIds.length}</td>
                <td>{round.strategyType || "-"}</td>
                <td>{round.strategy || "-"}</td>
                <td>{round.strategyChange || "-"}</td>
                <td>{round.bankrollRule || "-"}</td>
                <td>{round.skipReason || "-"}</td>
                <td>{round.error || "-"}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : null}
    </>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
