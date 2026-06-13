type Supporter = {
  id: string;
  name: string;
  stake: number;
  netStake: number;
  lean: number;
  betCount: number;
  summary: string;
};

function initials(name: string) {
  const text = name.trim();
  if (!text) return "?";
  if (/^[\x00-\x7F]+$/.test(text)) return text.slice(0, 2).toUpperCase();
  return Array.from(text)[0] || "?";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sideText(lean: number, homeTeam: string, awayTeam: string) {
  if (lean < -0.18) return `偏${homeTeam}`;
  if (lean > 0.18) return `偏${awayTeam}`;
  return "中间派";
}

function supporterColor(seed: string) {
  const colors = ["#7b4f35", "#2f6f73", "#8c5a93", "#6d7f36", "#9a5145", "#3867a6", "#9a6a2f", "#5f5aa2"];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

export function MatchSupporters({
  homeTeam,
  awayTeam,
  supporters,
}: {
  homeTeam: string;
  awayTeam: string;
  supporters: Supporter[];
}) {
  if (!supporters.length) return null;

  const homePower = supporters
    .filter((item) => item.lean < 0)
    .reduce((sum, item) => sum + Math.abs(item.lean) * item.stake, 0);
  const awayPower = supporters
    .filter((item) => item.lean > 0)
    .reduce((sum, item) => sum + Math.abs(item.lean) * item.stake, 0);
  const totalPower = homePower + awayPower || 1;
  const homeWidth = Math.max(8, Math.round((homePower / totalPower) * 100));
  const awayWidth = Math.max(8, Math.round((awayPower / totalPower) * 100));

  return (
    <div className="supporters-panel">
      <div className="supporters-head">
        <span>支持者</span>
        <strong>{supporters.length} 人已下注</strong>
      </div>
      <div className="supporters-stage">
        <div className="supporters-side home">
          <span>{homeTeam}</span>
          <i style={{ width: `${homeWidth}%` }} />
        </div>
        <div className="supporters-rope" aria-hidden>
          <span />
        </div>
        <div className="supporters-side away">
          <span>{awayTeam}</span>
          <i style={{ width: `${awayWidth}%` }} />
        </div>
        <div className="supporters-track">
          {supporters.map((supporter, index) => {
            const left = clamp(50 + supporter.lean * 42, 6, 94);
            return (
              <div
                className="supporter-token"
                key={supporter.id}
                style={{
                  left: `${left}%`,
                  background: supporterColor(supporter.id || supporter.name),
                  zIndex: 1 + index,
                }}
                title={`${supporter.name}：${sideText(supporter.lean, homeTeam, awayTeam)}，站队值${Math.round(Math.abs(supporter.netStake))}，总下注${supporter.stake}分，${supporter.summary}`}
              >
                {initials(supporter.name)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
