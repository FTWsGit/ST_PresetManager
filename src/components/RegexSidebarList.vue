<template>
  <div class="pm-rx-sidebar" :style="{ width: store.settings.sidebarWidth + 'px' }">
    <ListToolbar :count="store.regexScripts.length">
      <button class="pm-btn" @click="onAdd">+ 新建</button>
    </ListToolbar>
    <div class="pm-cp-list">
      <p v-if="!store.regexScripts.length" class="pm-cp-empty">还没有绑定的正则</p>
      <div v-for="(r, i) in store.regexScripts" :key="r.id"
           :ref="(el) => setItemRef(el, i)"
           class="pm-block-item pm-rx-item"
           :class="{ selected: tabsStore.activeId === 'regex:' + r.id, disabled: r.disabled, dragging: dragIdx === i,
                     'drag-over-top': dragOverIdx === i && dragOverPos === 'top',
                     'drag-over-bottom': dragOverIdx === i && dragOverPos === 'bottom' }"
           @mousedown="onDragStart(i, $event)"
           @click="onItemClick(i)">
        <span class="pm-drag-handle">⠿</span>
        <span class="pm-toggle-sw" :class="{ on: !r.disabled }" title="启用/禁用" @click.stop="r.disabled = !r.disabled"></span>
        <span class="pm-block-name">{{ r.scriptName || '(未命名)' }}</span>
        <span class="pm-block-act del" title="删除" @click.stop="onDelete(r)">🗑</span>
      </div>
    </div>
  </div>
  <div class="pm-resize-handle" :class="{ active: resize.active.value }" @mousedown="resize.onMouseDown"></div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useDragReorder } from '../composables/useDragReorder'
import { usePanelResize } from '../composables/usePanelResize'
import { useStore } from '../store'
import { useTabsStore } from '../tabsStore'
import type { RegexScript } from '../types'
import { useConfirmStore } from '../confirmStore'

const confirmStore = useConfirmStore()
const store = useStore()
const tabsStore = useTabsStore()
const { dragIdx, dragOverIdx, dragOverPos, setItemRef, onItemMouseDown, consumeSuppressClick } = useDragReorder()

function onAdd() {
  const id = store.addRegexScript()
  if (!id) return
  const s = store.regexScripts.find(r => r.id === id)
  tabsStore.open({ domain: 'regex', key: id, label: s?.scriptName || '(未命名)' })
}

function onDelete(r: RegexScript) {
  confirmStore.ask({
    title: 'Delete regex script?',
    message: `This will permanently remove <strong>${r.scriptName || r.id}</strong> from the preset.`,
    onConfirm: () => { store.deleteRegexScript(r.id); tabsStore.close('regex', r.id) },
  })
}

function onItemClick(i: number) {
  if (consumeSuppressClick()) return
  const r = store.regexScripts[i]
  if (r) tabsStore.open({ domain: 'regex', key: r.id, label: r.scriptName || '(未命名)' })
}
function onDragStart(i: number, e: MouseEvent) {
  onItemMouseDown(i, e, (from, to, after) => store.reorderRegexScript(from, to, after))
}

const resize = usePanelResize({
  getWidth: () => store.settings.sidebarWidth,
  setWidth: (w) => { store.settings.sidebarWidth = w },
  min: 220, max: 600, dir: 'right',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

</script>
