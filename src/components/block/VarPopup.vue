<template>
  <div v-if="store.varPopupOpen" class="pm-var-popup" :style="{ top: store.varPopupPos.top + 'px', left: store.varPopupPos.left + 'px' }">
    <div class="vp-header">
      <span class="vp-varname">{{ store.varPopupVarName }}</span>
      <span class="vp-count">{{ store.t(store.varPopupOps.length !== 1 ? 'block.varPopup.hit' : 'block.varPopup.hitSingle', { count: store.varPopupOps.length }) }}</span>
      <span class="vp-spacer"></span>
      <button class="vp-btn" @click="store.navPopupVar(-1)">◀</button>
      <button class="vp-btn" @click="store.navPopupVar(1)">▶</button>
      <button class="vp-btn close-btn" @click="store.hideVarPopup()">✕</button>
    </div>
    <div class="vp-list">
      <div v-for="(v, i) in store.varPopupOps" :key="i"
           class="vp-item" :class="{ current: i === store.varPopupIdx }"
           @click="store.jumpToPopupVar(i)">
        <span class="pm-vr-type" :class="varOpBadge(v.type).cls">{{ varOpBadge(v.type).label }}</span>
        <span v-if="v.varValue" class="pm-vr-val">{{ v.varValue.length > 35 ? v.varValue.substring(0, 35) + '…' : v.varValue }}</span>
        <span class="pm-vr-block">[{{ v.blockName }}]</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { getHostDocument } from '../../composables/hostEnv'
import { varOpBadge } from '../../utils'

const store = usePresetStore()

// Close on outside click (anywhere that isn't the popup itself or the editor textarea, so
// clicking a different {{var}} to re-target the popup still works via checkVarClick).
function onDocClick(e: MouseEvent) {
  if (!store.varPopupOpen) return
  const target = e.target as HTMLElement
  if (target.closest('.pm-var-popup') || target.closest('.pm-editor-ta')) return
  store.hideVarPopup()
}
function onKeydown(e: KeyboardEvent) {
  if (store.varPopupOpen && e.key === 'Escape') store.hideVarPopup()
}

let hostDoc: Document
onMounted(() => {
  hostDoc = getHostDocument()
  hostDoc.addEventListener('mousedown', onDocClick)
  hostDoc.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  hostDoc.removeEventListener('mousedown', onDocClick)
  hostDoc.removeEventListener('keydown', onKeydown)
})
</script>
