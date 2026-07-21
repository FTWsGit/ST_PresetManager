<template>
  <aside class="pm-sidebar" ref="sidebarRef" :class="{ 'pm-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: store.settings.sidebarWidth + 'px' }">
    <div class="pm-sidebar-header">
      <span>{{ store.t('block.sidebar.title', { count: store.order.length }) }}</span>
      <ListToolbar :count="store.prompts.length">
        <button class="pm-btn" @click="store.addBlock()">{{ store.t('block.sidebar.newBlock') }}</button>
        <button class="pm-btn" @click="store.hiddenOpen = true">{{ store.t('block.sidebar.hiddenBlock') }}</button>
      </ListToolbar>
      <div class="pm-sidebar-tools">
        <button class="pm-btn" :disabled="!canBind" @click="store.bindSelected()">{{ store.t('block.sidebar.bind') }}</button>
        <button class="pm-btn" :disabled="!canUnbind" @click="unbindCurrent()">{{ store.t('block.sidebar.unbind') }}</button>
      </div>
    </div>
    <div class="pm-block-list" ref="listRef">
      <template v-for="(node, gi) in store.flatNodes" :key="nodeKey(node, gi)">
        <!-- Group Header -->
        <div v-if="node.isGroup"
             :ref="(el) => setItemRef(el, gi)"
             class="pm-group-header"
             :class="{ selected: store.selectedGi.has(gi), disabled: !(node.ref as OrderGroup).enabled, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom' }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="pm-group-toggle" :class="{ collapsed: (node.ref as OrderGroup).collapsed }" @click.stop="onGroupToggle(gi)">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span v-if="editingGroupGi !== gi" class="pm-block-name" @dblclick.stop="startEditGroupName(gi)">{{ (node.ref as OrderGroup).name }}</span>
          <input v-else
                 :ref="(el) => setGroupNameInput(el, gi)"
                 class="pm-group-name-input"
                 :value="(node.ref as OrderGroup).name"
                 @blur="finishEditGroupName(gi, $event)"
                 @keydown.enter.prevent="finishEditGroupName(gi, $event)"
                 @keydown.esc.prevent="cancelEditGroupName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="pm-group-count">{{ (node.ref as OrderGroup).children.length }}</span>
          <span class="pm-block-actions">
            <span class="pm-block-act" @click.stop="store.toggleBlock(gi)">👁</span>
            <span class="pm-block-act del" @click.stop="store.deleteBlock(gi)">🗑</span>
          </span>
        </div>
        <!-- Block Item -->
        <div v-else
             :ref="(el) => setItemRef(el, gi)"
             class="pm-block-item"
             :class="{ selected: store.selectedGi.has(gi), disabled: !(node.ref as OrderItem).enabled, dragging: dragIdx === gi, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom', nested: node.depth > 0 }"
             :style="itemStyle(node)"
             @pointerdown="onItemMouseDown(gi, $event)"
             @click="onItemClick(gi, $event)">
          <span class="pm-drag-handle">⠿</span>
          <span class="pm-toggle-sw" :class="{ on: (node.ref as OrderItem).enabled }" @click.stop="store.toggleBlock(gi)"></span>
          <span v-if="editingBlockGi !== gi" class="pm-block-name" @dblclick.stop="startEditBlockName(gi)">
            {{ getBlock((node.ref as OrderItem).identifier)?.name || (node.ref as OrderItem).identifier }}
          </span>
          <input v-else
                 :ref="(el) => setBlockNameInput(el, gi)"
                 class="pm-block-name-input"
                 :value="getBlock((node.ref as OrderItem).identifier)?.name || (node.ref as OrderItem).identifier"
                 @blur="finishEditBlockName(gi, $event)"
                 @keydown.enter.prevent="finishEditBlockName(gi, $event)"
                 @keydown.esc.prevent="cancelEditBlockName()"
                 @click.stop
                 @pointerdown.stop />
          <span class="pm-block-role" :class="roleClass((node.ref as OrderItem).identifier)">{{ getBlock((node.ref as OrderItem).identifier)?.role || 'system' }}</span>
          <span class="pm-block-actions">
            <span class="pm-block-act" @click.stop="store.hideBlock(gi)">👁</span>
            <span class="pm-block-act del" @click.stop="store.deleteBlock(gi)">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="pm-resize-handle" :class="{ active: resize.active.value }" @pointerdown="onResizeStart"></div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import type { OrderItem, OrderGroup, FlatNode } from '../../types'
