<template>
  <div v-if="store.varPopupOpen" class="pm-var-popup" :style="{ top: store.varPopupPos.top + 'px', left: store.varPopupPos.left + 'px' }">
    <div class="vp-header">
      <span class="vp-icon">📌</span>
      <span class="vp-varname">{{ store.varPopupVarName }}</span>
      <span class="vp-count">{{ store.varPopupOps.length }} hit{{ store.varPopupOps.length !== 1 ? 's' : '' }}</span>
      <span class="vp-spacer"></span>
      <button class="vp-btn" @click="store.navPopupVar(-1)">◀</button>
      <button class="vp-btn" @click="store.navPopupVar(1)">▶</button>
      <button class="vp-btn close-btn" @click="store.hideVarPopup()">✕</button>
    </div>
    <div class="vp-list">
      <div v-for="(v, i) in store.varPopupOps" :key="i"
           class="vp-item" :class="{ current: i === store.varPopupIdx }"
           @click="store.jumpToPopupVar(i)">
        <span class="pm-vr-type" :class="v.type === 'setvar' ? 'set' : v.type === 'addvar' ? 'add' : 'get'">
          {{ v.type === 'setvar' ? 'SET' : v.type === 'addvar' ? 'ADD' : 'GET' }}
        </span>
        <span v-if="v.varValue" class="pm-vr-val">{{ v.varValue.length > 35 ? v.varValue.substring(0, 35) + '…' : v.varValue }}</span>
        <span class="pm-vr-block">[{{ v.blockName }}]</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useStore } from '../store'
import { getHostDocument } from '../composables/hostEnv'

const store = useStore()

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
