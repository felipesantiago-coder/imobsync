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
 *    Mercado Pago, Turnstile), /api/*, e requisições com Range (mídia).
 *
 * Atualização do SW: nova versão no deploy → bump manual de VERSION abaixo
 * limpa caches antigos no activate. skipWaiting + clientsClaim = ativação
 * imediata (seguro aqui: caches de navegação não existem por design).
 */
const VERSION = 'v1';
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
  if (response && response.ok) {
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
