<template>
  <aside class="pm-sidebar" :class="{ 'pm-mobile-drawer-open': props.mobileDrawerOpen }" :style="{ width: store.settings.sidebarWidth + 'px' }">
    <div class="pm-sidebar-header">
      <span>{{ store.t('regex.sidebar.title', { count: store.regexScripts.length }) }}</span>
      <ListToolbar :count="store.regexScripts.length">
        <button class="pm-btn" @click="onAdd">{{ store.t('regex.sidebar.newScript') }}</button>
      </ListToolbar>
    </div>
    <div class="pm-block-list">
      <p v-if="!store.regexScripts.length" class="pm-cp-empty">{{ store.t('regex.sidebar.empty') }}</p>
      <div v-for="(r, i) in store.regexScripts" :key="r.id"
           :ref="(el) => setItemRef(el, i)"
           class="pm-block-item"
           :class="{ selected: tabsStore.activeId === 'regex:' + r.id, disabled: r.disabled, dragging: dragIdx === i,
                     'drag-over-top': dragOverIdx === i && dragOverPos === 'top',
                     'drag-over-bottom': dragOverIdx === i && dragOverPos === 'bottom' }"
           @pointerdown="onDragStart(i, $event)"
           @click="onItemClick(i)">
        <span class="pm-drag-handle">⠿</span>
        <span class="pm-toggle-sw" :class="{ on: !r.disabled }" :title="store.t('regex.sidebar.toggleTitle')" @click.stop="r.disabled = !r.disabled"></span>
        <span class="pm-block-name">{{ r.scriptName || store.t('common.unnamed') }}</span>
        <span class="pm-block-actions">
          <span class="pm-block-act del" :title="store.t('regex.sidebar.deleteTitle')" @click.stop="onDelete(r)">🗑</span>
        </span>
      </div>
    </div>
  </aside>
  <div class="pm-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
</template>

<script setup lang="ts">
import { watch, nextTick } from 'vue'
import { useDragReorder } from '../../composables/useDragReorder'
import { usePanelResize } from '../../composables/usePanelResize'
import { usePresetStore } from '../../stores/presetStore'
import { useTabsStore } from '../../stores/tabsStore'
import type { RegexScript } from '../../types'
import { useConfirmStore } from '../../stores/confirmStore'
import { esc } from '../../utils'
import ListToolbar from '../shared/ListToolbar.vue'

// See BlockSidebar.vue's identical prop for why: this template also has two root nodes
// (<aside> + the sibling .pm-resize-handle div at the end), so a parent's :class doesn't
// automatically reach <aside> the way it would for a single-root component.
const props = defineProps<{ mobileDrawerOpen?: boolean }>()

const confirmStore = useConfirmStore()
const store = usePresetStore()
const tabsStore = useTabsStore()
const { dragIdx, dragOverIdx, dragOverPos, setItemRef, onItemMouseDown, consumeSuppressClick, scrollItemIntoView } = useDragReorder()

function onAdd() {
  const id = store.addRegexScript()
  if (!id) return
  const s = store.regexScripts.find(r => r.id === id)
  tabsStore.open({ domain: 'regex', key: id, label: s?.scriptName || store.t('common.unnamed') })
}

function onDelete(r: RegexScript) {
  confirmStore.ask({
    title: store.t('shared.confirm.deleteRegex.title'),
    message: store.t('shared.confirm.deleteRegex.message', { name: esc(r.scriptName || r.id) }),
    confirmText: store.t('common.delete'),
    cancelText: store.t('common.cancel'),
    onConfirm: () => { store.deleteRegexScript(r.id); tabsStore.close('regex', r.id) },
  })
}

function onItemClick(i: number) {
  if (consumeSuppressClick()) return
  const r = store.regexScripts[i]
  if (r) tabsStore.open({ domain: 'regex', key: r.id, label: r.scriptName || store.t('common.unnamed') })
}
function onDragStart(i: number, e: PointerEvent) {
  onItemMouseDown(i, e, (from, to, after) => store.reorderRegexScript(from, to, after))
}

// Scroll the active regex item into view whenever something asks for it (TabBar click, this
// list's own click, or anything else that goes through tabsStore.open()/focus()) — mirrors
// BlockSidebar.vue's scrollSelectedIntoView(), generalized via tabsStore's per-domain token. See
// tabsStore.ts's doc comment on listScrollToken.
watch(() => tabsStore.listScrollToken['regex'], () => {
  nextTick(() => {
    if (!tabsStore.activeTab || tabsStore.activeTab.domain !== 'regex') return
    const idx = store.regexScripts.findIndex(r => r.id === tabsStore.activeTab!.key)
    if (idx >= 0) scrollItemIntoView(idx)
  })
})

const resize = usePanelResize({
  getWidth: () => store.settings.sidebarWidth,
  setWidth: (w) => { store.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

</script>
