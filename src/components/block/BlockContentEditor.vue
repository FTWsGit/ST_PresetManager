<!--
  Was Editor.vue. Renamed for symmetry with RegexContentEditor.vue now that both are thin,
  domain-specific wrappers around the shared HighlightedEditor widget (components/shared/) — see
  that file's header comment for what moved there. Everything block-specific stays here: reading/
  writing store.currentBlock.content via v-model, search-result line highlighting, the var-click
  → var-popup wiring, and the name/role meta bar.
-->
<template>
  <div class="pm-editor-panel">
    <div class="pm-editor-meta">
      <span class="pm-rce-name">{{ store.currentBlock?.name || store.currentBlock?.identifier }}</span>
      <span v-if="store.currentBlock" class="pm-block-role" :class="roleClass(store.currentBlock.role)">{{ store.currentBlock.role }}</span>
      <span class="pm-spacer"></span>
      <button class="pm-btn sm" :class="{ active: tabsStore.settingsDockOpen }" @click="tabsStore.toggleSettingsDock()" :title="store.t('block.sidebar.settingsPanel')">⚙</button>
    </div>
    <HighlightedEditor
      ref="editorRef"
      v-model="content"
      :disabled="store.currentBlock?.marker ?? false"
      :jump="store.editorJump"
      :line-class="lineClass"
      enable-var-click
      :status-cursor-label="store.t('shared.highlightedEditor.cursor')"
      :status-chars-label="store.t('common.chars')"
      :status-lines-label="store.t('common.lines')"
      @var-click="onVarClick"
      @var-click-miss="store.hideVarPopup()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { useTabsStore } from '../../stores/tabsStore'
import { roleClass } from '../../utils'
import HighlightedEditor from '../shared/HighlightedEditor.vue'

const store = usePresetStore()
const tabsStore = useTabsStore()
const editorRef = ref<InstanceType<typeof HighlightedEditor>>()

const content = computed<string>({
  get: () => store.currentBlock?.content ?? '',
  set: (v) => { if (store.currentBlock) store.currentBlock.content = v },
})

// Hide any open var-popup whenever the active block tab changes — a stray popup pointing at the
// previous block's variable would be showing the wrong context otherwise.
watch(() => tabsStore.activeTab?.key, () => { store.hideVarPopup() }, { immediate: true })

// Search-result line highlighting for the line-number gutter — block-specific (searches
// store.currentBlock's content), so it lives here rather than in the generic component.
function lineClass(ln: number) {
  if (!store.searchResults.length) return ''
  const blockId = store.currentBlock?.identifier
  if (!blockId) return ''
  const hit = store.searchResults.some(r => r.blockId === blockId && r.line === ln)
  if (!hit) return ''
  const cur = store.searchIdx >= 0 && store.searchResults[store.searchIdx]?.blockId === blockId && store.searchResults[store.searchIdx]?.line === ln
  return cur ? 'search-cur' : 'search-hit'
}

function onVarClick(payload: { varName: string; cursorPos: number; pos: { top: number; left: number } }) {
  store.showVarPopup(payload.varName, store.currentBlock?.identifier ?? null, payload.cursorPos, payload.pos)
}

// Settings dialog font-size/family changes don't resize the textarea element itself, so
// HighlightedEditor's own ResizeObserver won't catch them — nudge it explicitly.
watch(() => [store.settings.editorFontSize, store.settings.editorFontFamily], () => {
  editorRef.value?.refreshFont()
})
</script>
