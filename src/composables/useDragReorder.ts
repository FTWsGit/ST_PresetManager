import { getHostWindow } from './hostEnv'
import { ref } from 'vue'

const DRAG_THRESHOLD = 4

export function useDragReorder() {
  const dragIdx = ref<number | null>(null)
  const dragOverIdx = ref(-1)
  const dragOverPos = ref<'top' | 'bottom'>('top')
  const itemEls = new Map<number, HTMLElement>()
  let suppressClick = false

  function setItemRef(el: any, i: number) {
    if (el) itemEls.set(i, el as HTMLElement)
    else itemEls.delete(i)
  }
  function updateDragOver(clientY: number) {
    for (const [idx, el] of itemEls) {
      const r = el.getBoundingClientRect()
      if (clientY >= r.top && clientY <= r.bottom) {
        dragOverIdx.value = idx
        dragOverPos.value = clientY < r.top + r.height / 2 ? 'top' : 'bottom'
        return
      }
    }
  }
  function onItemMouseDown(i: number, e: MouseEvent, onDrop: (from: number, to: number, after: boolean) => void) {
    if (e.button !== 0) return
    const hostWin = getHostWindow()
    const startX = e.clientX, startY = e.clientY
    let dragging = false
    function onMove(ev: MouseEvent) {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        dragIdx.value = i
      }
      updateDragOver(ev.clientY)
    }
    function onUp() {
      hostWin.removeEventListener('mousemove', onMove)
      hostWin.removeEventListener('mouseup', onUp)
      if (dragging) {
        suppressClick = true
        if (dragOverIdx.value >= 0 && dragOverIdx.value !== i) onDrop(i, dragOverIdx.value, dragOverPos.value === 'bottom')
      }
      dragIdx.value = null
      dragOverIdx.value = -1
    }
    hostWin.addEventListener('mousemove', onMove)
    hostWin.addEventListener('mouseup', onUp)
  }
  function consumeSuppressClick(): boolean {
    if (suppressClick) { suppressClick = false; return true }
    return false
  }
  return { dragIdx, dragOverIdx, dragOverPos, setItemRef, onItemMouseDown, consumeSuppressClick }
}
