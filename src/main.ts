// src/main.ts
;(globalThis as any).process = (globalThis as any).process || { env: {} }

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import mainCss from './styles/main.css?inline'
import { getHostDocument } from './composables/hostEnv'

function mount() {
  // 酒馆助手在 iframe (about:srcdoc) 里执行脚本
  // 必须挂到顶层文档，否则 FAB 在 iframe 里看不到
  const targetDoc = getHostDocument()

  // Inject the stylesheet as a plain string BEFORE creating/mounting anything.
  // We import the CSS with `?inline` (Vite gives it back as a raw string, with no
  // automatic runtime injection into *this* document) and write it into the target
  // document ourselves. This avoids the previous approach of waiting for a plugin to
  // inject a <style> tag into the iframe's own document and then cloning it over —
  // that had a real race condition (the clone could run before or after injection)
  // and, even when it "worked", was one extra layer of indirection for no benefit.
  if (!targetDoc.getElementById('st-preset-manager-style')) {
    const style = targetDoc.createElement('style')
    style.id = 'st-preset-manager-style'
    style.textContent = mainCss
    targetDoc.head!.appendChild(style)
  }

  const el = targetDoc.createElement('div')
  el.id = 'st-preset-manager'
  // Appended to <html> (documentElement), not <body>, AND given its own explicit
  // position:fixed + huge z-index here (inline, so nothing in main.css can accidentally lose
  // this cascade fight) rather than leaving it as a plain unstyled div. This spot used to just
  // rely on being appended after <body> in DOM order to paint on top — that turned out not to
  // be enough. Confirmed by live device testing (not guesswork): in SillyTavern's own mobile
  // theme, <body> itself is made `position:fixed` (a common trick to stop the page shifting
  // when the on-screen keyboard opens/closes). `position:fixed` ALWAYS creates a new stacking
  // context, regardless of z-index — so <body> becomes its own stacking context containing
  // things like the chat's #send_textarea, and a later-in-DOM-order but NON-positioned sibling
  // (which is what this div was before this change) paints in the "in-flow, non-positioned"
  // layer, which is BELOW any positioned stacking context's layer in the CSS painting order —
  // completely independent of which one is later in the DOM. Source order only decides ties
  // WITHIN the same layer. So our own UI was rendering, in the right place, just permanently
  // buried under <body>'s own stacking context (e.g. the chat's #send_textarea), which is why
  // it looked identical to "not rendering at all" or "not clickable".
  //
  // The fix has two parts, both required:
  //  1. `position:fixed` + explicit `width:100vw;height:100vh` (NOT `inset:0`) here on the
  //     OUTERMOST wrapper. `vw`/`vh` units are always resolved against the true visual
  //     viewport, unlike `inset:0`/percentages, which resolve against whatever this element's
  //     *containing block* turns out to be — and per the CSS spec, a `position:fixed`
  //     element's containing block becomes the nearest ancestor with a `transform` set, not
  //     necessarily the viewport, if such an ancestor exists (see the <html> transform check
  //     below — this is exactly what was happening: <html> had `transform: matrix(1,0,0,1,0,0)`,
  //     a literal identity matrix, but still a non-'none' computed value, and with no height in
  //     normal flow once <body> itself became position:fixed, `inset:0`/`bottom:24px`-style
  //     math against THAT collapsed box was landing off-screen). vw/vh sidesteps the whole
  //     containing-block question.
  //  2. An explicit numeric `z-index` (not `auto`) on this SAME element. `position:fixed` with
  //     `z-index:auto` still creates a stacking context, but it's placed in the "z-index 0 /
  //     auto" painting layer, ordered by DOM position among ties in THAT layer — apparently not
  //     reliably enough above <body>'s own same-layer stacking context in practice. An explicit
  //     positive z-index moves it into the strictly-higher "positive z-index" painting layer,
  //     which outranks the auto/0 layer unconditionally, regardless of DOM order.
  // Append to <body> (not <html>) — on mobile ST themes, <body> is position:fixed
  // and browsers elevate it to a special viewport-layer above <html>'s other
  // children when <html> has a transform. Being INSIDE <body> lets our z-index
  // compete within <body>'s stacking context instead of losing to <body> itself.
  // Every actual UI element inside (.pm-fab, .pm-panel, the mobile drawers/sheets, etc.) is
  // `position:absolute` in main.css, not `fixed` — they resolve against THIS single positioned,
  // viewport-sized anchor, so there's only one stacking-context boundary to reason about instead
  // of one per element (each of which would otherwise have had to independently win the same
  // fight against <body> that this element now wins once).
  el.style.position = 'fixed'
  el.style.top = '0'
  el.style.left = '0'
  el.style.width = '100vw'
  el.style.height = '100vh'
  el.style.height = '100dvh' // dynamic viewport height for mobile nav-bar safety
  el.style.zIndex = '2147483647' // max valid CSS z-index
  el.style.pointerEvents = 'none' // covers the full screen at all times now — see main.css's
  // pointer-events:auto on .pm-fab/.pm-panel/.pm-var-popup, the only parts of this that are
  // ever actually visible, so clicks anywhere else on the host page still reach it normally.
  targetDoc.body.appendChild(el)

  // One-time diagnostic: vw/vh sizing above already keeps this correctly sized regardless of
  // <html>'s transform, and top:0/left:0 lands correctly as long as that transform doesn't
  // actually translate anything (an identity matrix, a scale, a rotation about the origin, etc.
  // are all fine). The one case this DOESN'T cover is <html> being translated by a real, nonzero
  // amount — that would still offset top:0/left:0 away from the true viewport corner. Log it so
  // a future "FAB is offset in this host" report has an actual lead instead of starting from
  // zero again.
  try {
    const htmlStyle = targetDoc.defaultView?.getComputedStyle(targetDoc.documentElement)
    if (htmlStyle && (htmlStyle.transform !== 'none' || htmlStyle.perspective !== 'none' || htmlStyle.willChange.includes('transform') || htmlStyle.filter !== 'none')) {
      console.warn('[st-preset-manager] Host <html> has a transform/perspective/filter/will-change set. Sizing (vw/vh) is unaffected, but if that transform includes an actual translation, this UI\'s top-left corner may be offset from the real viewport corner. Host page CSS is the cause, not this extension.')
    }
  } catch (e) {
    // getComputedStyle across documents can throw in stricter embedding contexts; this check is
    // best-effort diagnostics only, never worth failing the actual mount over.
  }

  const app = createApp(App)
  app.use(createPinia())
  app.mount(el)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
