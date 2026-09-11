/**
 * excel-batch.ts
 *
 * Helpers PUROS para a persistência em lotes da importação de Excel
 * (upload-excel). Extraídos da rota para serem testáveis sem banco.
 *
 * Preservação contratada (ver tests/excel-batch.test.ts):
 *   - Última ocorrência de uma chave duplicada na planilha vence (mesmo
 *     resultado do loop sequencial de upserts, com menos requisições);
 *   - Chave de conflito = empreendimento_id + bloco + unidade (valores crus,
 *     como na constraint única do banco);
 *   - Updates dedicados com payload idêntico podem ser agrupados em um único
 *     .update().in(ids) — semanticamente igual a N updates por id.
 */

import type { ExcelRow } from "@/lib/excel-mirror";

/** Tamanho de chunk do upsert em massa em projeto_units. */
export const UPSERT_CHUNK = 100;

/** Concorrência máxima dos updates dedicados agrupados. */
export const DEDICATED_CONCURRENCY = 6;

/** Tamanho de chunk de ids por update dedicado agrupado. */
export const DEDICATED_ID_CHUNK = 100;

/** Item classificado para upsert em projeto_units. */
export type UpsertItem = {
  rowNo: number;
  unitName: string;
  key: string;
  kind: "inserted" | "updated";
  payload: ExcelRow;
};

/** Chave de conflito da constraint única (valores crus do payload). */
export function conflictKeyOf(payload: ExcelRow): string {
  const emp = String(payload.empreendimento_id ?? "");
  const bloco = payload.bloco === undefined || payload.bloco === null ? "" : String(payload.bloco);
  const unidade = String(payload.unidade ?? "");
  return `${emp}::${bloco}::${unidade}`;
}

/**
 * Remove chaves duplicadas mantendo a ÚLTIMA ocorrência (a que prevalece no
 * loop sequencial). Retorna também quantas linhas duplicadas da planilha
 * foram colapsadas — informativo para o consumidor.
 *
 * A ordem de saída segue a posição da última ocorrência, para que a ordem de
 * gravação corresponda à leitura da planilha.
 */
export function dedupeUpsertPayloads(items: UpsertItem[]): {
  unique: UpsertItem[];
  duplicatedRows: number;
} {
  const byKey = new Map<string, { item: UpsertItem; lastPos: number }>();
  let duplicatedRows = 0;
  items.forEach((item, pos) => {
    const existing = byKey.get(item.key);
    if (existing) {
      duplicatedRows += 1;
      // Substitui o payload/kind pela última ocorrência, preservando posição
      // posterior: pos sempre > existing.lastPos no loop em ordem.
      byKey.set(item.key, { item, lastPos: pos });
    } else {
      byKey.set(item.key, { item, lastPos: pos });
    }
  });

  const unique = [...byKey.values()]
    .sort((a, b) => a.lastPos - b.lastPos)
    .map((e) => e.item);

  return { unique, duplicatedRows };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += Math.max(1, size)) out.push(arr.slice(i, i + Math.max(1, size)));
  return out;
}

/** Operação de replicação dedicada para uma unidade. */
export type DedicatedOp = {
  rowNo: number;
  unitName: string;
  id: string;
  payload: Record<string, unknown>;
};

export type DedicatedGroup = {
  payloadKey: string;
  payload: Record<string, unknown>;
  ops: DedicatedOp[];
};

/**
 * Agrupa updates dedicados por payload idêntico (JSON canônico). Um grupo é
 * aplicado com .update(payload).in("id", ids) — equivalente aos updates
 * individuais, com uma fração das requisições quando a planilha é homogênea
 * (ex.: só status). Payloads distintos permanecem em grupos separados.
 */
export function groupDedicatedOps(ops: DedicatedOp[]): DedicatedGroup[] {
  const map = new Map<string, DedicatedGroup>();
  for (const op of ops) {
    const key = JSON.stringify(op.payload);
    const existing = map.get(key);
    if (existing) existing.ops.push(op);
    else map.set(key, { payloadKey: key, payload: { ...op.payload }, ops: [op] });
  }
  return [...map.values()];
}

/** Limites de entrada validados antes do processamento oneroso. */
export const MAX_EXCEL_ROWS = 10_000;
export const MAX_EXCEL_BYTES = 10 * 1024 * 1024; // 10 MiB (regra do produto)
