export const dynamic = "force-dynamic";

import { loadLegacyUnitsDashboard } from "@/lib/legacy-units-page";
import VillaBiancoDashboard from "@/components/villa-bianco-dashboard";

export default async function VillaBiancoPage() {
  const { isAdmin, isCoordinator, initialUnits } = await loadLegacyUnitsDashboard({
    slug: "villa-bianco",
    table: "villa_bianco_units",
    order: ["bloco", "andar", "unidade"],
  });
  return <VillaBiancoDashboard isAdmin={isAdmin} isCoordinator={isCoordinator} initialUnits={initialUnits} />;
}
