/**
 * subscription-refresh-coordinator.ts
 *
 * Dedupe de chamadas a /api/subscription-refresh no runtime do cliente.
 *
 * Contexto: o login dispara o refresh diretamente (src/app/page.tsx) e o
 * SubscriptionRefresher dispara outro ao montar o primeiro pathname
 * protegido — dois requests a ~1s de distância que gravam o MESMO cookie
 * (TTL 5 min). Este módulo centraliza o timestamp do último refresh para
 * que o segundo saiba que pode pular.
 *
 * Escopo de estado: variável de módulo do browser — sobrevive a navegações
 * client-side (App Router não recarrega módulos) e zera em reload/full load,
 * onde refazer o refresh é correto (cookie pode estar velho).
 */

export const SUB_REFRESH_DEDUPE_MS = 30_000;

let lastRefreshAt = 0;

/** Registra que um refresh acabou de completar (cookie recém-gravado). */
export function markSubscriptionRefreshed(): void {
  lastRefreshAt = Date.now();
}

/** true se houve refresh completo dentro da janela de dedupe. */
export function wasSubscriptionRefreshedRecently(): boolean {
  return Date.now() - lastRefreshAt < SUB_REFRESH_DEDUPE_MS;
}
