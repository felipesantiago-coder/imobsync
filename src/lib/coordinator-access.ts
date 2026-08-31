/**
 * coordinator-access.ts
 *
 * Verifica se um coordenador tem acesso a um empreendimento específico
 * usando a tabela coordenador_empreendimentos.
 *
 * Toda lógica centralizada aqui para evitar duplicação.
 */

import { createAdminClient } from '@/lib/supabase/admin';

// Cache em memória de slug → UUID (dura a vida do function invocation)
const slugToUuidCache = new Map<string, string>();

/**
 * Resolve um slug ou UUID de empreendimento para UUID.
 * Se for UUID (formato xxxxxxxx-xxxx-...), retorna como está.
 * Se for slug, busca na tabela empreendimentos.
 */
async function resolveEmpreendimentoId(slugOrId: string): Promise<string | null> {
  // Já é UUID?
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slugOrId)) {
    return slugOrId;
  }

  // Cache?
  const cached = slugToUuidCache.get(slugOrId);
  if (cached) return cached;

  const admin = createAdminClient();
  const { data } = await admin
    .from('empreendimentos')
    .select('id')
    .eq('slug', slugOrId)
    .maybeSingle();

  if (data) {
    const uuid = (data as { id: string }).id;
    slugToUuidCache.set(slugOrId, uuid);
    return uuid;
  }

  return null;
}

/**
 * Retorna os IDs dos empreendimentos atribuídos a um coordenador.
 * Retorna [] (acesso negado) se a tabela não existir (migration ainda não executada).
 * Design fail-closed: na ausência de informação, nega acesso.
 */
export async function getCoordenadorEmpreendimentos(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('coordenador_empreendimentos')
    .select('empreendimento_id')
    .eq('coordenador_id', userId);

  // Se a tabela não existir, error.code será '42P01'
  if (error) {
    const code = (error as unknown as Record<string, unknown>)?.code;
    if (code === '42P01') {
      console.warn('[coordinator-access] Tabela coordenador_empreendimentos não existe. Acesso negado (fail-closed).');
      return []; // tabela não existe = acesso negado (fail-closed)
    }
    console.error('[coordinator-access] Erro ao buscar empreendimentos:', error.message);
    return [];
  }

  if (!data) return [];
  return data.map((r: { empreendimento_id: string }) => r.empreendimento_id);
}

/**
 * Verifica se um coordenador tem acesso a um empreendimento específico.
 * Aceita tanto slug ('villa-bianco') quanto UUID.
 * Retorna true apenas se o coordenador tem o empreendimento atribuído.
 * Design fail-closed: se a tabela não existir, retorna false.
 */
export async function coordenadorHasAccess(
  userId: string,
  slugOrId: string
): Promise<boolean> {
  const uuid = await resolveEmpreendimentoId(slugOrId);
  if (!uuid) return false;

  const assigned = await getCoordenadorEmpreendimentos(userId);
  return assigned.includes(uuid);
}
