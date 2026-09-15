export const dynamic = "force-dynamic";

import { loadLegacyUnitsDashboard } from "@/lib/legacy-units-page";
import VittaDashboard from "@/components/vitta-dashboard";

export default async function VittaPage() {
  const { isAdmin, isCoordinator, initialUnits } = await loadLegacyUnitsDashboard({
    slug: "residencial-vitta",
    table: "vitta_units",
    order: ["andar_num", "bloco", "unidade"],
    requireNonEmptyUnits: true,
  });
  return <VittaDashboard isAdmin={isAdmin} isCoordinator={isCoordinator} initialUnits={initialUnits} />;
}
