<template>
  <div class="st-pm" :style="store.cssVars">
    <Transition name="pm-fab">
      <button v-if="!store.panelOpen" class="pm-fab" @click="openPanel">PM</button>
    </Transition>

    <Transition name="pm-panel">
      <div v-if="store.panelOpen" class="pm-panel">
        <div class="pm-header">
          <!-- Desktop: full button row, unchanged. Mobile: a compact row (☰ / Save / preset /
               ⋯ / ✕) — the rest of these buttons move into the ⋯ tools sheet below (see
               .pm-mobile-tools-sheet), since 8+ buttons don't fit a ~360px header no matter how
               much padding gets trimmed. -->
          <template v-if="!isMobile">
            <button class="pm-btn accent" @click="store.doSavePreset()">{{ store.t('shared.header.save', { star: store.dirty ? ' *' : '' }) }}</button>
            <div class="pm-sep"></div>
            <button class="pm-btn" @click="store.reloadPreset()">{{ store.t('shared.header.reload') }}</button>
            <button class="pm-btn" @click="store.copyPanelOpen = true">{{ store.t('shared.header.copyBlocks') }}</button>
            <div class="pm-sep"></div>
            <div class="pm-mode-switch">
              <button class="pm-btn sm" :class="{ active: tabsStore.sidebarMode === 'block' }" @click="tabsStore.setSidebarMode('block')">{{ store.t('shared.header.mode.block') }}</button>
              <button class="pm-btn sm" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="tabsStore.setSidebarMode('regex')">{{ store.t('shared.header.mode.regex') }}</button>
            </div>
            <div class="pm-sep"></div>
            <button class="pm-btn" :class="{ active: store.searchOpen }" @click="toggleSearch">{{ store.t('shared.header.search') }}</button>
            <button class="pm-btn" @click="store.settingsOpen = true">{{ store.t('shared.header.settings') }}</button>
            <div class="pm-spacer"></div>
            <button class="pm-btn" :class="{ active: store.varNavOpen }" @click="store.varNavOpen = !store.varNavOpen">{{ store.t('shared.header.varNav') }}</button>
            <button class="pm-btn" :class="{ active: store.previewOpen }" @click="store.previewOpen = !store.previewOpen">{{ store.t('shared.header.preview') }}</button>
            <button class="pm-btn icon-btn" :title="store.t('shared.header.newPreset')" @click="onNewPreset">+</button>
            <button class="pm-btn icon-btn" :title="store.t('shared.header.deletePreset')" @click="onDeletePreset" :disabled="!store.presetName">🗑</button>
            <select v-if="store.presetList.length" class="pm-preset-select" :value="store.presetName" @change="onPresetSelect($event)" :title="store.t('shared.header.switchPreset')">
              <option v-if="!store.presetList.some(p => p.name === store.presetName)" :value="store.presetName" disabled>{{ store.presetName || store.t('shared.header.noneLoaded') }}</option>
              <option v-for="p in store.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <span v-else-if="store.presetName" class="pm-preset-name">{{ store.presetName }}</span>
            <button class="pm-btn close-btn" @click="store.panelOpen = false">✕</button>
          </template>
          <template v-else>
            <button class="pm-mobile-hamburger" :title="store.t('shared.mobile.sidebar')" @click="toggleMobileSidebar">☰</button>
            <button class="pm-btn accent" @click="store.doSavePreset()">{{ store.t('shared.header.save', { star: store.dirty ? ' *' : '' }) }}</button>
            <button class="pm-btn" @click="store.reloadPreset()">{{ store.t('shared.header.reload') }}</button>
            <select v-if="store.presetList.length" class="pm-preset-select" :value="store.presetName" @change="onPresetSelect($event)" :title="store.t('shared.header.switchPreset')">
              <option v-if="!store.presetList.some(p => p.name === store.presetName)" :value="store.presetName" disabled>{{ store.presetName || store.t('shared.header.noneLoaded') }}</option>
              <option v-for="p in store.presetList" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <span v-else-if="store.presetName" class="pm-preset-name">{{ store.presetName }}</span>
            <div class="pm-spacer"></div>
            <button class="pm-mobile-tools-btn" :class="{ active: mobileDrawerVisible === 'tools' }" :title="store.t('shared.mobile.tools')" @click="toggleMobileTools">⋯</button>
            <button class="pm-btn close-btn" @click="store.panelOpen = false">✕</button>
          </template>
        </div>

        <SearchPanel v-if="store.searchOpen" /> 

        <div class="pm-main">
          <BlockSidebar v-if="tabsStore.sidebarMode === 'block'" :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'" />
          <RegexSidebar v-else-if="tabsStore.sidebarMode === 'regex'" :mobile-drawer-open="isMobile && mobileDrawerVisible === 'sidebar'" />
          <div class="pm-editor-col">
            <TabBar />
            <div class="pm-editor-row">
              <EditorShell />
              <SettingsDock :class="{ 'pm-mobile-drawer-open': isMobile && mobileDrawerVisible === 'settingsDock' }" />
            </div>
          </div>
          <VarPanel v-if="store.varNavOpen" :class="{ 'pm-mobile-drawer-open': isMobile && mobileDrawerVisible === 'varNav' }" />
          <PreviewPanel v-if="store.previewOpen" :class="{ 'pm-mobile-drawer-open': isMobile && mobileDrawerVisible === 'preview' }" />
        </div>

        <!-- Mobile-only: dims the editor behind whichever drawer/sheet is open, tap to close.
             Never rendered on desktop (v-if="isMobile"), where nothing here ever opens as an
             overlay in the first place. -->
        <div v-if="isMobile && mobileDrawerVisible !== 'none'" class="pm-mobile-backdrop" @click="closeMobileDrawer"></div>

        <!-- Mobile-only action sheet for everything that didn't fit the compact header row. -->
        <div v-if="isMobile" class="pm-mobile-tools-sheet" :class="{ 'pm-mobile-drawer-open': mobileDrawerVisible === 'tools' }">
          <div class="pm-mobile-tools-grip"></div>
          <button class="pm-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'block' }" @click="runTool(() => tabsStore.setSidebarMode('block'))">{{ store.t('shared.header.mode.block') }}</button>
          <button class="pm-mobile-tools-item" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="runTool(() => tabsStore.setSidebarMode('regex'))">{{ store.t('shared.header.mode.regex') }}</button>
          <button class="pm-mobile-tools-item" @click="runTool(() => { store.copyPanelOpen = true })">{{ store.t('shared.header.copyBlocks') }}</button>
          <button class="pm-mobile-tools-item" :class="{ active: store.searchOpen }" @click="runTool(toggleSearch)">{{ store.t('shared.header.search') }}</button>
          <button class="pm-mobile-tools-item" @click="runTool(() => { store.settingsOpen = true })">{{ store.t('shared.header.settings') }}</button>
          <button class="pm-mobile-tools-item" :class="{ active: store.varNavOpen }" @click="runTool(() => { store.varNavOpen = !store.varNavOpen })">{{ store.t('shared.header.varNav') }}</button>
          <button class="pm-mobile-tools-item" :class="{ active: store.previewOpen }" @click="runTool(() => { store.previewOpen = !store.previewOpen })">{{ store.t('shared.header.preview') }}</button>
          <button class="pm-mobile-tools-item" @click="runTool(onNewPreset)">{{ store.t('shared.header.newPreset') }}</button>
          <button class="pm-mobile-tools-item" :disabled="!store.presetName" @click="runTool(onDeletePreset)">{{ store.t('shared.header.deletePreset') }}</button>
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
import { ref, watch } from 'vue'
import { useIsMobile } from './composables/hostEnv'

