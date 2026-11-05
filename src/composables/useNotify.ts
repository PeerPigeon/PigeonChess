import { computed, ref, type Ref } from 'vue'
import type { Settings } from '@/types'

/**
 * Notifications: "Your move" and "Your game started", nothing else (no move
 * details), and only while you are away.
 *
 * - On by default when PigeonChess is installed (added to the home screen,
 *   or installed as an app); in a browser tab, off until turned on. Settings
 *   can turn them off (or on) either way.
 * - Browsers ask for permission only from a tap: the first tap anywhere asks.
 * - Your page hands its push subscription to your opponent, sealed, at the
 *   start of each game. When you are away (your page went to the background,
 *   or closed), your opponent's page asks chess.peer.ooo to push "Your move";
 *   the text is fixed there (worker/index.ts). While your page is still
 *   alive in the background it also shows the notification itself; the
 *   two replace each other (same tag), so you see one.
 */

export type NotifyKind = 'move' | 'start' | 'test'

const INSTALLED_KEY = 'pigeonchess:installed'

/**
 * Opened as the installed app (home screen, or an installed desktop app),
 * not in a browser tab: any app display mode, iOS's navigator.standalone, an
 * Android app referrer, or the manifest's start URL (?source=home). Once
 * seen, remembered for this browser.
 */
function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
  const now = modes.some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches)
    || (navigator as unknown as { standalone?: boolean }).standalone === true
    || document.referrer.startsWith('android-app://')
    || new URLSearchParams(location.search).get('source') === 'home'
  try {
    if (now) localStorage.setItem(INSTALLED_KEY, '1')
    return now || localStorage.getItem(INSTALLED_KEY) === '1'
  } catch {
    return now
  }
}

export function useNotify(settings: Ref<Settings>) {
  const available = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext
  const installed = isInstalled()
  const permission = ref<NotificationPermission>(available ? Notification.permission : 'denied')
  const subscription = ref<PushSubscriptionJSON | null>(null)
  const enabled = computed(() => available && (settings.value.notifications ?? installed))
  const on = computed(() => enabled.value && permission.value !== 'denied')
  let registration: Promise<ServiceWorkerRegistration | null> | null = null

  const register = () => {
    registration ??= available ? navigator.serviceWorker.register('/sw.js').catch((err) => { console.warn('No service worker:', err); return null }) : Promise.resolve(null)
    return registration
  }

  const serverKey = async (): Promise<Uint8Array | null> => {
    const r = await fetch('/api/push-key').then((x) => x.json()).catch(() => null) as { key?: string | null } | null
    if (!r?.key) return null
    const s = r.key.replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0))
  }

  /** Subscribe (or pick up the subscription there is) when allowed. */
  const ensure = async () => {
    if (!on.value || permission.value !== 'granted') return
    const reg = await register()
    if (!reg) return
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const key = await serverKey()
      if (!key) return
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }).catch((err) => { console.warn('No push subscription:', err); return null })
    }
    subscription.value = sub ? sub.toJSON() : null
  }

  const ask = async () => {
    if (!available) return
    permission.value = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission)
    await ensure()
  }

  /**
   * Ask on the first tap anywhere, when on and not asked yet. On a click, not
   * a pointerdown: a touch's pointerdown is not yet a user gesture to the
   * browser, and a permission request outside one is refused without asking
   * (and the refusal sticks: the site ends up blocked).
   */
  const askOnFirstTap = () => {
    if (!on.value || permission.value !== 'default') { void ensure(); return }
    const once = () => { removeEventListener('click', once, true); if (on.value && permission.value === 'default') void ask() }
    addEventListener('click', once, true)
  }

  /** Settings: turn on (asks now, a tap) or off (unsubscribes). */
  const setEnabled = async (value: boolean) => {
    settings.value.notifications = value
    if (value) { await ask(); return }
    const reg = await register()
    const sub = await reg?.pushManager.getSubscription()
    await sub?.unsubscribe().catch(() => {})
    subscription.value = null
  }

  /** Shown by this page itself (it is alive, but not in front). */
  const showHere = async (kind: NotifyKind, gameId: string) => {
    if (!on.value || permission.value !== 'granted' || document.visibilityState === 'visible') return
    const reg = await register()
    await reg?.showNotification('PigeonChess', {
      body: kind === 'start' ? 'Your game started' : 'Your move',
      tag: `pigeonchess-${gameId}`,
      icon: '/icon-192.png',
      data: { gameId },
    } as NotificationOptions).catch(() => {})
  }

  /** Ask chess.peer.ooo to notify the opponent (their subscription, which they gave us). */
  const pushTo = async (sub: unknown, kind: NotifyKind, gameId: string): Promise<'sent' | 'gone' | 'failed'> => {
    if (!sub) return 'failed'
    const r = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub, kind, gameId }) })
      .then((x) => x.json()).catch(() => null) as { ok?: boolean; gone?: boolean } | null
    return r?.ok ? 'sent' : r?.gone ? 'gone' : 'failed'
  }

  /** Where notifications stand here, in words (Settings). */
  const status = computed(() => {
    if (!available) return 'Not available in this browser.'
    if (!enabled.value) return installed ? 'Off (you turned them off).' : 'Off: this page is open in a browser tab, not the home-screen app, so they start off. Turn them on here.'
    if (permission.value === 'denied') return 'Blocked for chess.peer.ooo in this browser\'s settings: allow notifications there.'
    if (permission.value === 'default') return 'Waiting for your permission (tap anywhere, then Allow).'
    return subscription.value ? 'On: your opponents can reach you.' : 'Allowed, but not subscribed yet.'
  })

  /** Send this device a notification through the whole path (server, push service, service worker). */
  const test = async (): Promise<string> => {
    if (permission.value !== 'granted') await ask()
    await ensure()
    if (!subscription.value) return 'Not subscribed: ' + status.value
    const r = await pushTo(subscription.value, 'test', 'test')
    return r === 'sent' ? 'Sent: it should show in a few seconds (even with the page open).' : r === 'gone' ? 'The subscription was gone; try again.' : 'The server could not send it.'
  }

  if (available) void register()

  return { available, installed, on, permission, subscription, status, ensure, askOnFirstTap, setEnabled, showHere, pushTo, test }
}
