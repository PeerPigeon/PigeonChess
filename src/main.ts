import { createApp } from 'vue'
import App from './App.vue'
import '@fontsource-variable/archivo/wdth.css'
import './style.css'

createApp(App).mount('#app')

// A page left open (or brought back by Safari from memory) keeps running the
// build it loaded with. It asks for version.json, never from a cache, when it
// starts, when it comes back into view and every minute, and reloads itself
// when a newer build is out: at once in the lobby, or as soon as the game in
// progress ends.
declare const __BUILD__: string
let newerBuild: string | null = null
// Load the page at an address no cache has seen (?v=<build>), so neither
// Safari nor any cache between can hand back the old page. A page already
// loaded at that address does not go round again.
const reloadWhenIdle = () => {
  if (!newerBuild) return
  const inGame = Boolean(document.querySelector('.table .seat.running'))
  if (inGame) return
  const version = newerBuild.split(',')[0]
  const url = new URL(location.href)
  if (url.searchParams.get('v') === version) return
  url.searchParams.set('v', version)
  location.replace(url.toString())
}
const checkBuild = async () => {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return
    const { build } = await response.json()
    if (build && build !== __BUILD__) newerBuild = build
  } catch { /* offline: next check */ }
  if (newerBuild) reloadWhenIdle()
}
if (import.meta.env.PROD) {
  void checkBuild()
  setInterval(checkBuild, 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkBuild() })
  window.addEventListener('pageshow', (event) => { if ((event as PageTransitionEvent).persisted) void checkBuild() })
  setInterval(() => { if (newerBuild) reloadWhenIdle() }, 5_000)
}