const confirmStore = useConfirmStore()
const tabsStore = useTabsStore()
const store = usePresetStore()

// Mobile layout: sidebar/varNav/preview/settingsDock render as off-canvas overlays (left drawer
// for sidebar, bottom sheets for the other three — see main.css's @media (max-width) block)
// instead of docked flex columns. At most one is visibly slid into view at a time, tracked here;
// 'tools' is the ⋯ action sheet itself, not a panel. The underlying store flags
// (varNavOpen/previewOpen/settingsDockOpen) keep meaning exactly what they already mean on
// desktop — mobileDrawerVisible is purely "which one, if any, is the one currently slid into
// view", kept in sync with those flags by the watchers below rather than being a second source
// of truth for whether a panel is open at all.
const isMobile = useIsMobile()
const mobileDrawerVisible = ref<'none' | 'sidebar' | 'varNav' | 'preview' | 'settingsDock' | 'tools'>('none')

function toggleMobileSidebar() {
  mobileDrawerVisible.value = mobileDrawerVisible.value === 'sidebar' ? 'none' : 'sidebar'
}
function toggleMobileTools() {
  mobileDrawerVisible.value = mobileDrawerVisible.value === 'tools' ? 'none' : 'tools'
}
// Backdrop tap (or anything else that wants to dismiss whatever's open): for varNav/preview/
// settingsDock, actually flip the underlying store flag off (closing = closing, same as tapping
// its own header/tools-sheet button again) rather than just hiding it visually — otherwise the
// panel would stay "open" in the data sense while invisible, which would be surprising if the
// viewport later grows past the mobile breakpoint. Sidebar and the tools sheet have no
// underlying flag (they're always-mounted/ephemeral respectively), so those just reset the
// local state.
function closeMobileDrawer() {
  if (mobileDrawerVisible.value === 'varNav') store.varNavOpen = false
  else if (mobileDrawerVisible.value === 'preview') store.previewOpen = false
  else if (mobileDrawerVisible.value === 'settingsDock') tabsStore.settingsDockOpen = false
  mobileDrawerVisible.value = 'none'
}
// Every tools-sheet item runs its action then closes the sheet. If the action itself opens one
// of the tracked panels (e.g. toggling varNavOpen on), the watchers below reliably re-open the
// matching drawer state right after — Vue's default watcher flush runs after this synchronous
// handler finishes, so "close the sheet" here and "open the new drawer" there don't race.
function runTool(fn: () => void) {
  fn()
  mobileDrawerVisible.value = 'none'
}

