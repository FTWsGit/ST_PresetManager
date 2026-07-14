<template>
  <div v-if="formComponent && tabsStore.settingsDockOpen" class="pm-right-panel pm-settings-dock" :class="{ float: store.settings.settingsDockFloat }" :style="{ width: store.settings.settingsDockWidth + 'px' }">
    <div class="pm-right-resize-handle" :class="{ active: resize.active.value }" @mousedown="resize.onMouseDown"></div>
    <div class="pm-rp-header">
      <span>⚙ 设置</span>
      <div class="pm-row-tight">
        <button class="pm-btn icon-btn" :class="{ active: store.settings.settingsDockFloat }" title="Toggle float mode" @click="toggleFloat">📌</button>
        <button class="pm-btn close-btn compact" @click="tabsStore.settingsDockOpen = false">✕</button>
      </div>
    </div>
    <div class="pm-settings-dock-body">
      <component :is="formComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useStore } from '../store'
import { useTabsStore } from '../tabsStore'
import { usePanelResize } from '../composables/usePanelResize'
import RegexSettingsForm from './domains/RegexSettingsForm.vue'

const store = useStore()
const tabsStore = useTabsStore()
const FORMS: Record<string, any> = { regex: RegexSettingsForm }
const formComponent = computed(() => tabsStore.activeTab ? FORMS[tabsStore.activeTab.domain] : null)

const resize = usePanelResize({
  getWidth: () => store.settings.settingsDockWidth,
  setWidth: (w) => { store.settings.settingsDockWidth = w },
  min: 240, max: 520, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })
function toggleFloat() { store.settings.settingsDockFloat = !store.settings.settingsDockFloat; store.saveSettings() }
</script>
