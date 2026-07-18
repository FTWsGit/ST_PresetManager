// Tavern Helper runs injected scripts inside an `about:srcdoc` iframe, but this app's UI is
// mounted onto `window.top.document` (see main.ts) so the FAB/panel are visible on the real page.
//
// That split means every bare, unqualified `window`/`document` reference in this codebase
// actually refers to the IFRAME's window/document — NOT the one the visible UI lives in.
// For pure CSS cascade this doesn't matter (styles apply based on the live DOM tree the
// elements were inserted into, regardless of which document created them). But it silently
// breaks anything that binds to the global window/document object directly:
//   - `window.addEventListener('mousemove', ...)` for drag/resize never fires, because the
//     mouse is moving over the top document, not the iframe.
//   - `getComputedStyle(document.documentElement)` reads the IFRAME's own <html> tag, which
//     never receives any of our CSS custom properties — always falls back to defaults.
//   - `new ResizeObserver(...)` constructed from the iframe's global may not reliably observe
//     elements that live in a different document.
//
// Everywhere in this app that needs the "real" window/document should go through these
// helpers instead of using the bare globals.

import { ref, onUnmounted, type Ref } from 'vue'

let cachedWin: Window | null = null

export function getHostWindow(): Window {
  if (cachedWin) return cachedWin
  try {
    // window.top throws/denies in true cross-origin iframes, but Tavern Helper's srcdoc
    // iframe is same-origin, so this normally succeeds.
    if (window.top && window.top.document) { cachedWin = window.top; return cachedWin }
  } catch {}
  cachedWin = window
  return cachedWin
}

export function getHostDocument(): Document {
  return getHostWindow().document
}

/**
 * Copies `text` to the clipboard, working around the iframe/top-document split described above.
 * A bare `navigator.clipboard.writeText()` call runs against the IFRAME's navigator — and even
 * beyond that split, Permissions-Policy delegation for clipboard-write isn't guaranteed into an
 * about:srcdoc iframe with no `allow` attribute we control, so `navigator.clipboard` can be
 * undefined or `writeText()` can reject with a permissions error. This tries the HOST window's
 * navigator.clipboard first (same document the visible UI/user gesture actually belongs to), then
 * falls back to the legacy execCommand('copy') textarea trick via the host document — that path
 * doesn't go through the Permissions API at all, so it still works in contexts where the Clipboard
 * API itself is blocked. Resolves to false on total failure and logs the real reason to console
 * (the previous call site's `.catch()` swallowed the error entirely, which is why past failures
 * showed nothing in devtools).
 */
export async function copyToHostClipboard(text: string): Promise<boolean> {
  const hostWin = getHostWindow() as any
  try {
    if (hostWin.navigator?.clipboard?.writeText) {
      await hostWin.navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    console.warn('[st-preset-manager] navigator.clipboard.writeText failed, falling back to execCommand:', e)
  }
  try {
    const doc: Document = hostWin.document
    const ta = doc.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    doc.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = doc.execCommand('copy')
    doc.body.removeChild(ta)
    if (!ok) throw new Error('execCommand("copy") returned false')
    return true
  } catch (e) {
    console.error('[st-preset-manager] Clipboard copy failed (both navigator.clipboard and execCommand):', e)
    return false
  }
}

/** Below this width the 4-column layout (sidebar/editor/varPanel/preview side-by-side) can't
 *  fit — see main.css's off-canvas drawer / bottom-sheet layout and App.vue's
 *  mobileDrawerVisible state. Picked to sit just above typical phone widths in both
 *  orientations (390-430px portrait) while still kicking in for the narrow in-app browser
 *  viewports SillyTavern is commonly embedded in. */
export const MOBILE_BREAKPOINT = 720

/**
 * Reactive `isMobile` flag, true when the viewport is narrow enough that the desktop multi-panel
 * layout has to collapse to one panel at a time (see main.css's @media (max-width) rules, which
 * use this same breakpoint).
 *
 * Reads/listens on the HOST window, not the bare global — same reasoning as
 * usePanelResize.ts's mouse listeners: this app's own iframe (see the file-level comment above)
 * is never resized by the user, so a `resize` listener or `matchMedia` query against the bare
 * `window` would silently never fire. The real viewport the user sees is the host window's.
 */
export function useIsMobile(): Ref<boolean> {
  const hostWin = getHostWindow()
  const isMobile = ref(hostWin.innerWidth <= MOBILE_BREAKPOINT)

  function update() { isMobile.value = hostWin.innerWidth <= MOBILE_BREAKPOINT }

  // Prefer matchMedia (fires on the actual breakpoint crossing, cheaper than a resize listener
  // recomputing on every pixel), fall back to 'resize' if matchMedia is unavailable for some
  // reason on the host window. Every host environment this app actually runs in (SillyTavern's
  // browser tab, TauriTavern's WebView2, mobile in-app browsers) is modern enough to have
  // MediaQueryList.addEventListener, so no legacy addListener() shim is needed here.
  if (hostWin.matchMedia) {
    const mql = hostWin.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const onChange = () => update()
    mql.addEventListener('change', onChange)
    onUnmounted(() => mql.removeEventListener('change', onChange))
  } else {
    hostWin.addEventListener('resize', update)
    onUnmounted(() => hostWin.removeEventListener('resize', update))
  }

  return isMobile
}