watch(() => store.varNavOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'varNav'
  else if (mobileDrawerVisible.value === 'varNav') mobileDrawerVisible.value = 'none'
})
watch(() => store.previewOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'preview'
  else if (mobileDrawerVisible.value === 'preview') mobileDrawerVisible.value = 'none'
})
watch(() => tabsStore.settingsDockOpen, (open) => {
  if (!isMobile.value) return
  if (open) mobileDrawerVisible.value = 'settingsDock'
  else if (mobileDrawerVisible.value === 'settingsDock') mobileDrawerVisible.value = 'none'
})
// Switching block/regex mode (from the tools sheet on mobile) brings the sidebar into view,
// since that's the part that just changed and is presumably what the user wants to look at.
watch(() => tabsStore.sidebarMode, () => { if (isMobile.value) mobileDrawerVisible.value = 'sidebar' })
// Whenever the active tab changes — most commonly the user picked something in the sidebar
// drawer — the editor underneath is what they actually want to see next, so close WHATEVER
// overlay is currently open, not just the sidebar specifically.
watch(() => tabsStore.activeId, () => {
  if (isMobile.value) mobileDrawerVisible.value = 'none'
})
// Search/var-nav "jump to" actions (jumpToSearchResult/jumpToVarOp/jumpToPopupVar in
// presetStore.ts) call requestEditorJump, which bumps store.editorJump's token on every single
// call — including when the jump target is inside the tab that's ALREADY active, where
// tabsStore.activeId wouldn't change at all and the watcher above would never fire. Without this
// second watcher, jumping to a different variable/match inside the block you're already editing
// left the var-nav/preview sheet sitting on top of the editor with nothing visibly happening —
// exactly the "click does nothing" symptom, just for the one case activeId alone can't catch.
watch(() => store.editorJump, () => {
  if (isMobile.value) mobileDrawerVisible.value = 'none'
})

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
    title: store.t('shared.confirm.switchPreset.title'),
    message: store.t('shared.confirm.switchPreset.message', { name: esc(name) }),
    confirmText: store.t('shared.confirm.switchPreset.confirm'),
    cancelText: store.t('common.cancel'),
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
    title: store.t('shared.prompt.newPreset.title'),
    placeholder: store.t('shared.prompt.newPreset.placeholder'),
    confirmText: store.t('shared.prompt.newPreset.confirm'), 
    cancelText: store.t('shared.prompt.newPreset.cancel'),
    onConfirm: (name) => {
      if (store.presetList.some(p => p.name === name)) { store.showToast(store.t('shared.toast.duplicatePresetName')); return }
      store.createPreset(name)
    },
  })
}
function onDeletePreset() {
  if (!store.presetName) return
  confirmStore.ask({
    title: store.t('shared.confirm.deletePreset.title'),
    message: store.t('shared.confirm.deletePreset.message', { name: esc(store.presetName) }),
    confirmText: store.t('common.delete'),
    cancelText: store.t('common.cancel'),
    onConfirm: () => store.removeCurrentPreset(),
  })
}
</script>
