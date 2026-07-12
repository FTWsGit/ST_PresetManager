<template>
  <aside class="pm-sidebar" ref="sidebarRef" :style="{ width: store.settings.sidebarWidth + 'px' }">
    <div class="pm-sidebar-header">
      <span>Prompt Blocks ({{ store.order.length }})</span>
      <div class="pm-sidebar-tools">
        <button class="pm-btn" :disabled="!canBind" @click="store.bindSelected()">🔗 Bind</button>
        <button class="pm-btn" :disabled="!canUnbind" @click="unbindCurrent()">🔓 Unbind</button>
      </div>
    </div>
    <div class="pm-block-list" ref="listRef">
      <template v-for="(node, gi) in store.flatNodes" :key="nodeKey(node, gi)">
        <!-- Group Header -->
        <div v-if="node.isGroup"
             :ref="(el) => setItemRef(el, gi)"
             class="pm-group-header"
             :class="{ selected: store.selectedGi.has(gi) || store.selIdx === gi, disabled: !(node.ref as OrderGroup).enabled, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom' }"
             :style="itemStyle(node)"
             @mousedown="onItemMouseDown(gi, $event)"
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
                 @mousedown.stop />
          <span class="pm-group-count">{{ (node.ref as OrderGroup).children.length }}</span>
          <span class="pm-block-actions">
            <span class="pm-block-act" title="Rename" @click.stop="startEditGroupName(gi)">✎</span>
            <span class="pm-block-act" @click.stop="store.toggleBlock(gi)">👁</span>
            <span class="pm-block-act del" @click.stop="store.deleteBlock(gi)">🗑</span>
          </span>
        </div>
        <!-- Block Item -->
        <div v-else
             :ref="(el) => setItemRef(el, gi)"
             class="pm-block-item"
             :class="{ selected: store.selectedGi.has(gi) || store.selIdx === gi, disabled: !(node.ref as OrderItem).enabled, dragging: dragIdx === gi, 'drag-over-top': dragOverIdx === gi && dragOverPos === 'top', 'drag-over-bottom': dragOverIdx === gi && dragOverPos === 'bottom', nested: node.depth > 0 }"
             :style="itemStyle(node)"
             @mousedown="onItemMouseDown(gi, $event)"
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
                 @mousedown.stop />
          <span class="pm-block-role" :class="roleClass((node.ref as OrderItem).identifier)">{{ getBlock((node.ref as OrderItem).identifier)?.role || 'system' }}</span>
          <span class="pm-block-actions">
            <span class="pm-block-act" title="Rename" @click.stop="startEditBlockName(gi)">✎</span>
            <span class="pm-block-act" @click.stop="store.hideBlock(gi)">👁</span>
            <span class="pm-block-act del" @click.stop="store.deleteBlock(gi)">🗑</span>
          </span>
        </div>
      </template>
    </div>
  </aside>
  <div class="pm-resize-handle" :class="{ active: resize.active.value }" @mousedown="onResizeStart"></div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useStore } from '../store'
import type { OrderItem, OrderGroup, FlatNode } from '../types'
import { usePanelResize } from '../composables/usePanelResize'
import { getHostDocument, getHostWindow } from '../composables/hostEnv'
import { roleClass as roleClassOf } from '../utils'

const store = useStore()
const sidebarRef = ref<HTMLElement>()
const listRef = ref<HTMLElement>()
const dragIdx = ref<number | null>(null)
const dragOverIdx = ref(-1)
const dragOverPos = ref<'top' | 'bottom'>('top')
let dragScrollRAF: number | null = null

