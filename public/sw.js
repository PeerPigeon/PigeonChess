// PigeonChess's service worker: notifications only (no caching).
//
// A push says only what happened, "move" (your move) or "start" (a game
// started), and which game. A tap opens PigeonChess (or brings it to the
// front), which picks the game back up.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

const TEXT = { move: 'Your move', start: 'Your game started', test: 'Notifications work' }

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const kind = data.kind === 'start' || data.kind === 'test' ? data.kind : 'move'
  event.waitUntil((async () => {
    // Nothing to say when PigeonChess is open and in front.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (kind !== 'test' && open.some((c) => c.visibilityState === 'visible' && c.focused)) return
    await self.registration.showNotification('PigeonChess', {
      body: TEXT[kind],
      tag: `pigeonchess-${data.gameId || 'game'}`,
      renotify: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { gameId: data.gameId || null },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of open) if ('focus' in c) return c.focus()
    return self.clients.openWindow('/')
  })())
})
