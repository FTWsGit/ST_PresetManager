<template>
  <div class="st-pm" :style="store.cssVars">
    <Transition name="pm-fab">
      <button v-if="!store.panelOpen" class="pm-fab" @click="openPanel">PM</button>
    </Transition>

    <Transition name="pm-panel">
      <div v-if="store.panelOpen" class="pm-panel">
        <div class="pm-header">
          <button class="pm-btn accent" @click="store.doSavePreset()">💾 Save</button>
          <div class="pm-sep"></div>
          <button class="pm-btn" @click="store.loadFromContext()">🔄 Reload</button>
          <button class="pm-btn" @click="store.addBlock()">+ New</button>
          <button class="pm-btn" @click="store.hiddenOpen = true">+ Hidden</button>
          <div class="pm-sep"></div>
          <button class="pm-btn" :class="{ active: store.searchOpen }" @click="toggleSearch">🔍 Search</button>
          <button class="pm-btn" :disabled="!canBind" @click="store.bindSelected()">🔗 Bind</button>
          <button class="pm-btn" :disabled="!canUnbind" @click="unbindCurrent()">🔓 Unbind</button>
          <button class="pm-btn" :class="{ active: store.varNavOpen }" @click="store.varNavOpen = !store.varNavOpen">📊 Var Nav</button>
          <button class="pm-btn" :class="{ active: store.previewOpen }" @click="store.previewOpen = !store.previewOpen">👁 Preview</button>
          <button class="pm-btn" @click="store.settingsOpen = true">⚙ Settings</button>
          <div class="pm-spacer"></div>
          <select v-if="store.presetList.length" class="pm-preset-select" :value="store.presetName" @change="onPresetSelect($event)" title="Switch preset">
            <option v-if="!store.presetList.some(p => p.name === store.presetName)" :value="store.presetName" disabled>{{ store.presetName || '(none loaded)' }}</option>
            <option v-for="p in store.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
          <span v-else-if="store.presetName" class="pm-preset-name">{{ store.presetName }}</span>
          <button class="pm-btn close-btn" @click="store.panelOpen = false">✕</button>
        </div>

        <SearchPanel v-if="store.searchOpen" />

        <div class="pm-main">
          <Sidebar />
          <template v-if="store.selIdx >= 0">
            <Editor />
          </template>
          <div v-else class="pm-editor-panel">
            <div class="pm-editor-empty">
              <div class="icon">📝</div>
              <p v-if="store.hasData">Select a block to edit</p>
              <p v-else>Loading preset from context...</p>
            </div>
          </div>
          <VarPanel v-if="store.varNavOpen" />
          <PreviewPanel v-if="store.previewOpen" />
        </div>

        <Modals />
      </div>
    </Transition>
    <VarPopup />
  </div>
</template>

<script setup lang="ts">
import { useStore } from './store'
import { computed } from 'vue'
import SearchPanel from './components/SearchPanel.vue'
import Sidebar from './components/Sidebar.vue'
import Editor from './components/Editor.vue'
import VarPanel from './components/VarPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import Modals from './components/Modals.vue'
import VarPopup from './components/VarPopup.vue'
import { getHostWindow } from './composables/hostEnv'

const store = useStore()

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
function unbindCurrent() {
  if (store.selIdx < 0) return
  store.unbindGroup(store.selIdx)
}

function openPanel() {
  store.panelOpen = true
  if (!store.hasData) store.loadFromContext()
}

function toggleSearch() {
  store.searchOpen = !store.searchOpen
  if (store.searchOpen) store.doSearch()
}

function onPresetSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const name = select.value
  if (!name || name === store.presetName) return
  if (!getHostWindow().confirm(`Switch to preset "${name}"? Any unsaved edits to the current preset will be lost.`)) {
    select.value = store.presetName // snap the <select> back since it isn't v-model two-way bound
    return
  }
  store.switchPreset(name)
}
</script>
