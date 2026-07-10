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
 * inside a child iframe (Tavern Helper). Mouse events during the drag happen over the TOP
 * document, so listeners must be attached to the host window — not the bare global `window`,
 * which would silently never fire.
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
  const hostWin = getHostWindow()

  function onMouseMove(e: MouseEvent) {
    if (!active.value) return
    const delta = e.clientX - startX
    const raw = opts.dir === 'right' ? startW + delta : startW - delta
    opts.setWidth(Math.max(opts.min, Math.min(opts.max, raw)))
  }
  function onMouseUp() {
    if (!active.value) return
    active.value = false
    hostWin.document.body.style.cursor = ''
    hostWin.document.body.style.userSelect = ''
    hostWin.removeEventListener('mousemove', onMouseMove)
    hostWin.removeEventListener('mouseup', onMouseUp)
  }
  function onMouseDown(e: MouseEvent) {
    e.preventDefault()
    active.value = true
    startX = e.clientX
    startW = opts.getWidth()
    hostWin.document.body.style.cursor = 'col-resize'
    hostWin.document.body.style.userSelect = 'none'
    hostWin.addEventListener('mousemove', onMouseMove)
    hostWin.addEventListener('mouseup', onMouseUp)
  }

  onUnmounted(() => {
    hostWin.removeEventListener('mousemove', onMouseMove)
    hostWin.removeEventListener('mouseup', onMouseUp)
  })

  return { active, onMouseDown }
}
