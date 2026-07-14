<template>
  <div class="st-pm" :style="store.cssVars">
    <Transition name="pm-fab">
      <button v-if="!store.panelOpen" class="pm-fab" @click="openPanel">PM</button>
    </Transition>

    <Transition name="pm-panel">
      <div v-if="store.panelOpen" class="pm-panel">
        <div class="pm-header">
          <button class="pm-btn accent" @click="store.doSavePreset()">💾 Save{{ store.dirty ? ' *' : '' }}</button>
          <div class="pm-sep"></div>
          <button class="pm-btn" @click="store.loadFromContext()">🗘 Reload</button>
          <button class="pm-btn" @click="store.copyPanelOpen = true">⇆ Copy Blocks</button>
          <div class="pm-sep"></div>
          <div class="pm-mode-switch">
            <button class="pm-btn sm" :class="{ active: tabsStore.sidebarMode === 'block' }" @click="tabsStore.setSidebarMode('block')">预设</button>
            <button class="pm-btn sm" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="tabsStore.setSidebarMode('regex')">正则</button>
          </div>
          <div class="pm-sep"></div>
          <button class="pm-btn" :class="{ active: store.searchOpen }" @click="toggleSearch">🔍 Search</button>
          <button class="pm-btn" @click="store.settingsOpen = true">⚙ Settings</button>
          <div class="pm-spacer"></div>
          <button class="pm-btn" :class="{ active: store.varNavOpen }" @click="store.varNavOpen = !store.varNavOpen">📊 Var Nav</button>
          <button class="pm-btn" :class="{ active: store.previewOpen }" @click="store.previewOpen = !store.previewOpen">👁 Preview</button>
          <button class="pm-btn icon-btn" title="New preset" @click="onNewPreset">+</button>
          <button class="pm-btn icon-btn" title="Delete preset" @click="onDeletePreset" :disabled="!store.presetName">🗑</button>
          <select v-if="store.presetList.length" class="pm-preset-select" :value="store.presetName" @change="onPresetSelect($event)" title="Switch preset">
            <option v-if="!store.presetList.some(p => p.name === store.presetName)" :value="store.presetName" disabled>{{ store.presetName || '(none loaded)' }}</option>
            <option v-for="p in store.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
          <span v-else-if="store.presetName" class="pm-preset-name">{{ store.presetName }}</span>
          <button class="pm-btn close-btn" @click="store.panelOpen = false">✕</button>
        </div>

        <SearchPanel v-if="store.searchOpen" /> 

        <div class="pm-main">
          <Sidebar v-if="tabsStore.sidebarMode === 'block'" />
          <RegexSidebarList v-else-if="tabsStore.sidebarMode === 'regex'" />
          <div class="pm-editor-col">
            <TabBar />
            <div class="pm-editor-row">
              <EditorShell />
              <SettingsDock />
            </div>
          </div>
          <VarPanel v-if="store.varNavOpen" />
          <PreviewPanel v-if="store.previewOpen" />
        </div>

        <Modals />
        <CopyPanel />
      </div>
    </Transition>
    <VarPopup />
  </div>
</template>

<script setup lang="ts">
import { useStore } from './store'
import SearchPanel from './components/SearchPanel.vue'
import Sidebar from './components/Sidebar.vue'
import VarPanel from './components/VarPanel.vue'
import PreviewPanel from './components/PreviewPanel.vue'
import Modals from './components/Modals.vue'
import VarPopup from './components/VarPopup.vue'
import CopyPanel from './components/CopyPanel.vue'
import { getHostWindow } from './composables/hostEnv'
import TabBar from './components/TabBar.vue'
import { useTabsStore } from './tabsStore'
import EditorShell from './components/EditorShell.vue'
import SettingsDock from './components/SettingsDock.vue'
import RegexSidebarList from './components/RegexSidebarList.vue'
import { useConfirmStore } from './confirmStore'

const confirmStore = useConfirmStore()
const tabsStore = useTabsStore()
const store = useStore()

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


function onNewPreset() {
  const name = getHostWindow().prompt('新预设名称：', '')
  if (!name) return
  if (store.presetList.some(p => p.name === name)) { store.showToast('已存在同名预设'); return }
  store.createPreset(name)
}
function onDeletePreset() {
  if (!store.presetName) return
  confirmStore.ask({
    title: 'Delete preset?',
    message: `This will permanently remove <strong>${store.presetName}</strong>. This cannot be undone.`,
    onConfirm: () => store.removeCurrentPreset(),
  })
}
</script>
