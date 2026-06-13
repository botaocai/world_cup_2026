import { AiContestView } from "@/components/AiContestView";
import { aiContestDashboard } from "@/lib/ai-contest";

export default function AiPage() {
  return <AiContestView contest={aiContestDashboard()} />;
}