import { usePanelResize } from '../../composables/usePanelResize'
import { roleClass as roleClassOf } from '../../utils'
import { useTabsStore } from '../../stores/tabsStore'
import { useListScrollSync } from '../../composables/useListScrollSync'
import { useDragReorder } from '../../composables/useDragReorder'
import { useInlineRename } from '../../composables/useInlineRename'
import { useListSelection } from '../../composables/useListSelection'
import ListToolbar from '../shared/ListToolbar.vue'

// Explicit prop rather than relying on Vue's automatic class/attr fallthrough from the parent:
// this component's <template> has TWO root nodes (<aside> + the sibling .pm-resize-handle div,
// see the very end of the template) — Vue only auto-inherits a parent's :class/attrs onto a
// component's root when there's exactly ONE root; for multi-root ("fragment") components it's
// simply dropped, silently, with no warning in this case since :class specifically is what's
// affected. App.vue passing :class="{ 'pm-mobile-drawer-open': ... }" on <BlockSidebar /> would
// never have reached the <aside> either way — hence this prop, bound directly on <aside> below.
const props = defineProps<{ mobileDrawerOpen?: boolean }>()

const tabsStore = useTabsStore()
const store = usePresetStore()
const listRef = ref<HTMLElement>()

// Drag-to-reorder mechanics (pointer tracking, auto-scroll-near-edge, throttled drag-over calc,
// text-selection suppression) all live in useDragReorder now — see its module doc comment. What
// stays here is block-specific: the group-insert semantics interpretation of onDrop's
// (from, to, after), handled entirely inside store.reorderBlock (unchanged, see
// sidebar-refactor-report.md 四.3 on why that stays out of the composable). The long-press
// multi-select gesture is a separate interaction, wired up further down via useListSelection.
const {
  dragIdx, dragOverIdx, dragOverPos, itemEls,
  setItemRef,
  onItemMouseDown: onDragPointerDown,
  consumeSuppressClick: consumeDragSuppressClick,
} = useDragReorder<number>({ autoScrollContainer: () => listRef.value })

const canBind = computed(() => {
  const topLevel = Array.from(store.selectedGi).filter(gi =>
    store.flatNodes[gi]?.parent === store.order
  )
  return topLevel.length >= 2
})
const canUnbind = computed(() => {
  // 只要选中的行里有至少一个是 group，就可以 unbind（支持多选 unbind？不，unbind 只需要选中一个 group 就行）
  return Array.from(store.selectedGi).some(gi => {
    const node = store.flatNodes[gi]
    return node?.isGroup ?? false
  })
})

function getBlock(id: string) { return store.prompts.find(p => p.identifier === id) }
function roleClass(id: string) {
  return roleClassOf(getBlock(id)?.role)
}

function nodeKey(node: FlatNode, gi: number) {
  return node.isGroup ? (node.ref as OrderGroup).id : (node.ref as OrderItem).identifier + '_' + gi
}
function itemStyle(node: FlatNode) {
  return node.depth > 0 ? { paddingLeft: (8 + node.depth * 16) + 'px' } : {}
}
function unbindCurrent() {
  // 找到第一个选中的 group 来 unbind
  const groupGi = Array.from(store.selectedGi).find(gi => {
    const node = store.flatNodes[gi]
    return node?.isGroup ?? false
  })
  if (groupGi === undefined) return
  store.unbindGroup(groupGi)
}

// Group name editing — see useInlineRename.ts's doc comment for why this and block name editing
// below are two separate instances rather than one shared state machine.
const {
  editingId: editingGroupGi,
  setInputRef: setGroupNameInputRaw,
  start: startEditGroupNameRaw,
  finish: finishEditGroupName,
  cancel: cancelEditGroupName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.flatNodes[gi]
    return node && node.isGroup ? (node.ref as OrderGroup).name : ''
  },
  onCommit: (gi, newName) => {
    const node = store.flatNodes[gi]
    if (node && node.isGroup) (node.ref as OrderGroup).name = newName
  },
})
function setGroupNameInput(el: any, _gi: number) { setGroupNameInputRaw(el) }
function startEditGroupName(gi: number) {
  const node = store.flatNodes[gi]
  if (!node || !node.isGroup) return
  startEditGroupNameRaw(gi)
}