const canBind = computed(() => {
  const topLevel = Array.from(store.selectedGi).filter(gi =>
    store.flatNodes[gi]?.parent === store.order
  )
  return topLevel.length >= 2
})
const canUnbind = computed(() => {
  if (store.selIdx < 0) return false
  const node = store.flatNodes[store.selIdx]
  return node?.isGroup ?? false
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
  if (store.selIdx < 0) return
  store.unbindGroup(store.selIdx)
}

// Group name editing
const editingGroupGi = ref(-1)
const groupNameInputRef = ref<HTMLInputElement | null>(null)

function setGroupNameInput(el: any, gi: number) {
  if (el) {
    groupNameInputRef.value = el as HTMLInputElement
    nextTick(() => {
      const input = groupNameInputRef.value
      if (input) {
        input.focus()
        input.select()
      }
    })
  }
}

function startEditGroupName(gi: number) {
  const node = store.flatNodes[gi]
  if (!node || !node.isGroup) return
  editingGroupGi.value = gi
}

// Block name editing
const editingBlockGi = ref(-1)
const blockNameInputRef = ref<HTMLInputElement | null>(null)

function setBlockNameInput(el: any, gi: number) {
  if (el) {
    blockNameInputRef.value = el as HTMLInputElement
    nextTick(() => {
      const input = blockNameInputRef.value
      if (input) {
        input.focus()
        input.select()
      }
    })
  }
}

function startEditBlockName(gi: number) {
  const node = store.flatNodes[gi]
  if (!node || node.isGroup) return
  editingBlockGi.value = gi
}

function finishEditBlockName(gi: number, e: Event) {
  const input = e.target as HTMLInputElement
  const newName = input.value.trim()
  const node = store.flatNodes[gi]
  if (node && !node.isGroup && newName) {
    const item = node.ref as OrderItem
    const p = store.prompts.find(pp => pp.identifier === item.identifier)
    if (p) p.name = newName
  }
  editingBlockGi.value = -1
  blockNameInputRef.value = null
}

function cancelEditBlockName() {
  editingBlockGi.value = -1
  blockNameInputRef.value = null
}

function finishEditGroupName(gi: number, e: Event) {
  const input = e.target as HTMLInputElement
  const newName = input.value.trim()
  const node = store.flatNodes[gi]
  if (node && node.isGroup && newName) {
    (node.ref as OrderGroup).name = newName
  }
  editingGroupGi.value = -1
  groupNameInputRef.value = null
}

function cancelEditGroupName() {
  editingGroupGi.value = -1
  groupNameInputRef.value = null
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
function onResizeStart(e: MouseEvent) { resize.onMouseDown(e) }
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

/* ---- Scroll selected item into view on jump requests ---- */
const itemEls = new Map<number, HTMLElement>()
function setItemRef(el: any, i: number) {
  if (el) itemEls.set(i, el as HTMLElement)
  else itemEls.delete(i)
}
function scrollSelectedIntoView() {
  const el = itemEls.get(store.selIdx)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
watch(() => store.sidebarJumpToken, () => { nextTick(scrollSelectedIntoView) })

/* ---- Drag and drop ----
   NOTE: this used to be native HTML5 DnD (draggable="true" + dragstart/dragover/drop). That
   works fine in a normal browser, but under Tauri/WebView2 (e.g. TauriTavern) it's broken:
   Tauri's `dragDropEnabled` window option (default true) hands DOM drag tracking off to the
   OS-level native drag system on Windows, and WebView2 never delivers the follow-up
   dragover/drop coordinates back to the page. Result: dragstart fires (so the "dragging" class
   flips on), but the item is otherwise stuck — "grabs but doesn't move". We can't flip that
   Tauri flag ourselves (it lives in the host app's tauri.conf.json, not this script), so instead
   we reimplement the whole interaction on plain mousedown/mousemove/mouseup, the same pattern
   already used in usePanelResize.ts. Plain mouse events aren't native drag sessions, so nothing
   here goes through the OS-level path Tauri intercepts.

   We throttle dragover-equivalent updates with requestAnimationFrame and only touch the ref
   when the effective (index, position) actually changes, to avoid re-rendering the whole
   v-for list on every mousemove tick. */
let dragRAF = 0
let pendingOver: { idx: number; pos: 'top' | 'bottom' } | null = null
function flushDragOver() {
  dragRAF = 0
  if (!pendingOver) return
  if (dragOverIdx.value !== pendingOver.idx) dragOverIdx.value = pendingOver.idx
  if (dragOverPos.value !== pendingOver.pos) dragOverPos.value = pendingOver.pos
}

function suppressSelection() {
  const hostDoc = getHostDocument()
  hostDoc.body.style.userSelect = 'none'
  ;(hostDoc.body.style as any).webkitUserSelect = 'none'
}
function restoreSelection() {
  const hostDoc = getHostDocument()
  hostDoc.body.style.userSelect = ''
  ;(hostDoc.body.style as any).webkitUserSelect = ''
}

// Figure out which item the pointer is currently over, and whether it's in the top or bottom
// half of that item (that decides insert-before vs insert-after). Falls back to clamping to the
// first/last item when the pointer is above/below the whole list, so dragging past either end
// still gives a sensible drop target instead of silently doing nothing.
function updateDragOver(clientY: number) {
  let bestIdx = -1
  let bestPos: 'top' | 'bottom' = 'top'
  for (const [idx, el] of itemEls) {
    const r = el.getBoundingClientRect()
    if (clientY >= r.top && clientY <= r.bottom) {
      bestIdx = idx
      bestPos = clientY < r.top + r.height / 2 ? 'top' : 'bottom'
      break
    }
  }
  if (bestIdx === -1 && itemEls.size) {
    const first = itemEls.get(0)
    const last = itemEls.get(itemEls.size - 1)
    if (first && clientY < first.getBoundingClientRect().top) { bestIdx = 0; bestPos = 'top' }
    else if (last && clientY > last.getBoundingClientRect().bottom) { bestIdx = itemEls.size - 1; bestPos = 'bottom' }
  }
  pendingOver = bestIdx === -1 ? null : { idx: bestIdx, pos: bestPos }
  if (!dragRAF) dragRAF = requestAnimationFrame(flushDragOver)
}

function handleListAutoScroll(clientY: number) {
  if (!listRef.value) return
  const rect = listRef.value.getBoundingClientRect(), th = 70, spd = 40
  if (clientY - rect.top < th) startDragScroll(-Math.ceil(spd * (1 - (clientY - rect.top) / th)))
  else if (rect.bottom - clientY < th) startDragScroll(Math.ceil(spd * (1 - (rect.bottom - clientY) / th)))
  else stopDragScroll()
}
function startDragScroll(s: number) { if (!dragScrollRAF) (function t() { if (listRef.value) listRef.value.scrollTop += s; dragScrollRAF = requestAnimationFrame(t) })() }
function stopDragScroll() { if (dragScrollRAF) { cancelAnimationFrame(dragScrollRAF); dragScrollRAF = null } }

// Mouse events during the drag happen over the TOP document (see hostEnv.ts), so listeners
// must go on the host window, exactly like usePanelResize does for panel resizing.
const DRAG_THRESHOLD = 4
let suppressClick = false

function onItemMouseDown(i: number, e: MouseEvent) {
  if (e.button !== 0) return
  const hostWin = getHostWindow()
  const startX = e.clientX
  const startY = e.clientY
  let dragging = false

  function onMove(ev: MouseEvent) {
    if (!dragging) {
      if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return
      dragging = true
      dragIdx.value = i
      suppressSelection()
    }
    updateDragOver(ev.clientY)
    handleListAutoScroll(ev.clientY)
  }

  function onUp() {
    hostWin.removeEventListener('mousemove', onMove)
    hostWin.removeEventListener('mouseup', onUp)
    restoreSelection()
    stopDragScroll()
    if (dragging) {
      // A real drag happened — the browser will still fire a native `click` on mouseup at the
      // same target even though the pointer moved, so swallow that one click via onItemClick.
      suppressClick = true
      const from = dragIdx.value
      const over = pendingOver
      if (from !== null && over && over.idx !== from) {
        store.reorderBlock(from, over.idx, over.pos === 'bottom')
      }
    }
    dragIdx.value = null
    dragOverIdx.value = -1
    pendingOver = null
  }

  hostWin.addEventListener('mousemove', onMove)
  hostWin.addEventListener('mouseup', onUp)
}

function onItemClick(gi: number, e: MouseEvent) {
  if (suppressClick) { suppressClick = false; return }
  store.selectBlock(gi, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })
}
</script>
