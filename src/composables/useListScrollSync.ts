import { watch, nextTick } from 'vue'
import { useTabsStore } from '../stores/tabsStore'

/**
 * Watches tabsStore.listScrollToken[domain] and scrolls whatever item currently maps to
 * `tabsStore.activeTab.key` into view. Both BlockSidebar and RegexSidebar used to hand-roll
 * their own version of this watch — RegexSidebar always resolved its scroll target from
 * `activeTab.key` (correct), while BlockSidebar scrolled to `store.selectedGi`'s smallest
 * member instead (a leftover from the pre-tabs architecture, where "selected" and "displayed"
 * were the same thing — see sidebar-refactor-report.md 一/1.2 for the full history). Once
 * `selectedGi` and `activeTab` were split into independent state, that assumption silently
 * broke: clicking an already-open tab in TabBar ticks the scroll token but never touches
 * `selectedGi`, so the old BlockSidebar logic scrolled to a stale selection instead of the tab
 * that was just focused.
 *
 * This composable is the structural fix: there is exactly one implementation of "resolve the
 * scroll target from the active tab, then scroll it into view", and every domain's sidebar
 * calls it with a `keyOf()` that converts `activeTab.key` (always a string identifier) into
 * whatever key type that sidebar's itemEls map uses. Regex sidebars use identifiers directly as
 * their key (`keyOf: () => activeTab.key`); block sidebars key their DOM refs by `gi` (a
 * flatNodes index), so they pass `keyOf: () => store.identifierToGi(activeTab.key)`.
 *
 * Only fires while `domain` matches the currently active tab's domain, mirroring both sidebars'
 * previous guard — a scroll-token tick for a different domain (e.g. a regex tab focused while
 * the block scroll token is untouched) should not cause this sidebar to scroll to something
 * stale or unrelated.
 */
export function useListScrollSync<T>(opts: {
  domain: string
  itemEls: Map<T, HTMLElement>
  keyOf: () => T | null | undefined
}) {
  const tabsStore = useTabsStore()
  watch(() => tabsStore.listScrollToken[opts.domain], () => {
    nextTick(() => {
      if (!tabsStore.activeTab || tabsStore.activeTab.domain !== opts.domain) return
      const key = opts.keyOf()
      if (key == null) return
      const el = opts.itemEls.get(key)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  })
}
