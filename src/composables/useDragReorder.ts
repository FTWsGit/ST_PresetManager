import { getHostWindow } from './hostEnv'
import { ref } from 'vue'

const DRAG_THRESHOLD = 4
// Auto-scroll tuning, ported as-is from BlockSidebar.vue's handleListAutoScroll/startDragScroll:
// AUTO_SCROLL_EDGE_PX is how close to the top/bottom edge (in px) the pointer has to be before
// auto-scroll kicks in; AUTO_SCROLL_MAX_SPEED is the scroll speed (px/frame) right at the edge,
// scaled down linearly to 0 at AUTO_SCROLL_EDGE_PX away from the edge.
const AUTO_SCROLL_EDGE_PX = 70
const AUTO_SCROLL_MAX_SPEED = 40

/**
 * Pointer-based drag-to-reorder for a list, plus the "scroll item into view" helper that
 * useListScrollSync consumes. Key type is generic (`T`, defaults to `number`) so this one
 * implementation covers every domain's list: BlockSidebar keys by `gi` (a flatNodes index,
 * `number`), RegexSidebar keys by plain array index (also `number`, but semantically just "index"
 * with no flatNodes indirection), and any future identifier-keyed list (e.g. a card domain with
 * no grouping) can key by `string` directly — matches applyMultiSelect<T>()'s existing genericity
 * in utils.ts, which was already designed with this in mind (see sidebar-refactor-report.md 三).
 *
 * `dragOverIdx` uses `null` (not `-1`) as its "nothing" sentinel, since `-1` only makes sense for
 * numeric keys — a generic composable can't assume a numeric ordering exists.
 *
 * Auto-scrolling the list while dragging near its top/bottom edge is opt-in via
 * `autoScrollContainer`: pass a getter for the scrolling element (e.g. `() => listRef.value`) to
 * enable it, or omit it for a list that doesn't need it (e.g. RegexSidebar, which is short enough
 * in practice that this was never implemented for it — this composable makes it a one-line add
 * whenever that changes, rather than requiring its own from-scratch implementation the way
 * BlockSidebar's did before this extraction).
 */
export function useDragReorder<T = number>(opts?: { autoScrollContainer?: () => HTMLElement | null | undefined }) {
  const dragIdx = ref<T | null>(null)
  const dragOverIdx = ref<T | null>(null)
  const dragOverPos = ref<'top' | 'bottom'>('top')
  /** Exposed (not just used internally by scrollItemIntoView) so callers can hand this same map
   *  to useListScrollSync — one map, one source of truth for "which DOM element is item i",
   *  rather than each composable keeping its own parallel map that could drift out of sync. */
  const itemEls = new Map<T, HTMLElement>()
  let suppressClick = false
  let dragScrollRAF: number | null = null

  function setItemRef(el: any, i: T) {
    if (el) itemEls.set(i, el as HTMLElement)
    else itemEls.delete(i)
  }
  /** Scrolls item `i` into view if it's currently mounted — used to react to external "show me
   *  this item" signals (e.g. tabsStore.listScrollToken) the same way Sidebar.vue's own
   *  scrollSelectedIntoView() does for the block list, shared here since useDragReorder already
   *  owns the itemEls map. No-op if `i` isn't currently rendered (filtered out, or out of range). */
  function scrollItemIntoView(i: T) {
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

  function stopDragScroll() {
    if (dragScrollRAF) { cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null }
  }
  function startDragScroll(container: HTMLElement, speed: number) {
    if (dragScrollRAF) return
    ;(function tick() {
      container.scrollTop += speed
      dragScrollRAF = requestAnimationFrame(tick)
    })()
  }
  /** Auto-scrolls `opts.autoScrollContainer()` when the pointer is near its top/bottom edge —
   *  ported from BlockSidebar.vue's handleListAutoScroll/startDragScroll/stopDragScroll (see
   *  module doc comment above). No-op if `autoScrollContainer` wasn't passed to this composable
   *  instance, or if it currently returns null/undefined. */
  function handleListAutoScroll(clientY: number) {
    const container = opts?.autoScrollContainer?.()
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (clientY - rect.top < AUTO_SCROLL_EDGE_PX) {
      startDragScroll(container, -Math.ceil(AUTO_SCROLL_MAX_SPEED * (1 - (clientY - rect.top) / AUTO_SCROLL_EDGE_PX)))
    } else if (rect.bottom - clientY < AUTO_SCROLL_EDGE_PX) {
      startDragScroll(container, Math.ceil(AUTO_SCROLL_MAX_SPEED * (1 - (rect.bottom - clientY) / AUTO_SCROLL_EDGE_PX)))
    } else {
      stopDragScroll()
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
   *
   * `onDrop`'s job is intentionally narrow: "item `from` was dropped near item `to`, on its top
   * (`after: false`) or bottom (`after: true`) half". Any domain-specific interpretation of that
   * — e.g. BlockSidebar's group-insert semantics (dropping just inside vs. between groups) — stays
   * in the caller's `onDrop` callback, not in this composable. See sidebar-refactor-report.md 四.3.
   */
  function onItemMouseDown(i: T, e: PointerEvent, onDrop: (from: T, to: T, after: boolean) => void) {
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
      handleListAutoScroll(ev.clientY)
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
      stopDragScroll()
      if (dragging) {
        suppressClick = true
        if (dragOverIdx.value !== null && dragOverIdx.value !== i) onDrop(i, dragOverIdx.value, dragOverPos.value === 'bottom')
      }
      dragIdx.value = null
      dragOverIdx.value = null
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

