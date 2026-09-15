export const dynamic = "force-dynamic";

import { loadLegacyUnitsDashboard } from "@/lib/legacy-units-page";
import SalesDashboard from "@/components/sales-dashboard";

export default async function EspelhoPage() {
  const { isAdmin, isCoordinator, initialUnits } = await loadLegacyUnitsDashboard({
    slug: "espelho",
    table: "units",
    order: ["andar", "unidade"],
  });
  return <SalesDashboard isAdmin={isAdmin} isCoordinator={isCoordinator} initialUnits={initialUnits} />;
}
