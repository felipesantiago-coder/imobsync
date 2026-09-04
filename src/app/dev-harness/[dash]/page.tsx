/**
 * Harness de validação visual (auditoria de performance — itens adiados
 * `framer-motion → CSS` e `content-visibility`).
 *
 * Renderiza cada dashboard REAL com fixtures sintéticas (sem Supabase, sem
 * dados reais) para medição de CLS, alturas de card, bundle e captura de
 * frames de animação — antes/depois da migração para CSS.
 *
 * SEGURANÇA: esta rota não consulta banco, não expõe dado algum e é
 * eliminada em build de produção: só existe quando a variável de build
 * `NEXT_PUBLIC_VISUAL_HARNESS=1` está definida. Sem a flag, responde 404.
 * Fora do matcher do proxy (src/proxy.ts) — não interfere no middleware.
 *
 * Uso local: NEXT_PUBLIC_VISUAL_HARNESS=1 npm run build && next start
 * Parâmetros: /dev-harness/sales?floors=30&per=10 (estresse de grade)
 */

import { notFound } from "next/navigation";
import SalesDashboard from "@/components/sales-dashboard";
import VillaBiancoDashboard from "@/components/villa-bianco-dashboard";
import MomentDashboard from "@/components/moment-dashboard";
import VittaDashboard from "@/components/vitta-dashboard";
import DynamicDashboard from "@/components/dynamic-dashboard";
import {
  makeSalesRows,
  makeVillaBiancoRows,
  makeMomentRows,
  makeVittaRows,
  makeProjetoRows,
} from "@/lib/dev/fixtures";

export const dynamic = "force-dynamic";

const DASHES = ["sales", "villa-bianco", "moment", "vitta", "dynamic"] as const;
type Dash = (typeof DASHES)[number];

function clamp(n: string | undefined, fallback: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return fallback;
  return Math.min(Math.round(v), max);
}

export default async function DevHarnessPage({
  params,
  searchParams,
}: {
  params: Promise<{ dash: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NEXT_PUBLIC_VISUAL_HARNESS !== "1") notFound();

  const { dash } = await params;
  const sp = await searchParams;
  const floors = clamp(typeof sp.floors === "string" ? sp.floors : undefined, 10, 40);
  const per = clamp(typeof sp.per === "string" ? sp.per : undefined, 8, 14);

  switch (dash as Dash) {
    case "sales":
      return <SalesDashboard isAdmin initialUnits={makeSalesRows({ floors, perFloor: per })} />;
    case "villa-bianco":
      return <VillaBiancoDashboard isAdmin initialUnits={makeVillaBiancoRows({ floors, perFloor: per })} />;
    case "moment":
      return <MomentDashboard isAdmin initialUnits={makeMomentRows({ floors, perFloor: per })} />;
    case "vitta":
      return <VittaDashboard isAdmin initialUnits={makeVittaRows({ floors, perFloor: per })} />;
    case "dynamic":
      return (
        <DynamicDashboard
          empreendimentoId="dev-harness"
          empreendimentoNome="Harness Empreendimento"
          isAdmin
          initialUnits={makeProjetoRows({ floors, perFloor: per })}
        />
      );
    default:
      notFound();
  }
}
