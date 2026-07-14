<template>
  <div class="pm-editor-panel" v-if="!tabsStore.activeTab">
    <div class="pm-editor-empty">
      <div class="icon">📝</div>
      <p v-if="tabsStore.sidebarMode === 'regex'">选一条正则，或者新建一条</p>
      <p v-else-if="store.hasData">Select a block to edit</p>
      <p v-else>Loading preset from context...</p>
    </div>
  </div>
  <Editor v-else-if="tabsStore.activeTab.domain === 'block'" />
  <RegexContentEditor v-else-if="tabsStore.activeTab.domain === 'regex'" />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useStore } from '../store'
import { useTabsStore } from '../tabsStore'
import Editor from './Editor.vue'
import RegexContentEditor from './domains/RegexContentEditor.vue'

const store = useStore()
const tabsStore = useTabsStore()

/* Editor.vue 是照抄未改的老组件，认的是 store.selIdx/store.currentBlock，不认标签系统。这里做
 * 一次桥接：block 标签被激活时把 selIdx 同步过去，Editor.vue 完全不用知道标签系统的存在。是
 * 刻意的过渡方案，不是漏做——见上面这段说明。 */
watch(() => tabsStore.activeTab, (tab) => {
  if (tab?.domain !== 'block') return
  const gi = store.flatNodes.findIndex(n => !n.isGroup && (n.ref as any).identifier === tab.key)
  if (gi >= 0 && gi !== store.selIdx) store.selectBlock(gi)
}, { immediate: true })
</script>
