import { OutrightBetButton } from "@/components/BetSheet";
import { readDb } from "@/lib/store";

export default async function OutrightsPage() {
  const raw = readDb().outrightOdds.sort(
    (a, b) => b.fetchedAt.localeCompare(a.fetchedAt) || a.price - b.price,
  );

  const latest = Array.from(
    raw
      .reduce((map, odd) => {
        if (!map.has(odd.teamName)) map.set(odd.teamName, odd);
        return map;
      }, new Map<string, (typeof raw)[number]>())
      .values(),
  ).sort((a, b) => a.price - b.price);

  return (
    <main className="content">
      <div className="section-label">冠军竞猜</div>
      <section className="match-card">
        {latest.map((odd) => (
          <div className="outright-row" key={odd.id}>
            <strong>
              {odd.flag || ""} {odd.teamName}
            </strong>
            <OutrightBetButton
              selection={{
                kind: "outright",
                oddsId: odd.id,
                label: `${odd.teamName} 冠军`,
                price: odd.price,
              }}
            />
          </div>
        ))}
        {latest.length === 0 ? <div className="empty-state">后台还没有配置冠军赔率。</div> : null}
      </section>
    </main>
  );
}
