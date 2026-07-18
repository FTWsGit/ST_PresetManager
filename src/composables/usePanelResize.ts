import { ref, onUnmounted } from 'vue'
import { getHostWindow } from './hostEnv'

/**
 * Drag-to-resize a panel's width.
 * `getWidth`/`setWidth` let the caller decide where width is stored (store.settings, local ref, etc).
 * `dir` controls which side the handle is on: 'right' means dragging the right edge of a
 * left-anchored panel (grows width as mouse moves right); 'left' means dragging the left edge
 * of a right-anchored panel (grows width as mouse moves left, e.g. the var/preview panels).
 *
 * IMPORTANT: this app is often mounted onto window.top.document while its own script executes
 * inside a child iframe (Tavern Helper). Pointer events during the drag happen over the TOP
 * document, so listeners must be attached to the host window — not the bare global `window`,
 * which would silently never fire.
 *
 * Uses Pointer Events (not mouse events) so this also works with touch input on mobile — a
 * single pointerdown/pointermove/pointerup triplet covers mouse, touch, and pen uniformly,
 * unlike mouse events which touch browsers don't reliably dispatch for drag gestures. The
 * handle's own `touch-action: none` (see .pm-resize-handle / .pm-right-resize-handle in
 * main.css) stops the browser from also interpreting the drag as a page-scroll gesture, which
 * would otherwise fight with this handler for the same touch.
 */
export function usePanelResize(opts: {
  getWidth: () => number
  setWidth: (w: number) => void
  min: number
  max: number
  dir: 'right' | 'left'
}) {
  const active = ref(false)
  let startX = 0
  let startW = 0
  let pointerId: number | null = null
  const hostWin = getHostWindow()

  function onPointerMove(e: PointerEvent) {
    if (!active.value || (pointerId !== null && e.pointerId !== pointerId)) return
    const delta = e.clientX - startX
    const raw = opts.dir === 'right' ? startW + delta : startW - delta
    opts.setWidth(Math.max(opts.min, Math.min(opts.max, raw)))
  }
  function onPointerUp(e: PointerEvent) {
    if (!active.value || (pointerId !== null && e.pointerId !== pointerId)) return
    active.value = false
    pointerId = null
    hostWin.document.body.style.cursor = ''
    hostWin.document.body.style.userSelect = ''
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)
  }
  function onPointerDown(e: PointerEvent) {
    e.preventDefault()
    active.value = true
    pointerId = e.pointerId
    startX = e.clientX
    startW = opts.getWidth()
    hostWin.document.body.style.cursor = 'col-resize'
    hostWin.document.body.style.userSelect = 'none'
    hostWin.addEventListener('pointermove', onPointerMove)
    hostWin.addEventListener('pointerup', onPointerUp)
    hostWin.addEventListener('pointercancel', onPointerUp)
  }

  onUnmounted(() => {
    hostWin.removeEventListener('pointermove', onPointerMove)
    hostWin.removeEventListener('pointerup', onPointerUp)
    hostWin.removeEventListener('pointercancel', onPointerUp)
  })

  // Keep the old name as an alias — call sites currently do
  // `@mousedown="resize.onMouseDown"` / `@mousedown="onResizeStart"`. Those get switched to
  // `@pointerdown` per-component (so each handle also picks up `touch-action: none` in main.css
  // at the same time), but keeping this alias means nothing breaks mid-migration.
  return { active, onMouseDown: onPointerDown, onPointerDown }
}
