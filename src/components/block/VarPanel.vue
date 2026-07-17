<template>
  <div class="pm-right-panel" :class="{ float: store.settings.varPanelFloat }" :style="{ width: store.settings.varPanelWidth + 'px' }">
    <div class="pm-right-resize-handle" :class="{ active: resize.active.value }" @mousedown="resize.onMouseDown"></div>
    <div class="pm-rp-header">
      <span>{{ store.t('block.varPanel.title') }}</span>
      <div class="pm-row-tight">
        <button class="pm-btn icon-btn" :class="{ active: store.settings.varPanelFloat }" :title="store.t('block.varPanel.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="pm-btn close-btn compact" @click="store.varNavOpen = false">✕</button>
      </div>
    </div>
    <div class="pm-rp-tools">
      <input type="text" v-model="store.varFilterQ" :placeholder="store.t('block.varPanel.filter')" />
      <button class="pm-btn sm" @click="store.rebuildVarIndex()">🔄</button>
    </div>
    <div class="pm-rp-nav">
      <button class="pm-btn" @click="store.navVar(-1)">{{ store.t('block.varPanel.prev') }}</button>
      <button class="pm-btn" @click="store.navVar(1)">{{ store.t('block.varPanel.next') }}</button>
      <span class="pm-search-count">{{ store.filteredVarOps.length }}/{{ store.allVarOps.length }}</span>
    </div>
    <div class="pm-rp-list">
      <template v-for="(v, i) in store.filteredVarOps" :key="i">
        <div v-if="i === 0 || v.varName !== store.filteredVarOps[i - 1].varName" class="pm-vr-group">{{ v.varName }}</div>
        <div class="pm-vr-item" :class="{ active: i === store.varIdx }" @click="store.jumpToVarOp(i)">
          <span class="pm-vr-type" :class="varOpBadge(v.type).cls">{{ varOpBadge(v.type).label }}</span>
          <span class="pm-var-name-em">{{ v.varName }}</span>
          <span v-if="v.varValue" class="pm-vr-val">{{ v.varValue.length > 35 ? v.varValue.substring(0, 35) + '…' : v.varValue }}</span>
          <span class="pm-vr-block">[{{ v.blockName }}]</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { usePanelResize } from '../../composables/usePanelResize'
import { varOpBadge } from '../../utils'

const store = usePresetStore()

const resize = usePanelResize({
  getWidth: () => store.settings.varPanelWidth,
  setWidth: (w) => { store.settings.varPanelWidth = w },
  min: 240, max: 800, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

function toggleFloat() {
  store.settings.varPanelFloat = !store.settings.varPanelFloat
  store.saveSettings()
}
</script>