// Block name editing
const {
  editingId: editingBlockGi,
  setInputRef: setBlockNameInputRaw,
  start: startEditBlockNameRaw,
  finish: finishEditBlockName,
  cancel: cancelEditBlockName,
} = useInlineRename<number>({
  getCurrentName: (gi) => {
    const node = store.flatNodes[gi]
    if (!node || node.isGroup) return ''
    const item = node.ref as OrderItem
    return getBlock(item.identifier)?.name || item.identifier
  },
  onCommit: (gi, newName) => {
    const node = store.flatNodes[gi]
    if (!node || node.isGroup) return
    const item = node.ref as OrderItem
    const p = store.prompts.find(pp => pp.identifier === item.identifier)
    if (!p) return
    p.name = newName
    store.markDirty() // nested field mutation — the shallow `prompts` watch won't catch this
    // BlockSettingsForm.vue has an equivalent watch, but it's unmounted whenever the settings
    // dock is closed (see SettingsDock.vue's v-if) — can't rely on it running, so sync directly.
    tabsStore.renameTab('block', item.identifier, newName || item.identifier)
  },
})
function setBlockNameInput(el: any, _gi: number) { setBlockNameInputRaw(el) }
function startEditBlockName(gi: number) {
  const node = store.flatNodes[gi]
  if (!node || node.isGroup) return
  startEditBlockNameRaw(gi)
}

function onGroupToggle(gi: number) {
  store.toggleGroupCollapse(gi)
}

