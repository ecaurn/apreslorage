/* Service worker « Après l'orage » — vanilla, sans étape de build.
 *
 * Stratégies par classe de ressource (docs/RECHERCHE-TECHNIQUE § 20) :
 *  - navigations (index.html) : network-first → repli cache → le joueur voit
 *    toujours la version la plus récente lorsque le réseau est là ;
 *  - /assets/* (noms hachés par Vite) : cache-first — même URL = même contenu ;
 *  - /img, /audio, /og, /icons (non hachés) : stale-while-revalidate —
 *    réponse immédiate depuis le cache, rafraîchissement en arrière-plan ;
 *  - non-GET et hors origine : jamais interceptés.
 *
 * Limitation assumée (documentée) : le précache exact des noms hachés
 * nécessiterait une injection à la construction (vite-plugin-pwa) ; ici le
 * shell précaché est index.html et le reste se remplit à l'usage.
 */
const VERSION = 'apres-l-orage-v1';
const SHELL = ['./', './index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  // Navigations : réseau d'abord, cache en repli (le shell EST le jeu).
  if (requete.mode === 'navigate') {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copie));
          return reponse;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets hachés : cache-first (immuables).
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(requete).then(
        (enCache) =>
          enCache ||
          fetch(requete).then((reponse) => {
            if (reponse.ok) {
              const copie = reponse.clone();
              caches.open(VERSION).then((c) => c.put(requete, copie));
            }
            return reponse;
          })
      )
    );
    return;
  }

  // Médias non hachés : stale-while-revalidate.
  event.respondWith(
    caches.match(requete).then((enCache) => {
      const reseau = fetch(requete)
        .then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(VERSION).then((c) => c.put(requete, copie));
          }
          return reponse;
        })
        .catch(() => enCache);
      return enCache || reseau;
    })
  );
});
