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
