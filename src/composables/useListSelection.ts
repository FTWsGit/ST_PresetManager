import { getHostWindow } from './hostEnv'

export type SelectMode = 'single' | 'ctrl' | 'shift'

export interface ClickModifiers { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

/**
 * One recognizer + dispatcher for "which selection interaction is this, and what should happen" —
 * shared across every input device a list supports. A plain click, a Ctrl/Cmd+click, a
 * Shift+click, and a mobile long-press are four different GESTURES for arriving at a selection
 * mode, but once the mode is known there's exactly one place that decides what happens next:
 * `onSelect(mode, id)`. No separate "mobile" and "desktop" selection logic, and no separate
 * long-press state machine — long-press just dispatches as `'ctrl'` mode (see onPointerDown's doc
 * comment), so it goes through the exact same `onSelect` path a desktop Ctrl+click does.
 *
 * Deliberately does NOT own the actual selection state transition (no `applyMultiSelect` call in
 * here, no `selected`/`anchor` state of its own) — that's supplied by the caller via `onSelect`.
 * presetStore.selectBlock() already wraps applyMultiSelect() correctly for 'ctrl'/'shift', and is
 * called from places other than any one sidebar (search jumps, variable-nav jumps — see
 * PROJECT.md), so it has to stay the single source of truth for that transition. Reimplementing
 * that state machine a second time inside this composable would be the exact kind of duplication
 * this refactor is trying to remove, just moved one level down instead of eliminated. This
 * composable's job ends at "recognize the gesture, call the right handler with the right mode" —
 * see sidebar-refactor-report.md 四.4 step 5's own warning about getting this API wrong by
 * guessing at a fuller surface before there's a second real consumer to validate it against.
 *
 * `'single'` mode is passed through to `onSelect` as-is (not resolved internally) because this
 * app's plain-click behavior is NOT applyMultiSelect's plain-click behavior: this app always
 * selects exactly the clicked/pressed row and never clears the selection on a repeat click,
 * whereas applyMultiSelect's plain-click branch toggles the selection off if you click the sole
 * already-selected item again. That's an existing, deliberate divergence in this codebase (plain
 * clicks also open a tab / toggle a group's collapsed state, which is why they were never routed
 * through applyMultiSelect to begin with) — this composable preserves it rather than silently
 * "fixing" it into consistency with ctrl/shift.
 */
export function useListSelection<T>(opts: {
  onSelect: (mode: SelectMode, id: T) => void
  longPress?: { thresholdPx?: number; delayMs?: number; vibrate?: boolean }
}) {
  function onClick(id: T, e: ClickModifiers) {
    const mode: SelectMode = e.shiftKey ? 'shift' : (e.ctrlKey || e.metaKey) ? 'ctrl' : 'single'
    opts.onSelect(mode, id)
  }

  // ---- Long press (touch/pen off the drag handle) ----
  // Ported as-is from BlockSidebar.vue's onItemMouseDown touch/pen-off-handle branch (previously
  // duplicated inline there). Only meant to be called for pointerdowns a drag composable (e.g.
  // useDragReorder) already declined to start a drag for — same "off the handle" condition both
  // use, since .pm-drag-handle is a shared convention across every draggable list, not
  // block-specific (see useDragReorder.ts's doc comment). A completed long-press dispatches as
  // 'ctrl' mode — exactly what the previous from-scratch implementation did
  // (`store.selectBlock(i, { ctrl: true })`): toggling this item's selection is the natural
  // touch-equivalent of a desktop Ctrl+click, there isn't a separate "long-press selection rule".
  let suppressClick = false
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  }
  /** Returns whether this pointerdown was claimed for long-press tracking, so the caller can tell
   *  "I handled this" (touch/pen off the handle) from "this wasn't a long-press candidate" (mouse,
   *  or touch/pen that landed on the drag handle) without duplicating the off-handle condition
   *  itself — the caller's own pointerdown handler is expected to fall through to its drag
   *  composable when this returns false. */
  function onPointerDown(id: T, e: PointerEvent): boolean {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('.pm-drag-handle')) return false
    const hostWin = getHostWindow()
    const threshold = opts.longPress?.thresholdPx ?? 4
    const delay = opts.longPress?.delayMs ?? 200
    const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId

    // Moving past the threshold before the timer fires cancels it and lets the browser handle
    // the gesture as a normal scroll instead — we never call preventDefault, so native scroll
    // was never blocked in the first place.
    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      if (Math.abs(ev.clientX - startX) > threshold || Math.abs(ev.clientY - startY) > threshold) {
        cancelLongPress()
        hostWin.removeEventListener('pointermove', onMove)
        hostWin.removeEventListener('pointerup', onUp)
        hostWin.removeEventListener('pointercancel', onUp)
      }
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return
      cancelLongPress()
      hostWin.removeEventListener('pointermove', onMove)
      hostWin.removeEventListener('pointerup', onUp)
      hostWin.removeEventListener('pointercancel', onUp)
    }
    hostWin.addEventListener('pointermove', onMove)
    hostWin.addEventListener('pointerup', onUp)
    hostWin.addEventListener('pointercancel', onUp)

    longPressTimer = setTimeout(() => {
      longPressTimer = null
      opts.onSelect('ctrl', id)
      if (opts.longPress?.vibrate !== false && navigator.vibrate) navigator.vibrate(40)
      // A completed long-press still gets a trailing native `click` on pointerup — swallow it via
      // consumeSuppressClick(), same pattern as useDragReorder's own suppressClick.
      suppressClick = true
    }, delay)
    return true
  }

  function consumeSuppressClick(): boolean {
    if (suppressClick) { suppressClick = false; return true }
    return false
  }

  return { onClick, onPointerDown, consumeSuppressClick, cancelLongPress }
}
