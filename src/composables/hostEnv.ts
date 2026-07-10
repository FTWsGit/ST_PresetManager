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
