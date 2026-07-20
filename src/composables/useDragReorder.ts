import { getHostWindow } from './hostEnv'
import { ref } from 'vue'

const DRAG_THRESHOLD = 4

export function useDragReorder() {
  const dragIdx = ref<number | null>(null)
  const dragOverIdx = ref(-1)
  const dragOverPos = ref<'top' | 'bottom'>('top')
  /** Exposed (not just used internally by scrollItemIntoView) so callers can hand this same map
   *  to useListScrollSync — one map, one source of truth for "which DOM element is item i",
   *  rather than each composable keeping its own parallel map that could drift out of sync. */
  const itemEls = new Map<number, HTMLElement>()
  let suppressClick = false

  function setItemRef(el: any, i: number) {
    if (el) itemEls.set(i, el as HTMLElement)
    else itemEls.delete(i)
  }
  /** Scrolls item `i` into view if it's currently mounted — used to react to external "show me
   *  this item" signals (e.g. tabsStore.listScrollToken) the same way Sidebar.vue's own
   *  scrollSelectedIntoView() does for the block list, shared here since useDragReorder already
   *  owns the itemEls map. No-op if `i` isn't currently rendered (filtered out, or out of range). */
  function scrollItemIntoView(i: number) {
    const el = itemEls.get(i)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
  /**
   * Uses Pointer Events rather than mouse events, so this also works when `i` is dragged via
   * touch on mobile — see usePanelResize.ts's doc comment for the same reasoning (one pointer
   * event triplet covers mouse/touch/pen uniformly).
   *
   * TOUCH vs SCROLL: touch drags are gated to the .pm-drag-handle element specifically — see
   * BlockSidebar.vue's onItemMouseDown for the full reasoning (short version: letting touch-drag
   * start anywhere on the row means it fights the browser's native scroll for the same gesture,
   * since a real scroll swipe also crosses DRAG_THRESHOLD almost immediately; requiring a small
   * dedicated handle, with `touch-action: none` set on JUST that handle in main.css, is the
   * standard fix). Mouse users keep whole-row dragging since a mouse drag never competes with a
   * scroll gesture in the first place.
   */
  function onItemMouseDown(i: number, e: PointerEvent, onDrop: (from: number, to: number, after: boolean) => void) {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
    } else if (!(e.target as HTMLElement).closest('.pm-drag-handle')) {
      return
    }
    const hostWin = getHostWindow()
    const startX = e.clientX, startY = e.clientY
    const pointerId = e.pointerId
    let dragging = false
    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        dragIdx.value = i
      }
      updateDragOver(ev.clientY)
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
      if (dragging) {
        suppressClick = true
        if (dragOverIdx.value >= 0 && dragOverIdx.value !== i) onDrop(i, dragOverIdx.value, dragOverPos.value === 'bottom')
      }
      dragIdx.value = null
      dragOverIdx.value = -1
    }
    hostWin.addEventListener('pointermove', onMove)
    hostWin.addEventListener('pointerup', onUp)
    hostWin.addEventListener('pointercancel', onUp)
  }
  function consumeSuppressClick(): boolean {
    if (suppressClick) { suppressClick = false; return true }
    return false
  }
  return { dragIdx, dragOverIdx, dragOverPos, itemEls, setItemRef, onItemMouseDown, consumeSuppressClick, scrollItemIntoView }
}
