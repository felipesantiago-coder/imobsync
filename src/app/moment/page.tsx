export const dynamic = "force-dynamic";

import { loadLegacyUnitsDashboard } from "@/lib/legacy-units-page";
import MomentDashboard from "@/components/moment-dashboard";

export default async function MomentPage() {
  const { isAdmin, isCoordinator, initialUnits } = await loadLegacyUnitsDashboard({
    slug: "moment",
    table: "moment_units",
    order: ["andar", "unidade"],
  });
  return <MomentDashboard isAdmin={isAdmin} isCoordinator={isCoordinator} initialUnits={initialUnits} />;
}