/* ---- Resize ---- */
const resize = usePanelResize({
  getWidth: () => store.settings.sidebarWidth,
  setWidth: (w) => { store.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
function onResizeStart(e: PointerEvent) { resize.onPointerDown(e) }
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

/* ---- Scroll active item into view on jump requests ----
   Previously scrolled to `store.selectedGi`'s smallest member — wrong once selectedGi and
   activeTab were split into independent state (see sidebar-refactor-report.md 一): clicking an
   already-open TabBar tab ticks the scroll token without touching selectedGi, so that logic
   scrolled to a stale selection instead of the tab that was just focused. useListScrollSync
   resolves the target from activeTab.key instead — the same basis RegexSidebar.vue always used
   — via identifierToGi(), the existing one-way "identifier -> gi" lookup (also used by
   revealAndFindGi). Shares the same itemEls map useDragReorder already populates via setItemRef
   in the template — one map, one source of truth, same reasoning as useDragReorder's doc comment
   on why it exposes itemEls at all. */
useListScrollSync({
  domain: 'block',
  itemEls,
  keyOf: () => {
    const tab = tabsStore.activeTab
    if (!tab) return null
    const gi = store.identifierToGi(tab.key)
    return gi >= 0 ? gi : null
  },
})

/* ---- Drag and drop ----
   NOTE: this used to be native HTML5 DnD (draggable="true" + dragstart/dragover/drop). That
   works fine in a normal browser, but under Tauri/WebView2 (e.g. TauriTavern) it's broken:
   Tauri's `dragDropEnabled` window option (default true) hands DOM drag tracking off to the
   OS-level native drag system on Windows, and WebView2 never delivers the follow-up
   dragover/drop coordinates back to the page. Result: dragstart fires (so the "dragging" class
   flips on), but the item is otherwise stuck — "grabs but doesn't move". We can't flip that
   Tauri flag ourselves (it lives in the host app's tauri.conf.json, not this script), so instead
   we reimplement the whole interaction on plain pointerdown/pointermove/pointerup — now inside
   useDragReorder.ts (see its module doc comment for the full reasoning, previously duplicated
   here). This component only supplies onDrop's block-specific interpretation: `gi`-space
   from/to/after gets handed straight to store.reorderBlock(), which already owns the group-insert
   semantics (dropping just inside vs. between groups) — nothing about that logic changes here,
   see sidebar-refactor-report.md 四.3 on why that stays out of the composable. */
function onDragDrop(from: number, to: number, after: boolean) {
  store.reorderBlock(from, to, after)
}

// Pointer events during the drag happen over the TOP document (see hostEnv.ts), so listeners
// must go on the host window, exactly like usePanelResize does for panel resizing.
//
// Uses Pointer Events rather than mouse events so this also works via touch on mobile — see
// usePanelResize.ts's doc comment for the general reasoning.
//
// TOUCH vs SCROLL: an earlier version let touch-drag start anywhere on the row, on the theory
// that DRAG_THRESHOLD alone would tell an intentional drag apart from an ordinary scroll swipe.
// In practice it didn't — a real vertical scroll gesture also moves more than DRAG_THRESHOLD's
// 4px within the first couple of touch samples, so almost every scroll got misread as "starting
// a drag" before the browser's own native scroll had a chance to take over, and the two fought
// over the same touch (this is a known conflict — see e.g. gitlab-org/gitlab#16048, motion's
// reorder-vs-scroll issue #1341). The fix used everywhere for sortable touch lists is to require
// touch drags to start from a small dedicated handle rather than the whole row: mouse users keep
// the desktop convenience of dragging from anywhere on the row (a mouse drag never competes with
// a scroll gesture, so there's nothing to disambiguate), but a touch/pen pointerdown only starts
// a drag if it actually landed on .pm-drag-handle — anywhere else on the row is left completely
// alone, so the browser's native scroll handles it with zero interference. .pm-drag-handle gets
// `touch-action: none` in main.css so a touch that DOES land there is never also read as "start
// scrolling", but nothing outside the handle is touch-action-restricted, so normal list scrolling
// is untouched everywhere else in the row.
//
// The long-press-to-multi-select gesture (touch/pen off the drag handle, where useDragReorder's
// own onItemMouseDown deliberately does nothing — see its doc comment) and the click dispatch
// below both go through useListSelection now — one recognizer for "which selection gesture is
// this" shared by mouse and touch, dispatching into a single onSelect handler. See
// useListSelection.ts's doc comment for why the actual state transition (applyMultiSelect for
// ctrl/shift, via store.selectBlock; a bespoke always-select-this-row rule for plain clicks) stays
// here rather than moving into the composable.
const listSelection = useListSelection<number>({
  onSelect: (mode, gi) => {
    if (mode !== 'single') {
      // Ctrl/Cmd+Click, Shift+Click, and long-press (dispatched as 'ctrl' — see
      // useListSelection.ts) all go through the store's existing applyMultiSelect-backed
      // selectBlock(), which is also called from outside this sidebar (search/var-nav jumps), so
      // it stays the one implementation of that state transition.
      store.selectBlock(gi, { ctrl: mode === 'ctrl', shift: mode === 'shift' })
      return
    }
    // 普通点击/长按之外的单击：选中当前行，打开标签/切换折叠
    const node = store.flatNodes[gi]
    if (!node) return
    // Set locally rather than relying solely on presetStore's watch on tabsStore.activeTab:
    // that watcher only fires when the active tab identity actually changes, so re-clicking a row
    // that's ALREADY the active tab (e.g. to collapse a ctrl-multi-selection back down to just
    // this row) wouldn't otherwise reset the highlight. When this click DOES also change the
    // active tab, the watcher fires too and computes the identical value — harmless overlap, not
    // a second source of truth for a different case (see presetStore.ts's doc comment there).
    store.selectedGi.clear()
    store.selectedGi.add(gi)
    store.anchorGi = gi
    if (node.isGroup) {
      // 点击组标题：切换折叠状态（组没有 tab，高亮只能靠上面这几行本地设置）
      store.toggleGroupCollapse(gi)
    } else {
      const item = node.ref as OrderItem
      const block = store.prompts.find(p => p.identifier === item.identifier)
      tabsStore.open({ domain: 'block', key: item.identifier, label: block?.name || item.identifier })
    }
  },
})

function onItemMouseDown(i: number, e: PointerEvent) {
  // Touch/pen off the drag handle: claimed for long-press tracking, nothing else to do here.
  if (listSelection.onPointerDown(i, e)) return
  // Mouse, or touch/pen that landed on the drag handle — hand off entirely to useDragReorder.
  onDragPointerDown(i, e, onDragDrop)
}

function onItemClick(gi: number, e: MouseEvent) {
  if (consumeDragSuppressClick()) return
  if (listSelection.consumeSuppressClick()) return
  if (!store.flatNodes[gi]) return
  listSelection.onClick(gi, e)
}
</script>
