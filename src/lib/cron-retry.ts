/**
 * Helper de retry com backoff exponencial para operações transitoriamente
 * falíveis (ex.: query inicial do Supabase nos crons diários).
 *
 * Motivação: o cron-job.org reportou 500 intermitente no /api/cron/reconcile-mp
 * (~6 s em "Aguarde") — consistente com blip transitório de rede/Supabase na
 * query inicial. Um retry curto com backoff absorve esses blips sem máscara
 * de erro permanente (falha definitivamente continua propagada ao chamador).
 *
 * Design:
 * - A função `fn` deve LANÇAR em caso de falha (padrão throw). Para APIs que
 *   retornam `{ error }` (ex.: supabase-js), o chamador converte em throw.
 * - `retries` = número de TENTATIVAS EXTRAS após a primeira (0 = sem retry).
 * - Espera antes da n-ésima tentativa extra: baseDelayMs * 2^(n-1).
 * - Erros não são classificados: todo erro é retentado (em cron diário, o
 *   custo de retentar um erro permanente é desprezível e o código fica
 *   simples). Documentado como decisão consciente.
 */

export interface RetryOptions {
  /** Tentativas extras após a primeira falha. Default: 2. Negativo vira 0. */
  retries?: number;
  /** Espera inicial (ms) antes do 1º retry; dobra a cada retry. Default: 500. */
  baseDelayMs?: number;
  /** Callback de observação por retry (para log/testes). Recebe tentativa extra (1-based), o erro e a espera aplicada. */
  onRetry?: (attempt: number, error: unknown, waitMs: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxExtra = Math.max(0, Math.floor(opts.retries ?? 2));
  const baseDelayMs = Math.max(0, opts.baseDelayMs ?? 500);

  let attempt = 0; // tentativas já executadas
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxExtra) throw err;
      attempt++;
      const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
      opts.onRetry?.(attempt, err, waitMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
