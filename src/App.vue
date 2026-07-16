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
          <button class="pm-btn" @click="store.reloadPreset()">🗘 Reload</button>
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
          <BlockSidebar v-if="tabsStore.sidebarMode === 'block'" />
          <RegexSidebar v-else-if="tabsStore.sidebarMode === 'regex'" />
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

        <!-- CopyPanel before Modals: CopyPanel is itself a .pm-modal-overlay, and its own
             confirm/prompt dialogs (reload/remove/close-unsaved) are confirmStore-driven and
             rendered by Modals below it — Modals needs to be the LATER sibling so its overlay
             actually paints on top of CopyPanel's overlay instead of underneath it. -->
        <CopyPanel />
        <Modals />
      </div>
    </Transition>
    <VarPopup />
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from './stores/presetStore'
import SearchPanel from './components/block/SearchPanel.vue'
import BlockSidebar from './components/block/BlockSidebar.vue'
import VarPanel from './components/block/VarPanel.vue'
import PreviewPanel from './components/block/PreviewPanel.vue'
import VarPopup from './components/block/VarPopup.vue'
import CopyPanel from './components/block/CopyPanel.vue'
import RegexSidebar from './components/regex/RegexSidebar.vue'
import Modals from './components/shared/Modals.vue'
import TabBar from './components/shared/TabBar.vue'
import EditorShell from './components/shared/EditorShell.vue'
import SettingsDock from './components/shared/SettingsDock.vue'
import { useTabsStore } from './stores/tabsStore'
import { useConfirmStore } from './stores/confirmStore'
import { esc } from './utils'

const confirmStore = useConfirmStore()
const tabsStore = useTabsStore()
const store = usePresetStore()

function openPanel() {
  store.panelOpen = true
  if (!store.hasData) store.loadFromContext()
}

function toggleSearch() {
  store.searchOpen = !store.searchOpen
  if (store.searchOpen) store.doSearch()
}

// RULE: never call getHostWindow().confirm()/.prompt() — unreliable inside TauriTavern's
// WebView2 host. Everything goes through confirmStore instead (see confirmStore.ts).
function onPresetSelect(e: Event) {
  const select = e.target as HTMLSelectElement
  const name = select.value
  if (!name || name === store.presetName) return
  confirmStore.ask({
    title: 'Switch preset?',
    message: `Switch to preset <strong>${esc(name)}</strong>? Any unsaved edits to the current preset will be lost.`,
    confirmText: 'Switch',
    danger: false,
    onConfirm: () => store.switchPreset(name),
    // The <select> isn't v-model two-way bound, so the browser already visually switched to
    // `name` the moment @change fired — if the user cancels, snap it back to what's actually
    // loaded (nothing else is guaranteed to trigger a re-render in the meantime).
    onCancel: () => { select.value = store.presetName },
  })
}

function onNewPreset() {
  confirmStore.askInput({
    title: '新预设名称',
    placeholder: '预设名称',
    confirmText: '创建',
    onConfirm: (name) => {
      if (store.presetList.some(p => p.name === name)) { store.showToast('已存在同名预设'); return }
      store.createPreset(name)
    },
  })
}
function onDeletePreset() {
  if (!store.presetName) return
  confirmStore.ask({
    title: 'Delete preset?',
    message: `This will permanently remove <strong>${esc(store.presetName)}</strong>. This cannot be undone.`,
    onConfirm: () => store.removeCurrentPreset(),
  })
}
</script>
