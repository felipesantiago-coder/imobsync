/* ImobSync — Service Worker (PWA)
 *
 * Estratégias de cache (conservadoras — app orientado a dado fresco):
 *  - Navegação (documents): NETWORK-FIRST, com fallback para a página /offline.
 *    Nunca serve página de aplicação de cache — evita dado/estado desatualizado.
 *  - /_next/static/* (arquivos imutáveis com hash no nome): CACHE-FIRST.
 *    Auto-invalidação: cada deploy gera URLs novas (hash).
 *  - Demais estáticos same-origin (ícones, splashes, imagens públicas):
 *    STALE-WHILE-REVALIDATE com teto de 200 entradas (trim FIFO).
 *
 * NUNCA interceptados (rede sempre):
 *  - métodos não-GET (mutações), requisições cross-origin (Supabase,
 *    Mercado Pago, Turnstile), /api/*, requisições com Range (mídia) e
 *    payloads de navegação client-side do Next.js App Router (RSC /
 *    Next-Router-* / Next-Action).
 *
 * Atualização do SW: nova versão no deploy → bump manual de VERSION abaixo
 * limpa caches antigos no activate. skipWaiting + clientsClaim = ativação
 * imediata (seguro aqui: caches de navegação não existem por design).
 */
// v2 (auditoria login-latency): v1 cacheava payload RSC de navegação client-
// side sob a chave da rota (ex.: tela de login sob /projetos após redirect do
// proxy) — o login seguinte recebia payload errado do cache e o Next caía em
// navegação completa. v2 além de não interceptar RSC, PURGA os caches v1 já
// envenenados nos navegadores dos usuários (activate remove versões antigas).
const VERSION = 'v2';
const SHELL_CACHE = `imobsync-shell-${VERSION}`;
const ASSET_CACHE = `imobsync-assets-${VERSION}`;
const OFFLINE_URL = '/offline';
const MAX_ASSET_ENTRIES = 200;

function trimCache(cacheName, maxEntries) {
  return caches.open(cacheName).then((cache) =>
    cache.keys().then((keys) => {
      if (keys.length <= maxEntries) return undefined;
      return Promise.all(
        keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key))
      );
    })
  );
}

async function cacheInto(cacheName, request, response) {
  // redirected: resposta seguida por redirect NUNCA vai ao cache — o destino
  // do redirect (ex.: tela de login após 307 do proxy) não é o recurso pedido.
  // Defesa em profundidade; o guard RSC no fetch handler já isola os payloads
  // de navegação do roteador.
  if (response && response.ok && !response.redirected) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    trimCache(cacheName, MAX_ASSET_ENTRIES);
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // allSettled: um item ausente não pode impedir o install inteiro.
      await Promise.allSettled([
        cache.add(OFFLINE_URL),
        cache.add('/manifest.webmanifest'),
      ]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !keep.has(name)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return; // mutações: sempre rede
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase/MP/Turnstile: rede
  if (url.pathname.startsWith('/api/')) return; // APIs: rede
  if (request.headers.has('range')) return; // mídia por range: rede

  // ── Next.js App Router: navegação client-side — NUNCA interceptar ─────────
  // (auditoria login-latency): payloads RSC/prefetch respondidos por redirect
  // (sessão/assinatura stale → 307 do proxy) tinham o DESTINO final cacheado
  // sob a chave da rota ORIGINAL, com headers que casam com a navegação real
  // do roteador — o próximo login recebia o payload errado em ms e o Next
  // caía em navegação completa (reload lento). Também elimina o erro
  // "The FetchEvent ... network error response" no console.
  if (
    request.headers.has('RSC') ||
    request.headers.has('Next-Router-State-Tree') ||
    request.headers.has('Next-Router-Prefetch') ||
    request.headers.has('Next-Router-Segment-Prefetch') ||
    request.headers.has('Next-Action')
  ) return;

  // ── Navegação: network-first + fallback /offline ─────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const shell = await caches.open(SHELL_CACHE);
          const offline = await shell.match(OFFLINE_URL);
          return offline || Response.error();
        }
      })()
    );
    return;
  }

  // ── Assets imutáveis do Next (hash no nome): cache-first ──────────────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          return await cacheInto(ASSET_CACHE, request, response);
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // ── Demais estáticos same-origin: stale-while-revalidate ─────────────────
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => cacheInto(ASSET_CACHE, request, response))
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
