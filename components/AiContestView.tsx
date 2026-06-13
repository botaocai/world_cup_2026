"use client";

import { Bot, Brain, ClipboardList, MessageSquareText, Trophy } from "lucide-react";
import { useState } from "react";

type Agent = {
  id: string;
  name: string;
  provider: string;
  model: string;
  balance: number;
  strategyType?: string;
  strategy?: string;
  bankrollRule?: string;
  status: string;
  error?: string;
  totalBets: number;
  pendingBets: number;
  profit: number;
};

type Bet = {
  id: string;
  agentId: string;
  agentName: string;
  type?: "match" | "outright";
  matchId?: string;
  matchTitle: string;
  selectionLabel: string;
  stake: number;
  price: number;
  confidence: string;
  reason: string;
  status: string;
  profit: number;
  createdAt: string;
};

type Discussion = {
  id: string;
  agentName: string;
  matchId: string;
  matchTitle: string;
  stance: string;
  keyPoints: string[];
  preferredAngles: string[];
  riskWarning: string;
  createdAt: string;
};

type Round = {
  id: string;
  agentName: string;
  strategyType?: string;
  strategy?: string;
  bankrollRule?: string;
  strategyChange?: string;
  skipReason?: string;
  error?: string;
  createdAt: string;
};

type MatchCard = {
  id: string;
  title: string;
  commenceTime: string;
  discussions: Discussion[];
  bets: Bet[];
};

type Contest = {
  agents: Agent[];
  bets: Bet[];
  rounds: Round[];
  discussions: Discussion[];
  matchCards: MatchCard[];
};

type TabId = "rank" | "analysis" | "bets" | "strategy";

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function statusText(status: string) {
  if (status === "pending") return "待结算";
  if (status === "won") return "赢";
  if (status === "lost") return "输";
  if (status === "void") return "走水";
  if (status === "error") return "异常";
  return status;
}

