"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Selection = {
  kind: "match" | "outright";
  oddsId: string;
  label: string;
  context?: string;
  price: number;
};

export function BetButton({ selection, compact = false }: { selection: Selection; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`odd-button ${compact ? "compact" : ""} ${open ? "selected" : ""}`}
        onClick={() => setOpen(true)}
      >
        <span className="odd-label">{selection.label}</span>
        <span className="odd-price">{selection.price.toFixed(2)}</span>
      </button>
      {open ? <BetSheet selection={selection} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function OutrightBetButton({ selection }: { selection: Selection }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`outright-odd-button ${open ? "selected" : ""}`}
        style={{ width: 88 }}
        onClick={() => setOpen(true)}
      >
        {selection.price.toFixed(2)}
      </button>
      {open ? <BetSheet selection={selection} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BetSheet({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const router = useRouter();
  const [stake, setStake] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const stakeAmount = Number(stake);
  const canSubmit = Number.isFinite(stakeAmount) && stakeAmount > 0;
  const payout = useMemo(
    () => (canSubmit ? Math.round(stakeAmount * selection.price) : 0),
    [canSubmit, stakeAmount, selection.price],
  );

  async function submit() {
    setLoading(true);
    setError("");

    if (!canSubmit) {
      setLoading(false);
      setError("请输入下注金额");
      return;
    }

    const response = await fetch("/api/bets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: selection.kind,
        oddsId: selection.oddsId,
        stake: stakeAmount,
      }),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "下注失败");
      return;
    }

    window.dispatchEvent(new Event("worldcup:refresh-user"));
    onClose();
    router.push("/app/bets");
    router.refresh();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bet-sheet" onClick={(event) => event.stopPropagation()}>
        <h3>确认投注</h3>
        {selection.context ? <div className="muted">{selection.context}</div> : null}
        <div className="muted">{selection.label}</div>
        <div className="sheet-row">
          <span>赔率</span>
          <strong>{selection.price.toFixed(2)}</strong>
        </div>
        <input
          className="input"
          type="number"
          min={1}
          max={3000}
          value={stake}
          placeholder="输入下注金额"
          onChange={(event) => setStake(event.target.value)}
        />
        <div className="sheet-row">
          <span>预计可赢</span>
          <strong>{canSubmit ? payout : "-"}</strong>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <button className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button" onClick={submit} disabled={loading || !canSubmit}>
            {loading ? "提交中..." : "确认"}
          </button>
        </div>
      </div>
    </div>
  );
}
