import { ref, nextTick } from 'vue'

/**
 * Double-click-to-rename: click a name to enter edit mode, an <input> replaces the label,
 * focuses and selects its text, and blur/Enter commits while Esc cancels. BlockSidebar.vue used
 * to hand-write this twice — once for block names, once for group names — with the two copies
 * differing only in which store field they read/wrote. This composable is that one
 * implementation; each caller instantiates it once per distinct rename target (block names and
 * group names stay two separate instances, since they ARE different things being renamed, not
 * two variations on one state machine — see sidebar-refactor-report.md 四.3's phrasing:
 * "本来就是不同的编辑目标，不需要合并成一个状态机").
 *
 * `getCurrentName`/`onCommit` are callbacks rather than this composable reaching into a store
 * directly, so it stays domain-agnostic — same reasoning as useDragReorder's onDrop being a
 * narrow callback rather than owning any domain-specific interpretation itself.
 */
export function useInlineRename<T>(opts: {
  getCurrentName: (id: T) => string
  onCommit: (id: T, newName: string) => void
}) {
  const editingId = ref<T | null>(null)
  const inputRef = ref<HTMLInputElement | null>(null)

  /** Bind as the edit-mode <input>'s :ref. Focuses and selects its text on mount, so typing
   *  immediately replaces the current name rather than requiring a manual select-all first. */
  function setInputRef(el: any) {
    if (el) {
      inputRef.value = el as HTMLInputElement
      nextTick(() => {
        const input = inputRef.value
        if (input) {
          input.focus()
          input.select()
        }
      })
    }
  }

  function start(id: T) {
    editingId.value = id
  }

  /** Commits on blur/Enter. Empty (whitespace-only) input is treated as "no rename" rather than
   *  clearing the name — matches the previous per-field implementations, which both skipped the
   *  store write when `newName` was falsy after trim(). */
  function finish(id: T, e: Event) {
    const input = e.target as HTMLInputElement
    const newName = input.value.trim()
    if (newName) opts.onCommit(id, newName)
    editingId.value = null
    inputRef.value = null
  }

  function cancel() {
    editingId.value = null
    inputRef.value = null
  }

  return { editingId, getCurrentName: opts.getCurrentName, setInputRef, start, finish, cancel }
}