export function AiContestView({ contest }: { contest: Contest }) {
  const [activeTab, setActiveTab] = useState<TabId>("rank");
  const [selectedBetAgentId, setSelectedBetAgentId] = useState(contest.agents[0]?.id || "");
  const pendingBets = contest.bets.filter((bet) => bet.status === "pending");
  const betGroups = contest.agents.map((agent) => {
    const agentBets = contest.bets.filter((bet) => bet.agentId === agent.id);
    return {
      agent,
      pending: agentBets.filter((bet) => bet.status === "pending"),
      settled: agentBets.filter((bet) => bet.status !== "pending"),
    };
  });
  const selectedBetGroup = betGroups.find((group) => group.agent.id === selectedBetAgentId) || betGroups[0];
  const recentRounds = contest.rounds.slice(0, 12);
  const latestChangeByAgent = new Map(
    contest.rounds
      .filter((round) => round.strategyChange)
      .map((round) => [round.agentName, round.strategyChange || ""]),
  );
  const tabs: Array<{ id: TabId; label: string; icon: typeof Trophy }> = [
    { id: "rank", label: "积分榜", icon: Trophy },
    { id: "analysis", label: "比赛分析", icon: MessageSquareText },
    { id: "bets", label: "下注方案", icon: ClipboardList },
    { id: "strategy", label: "整体策略", icon: Brain },
  ];

  return (
    <main className="content ai-contest-page">
      <section className="ai-contest-hero">
        <div>
          <p>AI MODEL CUP</p>
          <h2>AI下注王</h2>
          <span>每个模型 3000 积分，先讨论，再下注，靠长期收益说话。</span>
        </div>
        <Bot size={34} />
      </section>

      <nav className="ai-contest-tabs" aria-label="AI下注王视图">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}>
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === "rank" ? (
        <section className="ai-contest-section">
          <div className="ai-section-title">
            <Trophy size={18} />
            <h3>积分榜</h3>
          </div>
          <div className="ai-agent-list">
            {contest.agents.map((agent, index) => (
              <article className="ai-agent-card" key={agent.id}>
                <div className="ai-agent-rank">{index + 1}</div>
                <div className="ai-agent-main">
                  <strong>{agent.name}</strong>
                  <span>{agent.model}</span>
                </div>
                <div className="ai-agent-score">
                  <strong>{formatPoints(agent.balance)}</strong>
                  <span className={agent.profit >= 0 ? "profit" : "loss"}>{agent.profit > 0 ? "+" : ""}{formatPoints(agent.profit)}</span>
                </div>
                {agent.strategyType ? <span className="ai-style-pill">{agent.strategyType}</span> : null}
                <p>{agent.strategy || "等待模型制定策略"}</p>
                {latestChangeByAgent.get(agent.name) ? <p className="ai-strategy-change">{latestChangeByAgent.get(agent.name)}</p> : null}
                <small>{agent.bankrollRule || "暂无资金管理规则"} · {agent.pendingBets} 笔待结算</small>
                {agent.error ? <em>{agent.error}</em> : null}
              </article>
            ))}
            {contest.agents.length === 0 ? <p className="muted">后台还没有初始化 AI 参赛模型。</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "analysis" ? (
        <section className="ai-contest-section">
          <div className="ai-section-title">
            <MessageSquareText size={18} />
            <h3>比赛分析</h3>
          </div>
          <div className="ai-match-list">
            {contest.matchCards.map((match) => (
              <article className="ai-match-card" key={match.id}>
                <header>
                  <strong>{match.title}</strong>
                  <span>{formatTime(match.commenceTime)}</span>
                </header>
                <div className="ai-discussion-list">
                  {match.discussions.length ? match.discussions.map((discussion) => (
                    <div className="ai-discussion" key={discussion.id}>
                      <b>{discussion.agentName}</b>
                      <p>{discussion.stance}</p>
                      <span>{discussion.keyPoints.join(" / ") || "暂无关键点"}</span>
                      <small>玩法：{discussion.preferredAngles.join(" / ") || "未明确"} · 风险：{discussion.riskWarning || "未说明"}</small>
                    </div>
                  )) : <p className="muted">这场还没有 AI 赛前讨论。</p>}
                </div>
                {match.bets.length ? (
                  <div className="ai-match-bets">
                    {match.bets.map((bet) => (
                      <span key={bet.id}>{bet.agentName}: {bet.selectionLabel.split(" - ").at(-1)} {bet.stake}分 @{bet.price.toFixed(2)}</span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "bets" ? (
        <section className="ai-contest-section">
          <div className="ai-section-title">
            <ClipboardList size={18} />
            <h3>下注方案</h3>
          </div>
          <div className="ai-bet-list">
            {betGroups.length ? (
              <div className="ai-model-tabs">
                {betGroups.map(({ agent }) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={(selectedBetGroup?.agent.id || "") === agent.id ? "active" : ""}
                    onClick={() => setSelectedBetAgentId(agent.id)}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            ) : null}

            {selectedBetGroup ? (
              <article className="ai-bet-agent-card" key={selectedBetGroup.agent.id}>
                <header>
                  <div>
                    <strong>{selectedBetGroup.agent.name}</strong>
                    <span>{selectedBetGroup.agent.strategyType || selectedBetGroup.agent.model}</span>
                  </div>
                  <b>{formatPoints(selectedBetGroup.agent.balance)}分</b>
                </header>

                <div className="ai-bet-block">
                  <h4>当前未结算方案</h4>
                  {selectedBetGroup.pending.length ? selectedBetGroup.pending.map((bet) => <BetLine bet={bet} key={bet.id} />) : <p className="muted">暂无未结算方案。</p>}
                </div>

                <div className="ai-bet-block settled">
                  <h4>之前已结算方案</h4>
                  {selectedBetGroup.settled.length ? selectedBetGroup.settled.slice(0, 8).map((bet) => <BetLine bet={bet} key={bet.id} />) : <p className="muted">暂无已结算方案。</p>}
                </div>
              </article>
            ) : null}
            {pendingBets.length === 0 && contest.bets.length === 0 ? <p className="muted">暂无 AI 下注方案。</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "strategy" ? (
        <section className="ai-contest-section">
          <div className="ai-section-title">
            <Brain size={18} />
            <h3>整体策略</h3>
          </div>
          <div className="ai-round-list">
            {recentRounds.map((round) => (
              <article className="ai-round-card" key={round.id}>
                <header>
                  <strong>{round.agentName}</strong>
                  <span>{formatTime(round.createdAt)}</span>
                </header>
                <p>{round.strategy || "未形成策略"}</p>
                {round.strategyType ? <b className="ai-round-type">{round.strategyType}</b> : null}
                <small>{round.strategyChange || round.bankrollRule || round.skipReason || round.error || "暂无补充"}</small>
              </article>
            ))}
            {recentRounds.length === 0 ? <p className="muted">还没有 AI 决策轮次。</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function BetLine({ bet }: { bet: Bet }) {
  return (
    <div className={`ai-bet-line ${bet.status !== "pending" ? "settled" : ""}`}>
      <div>
        <b>{bet.matchTitle}</b>
        <span>{bet.selectionLabel.replace(`${bet.matchTitle} - `, "")}</span>
      </div>
      <div className="ai-bet-meta">
        <strong>{formatPoints(bet.stake)}分 @{bet.price.toFixed(2)}</strong>
        <span className={bet.status === "won" ? "profit" : bet.status === "lost" ? "loss" : ""}>
          {statusText(bet.status)}{bet.status !== "pending" ? ` ${bet.profit > 0 ? "+" : ""}${formatPoints(bet.profit)}` : ""}
        </span>
      </div>
    </div>
  );
}
