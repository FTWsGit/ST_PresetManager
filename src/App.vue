<template>
  <div class="st-pm" :style="store.cssVars">
    <Transition name="pm-fab">
      <button v-if="!store.panelOpen" class="pm-fab" :class="{ dragging: fabDragging }"
              :style="fabStyle" @pointerdown="onFabPointerDown" @click="onFabClick">PM</button>
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
            <button class="pm-btn" @click="store.settingsOpen = true">{{ store.t('shared.header.settings') }}</button>
            <div class="pm-sep"></div>
            <div class="pm-mode-switch">
              <button class="pm-btn sm" :class="{ active: tabsStore.sidebarMode === 'block' }" @click="tabsStore.setSidebarMode('block')">{{ store.t('shared.header.mode.block') }}</button>
              <button class="pm-btn sm" :class="{ active: tabsStore.sidebarMode === 'regex' }" @click="tabsStore.setSidebarMode('regex')">{{ store.t('shared.header.mode.regex') }}</button>
            </div>
            <div class="pm-sep"></div>
            <button class="pm-btn" @click="store.copyPanelOpen = true">{{ store.t('shared.header.copyBlocks') }}</button>
            <button class="pm-btn" :class="{ active: store.searchOpen }" @click="toggleSearch">{{ store.t('shared.header.search') }}</button>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useIsMobile, getHostWindow } from './composables/hostEnv'

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

// FAB long-press-to-move. Mirrors the long-press pattern in BlockSidebar.vue's
// onItemMouseDown (same LONG_PRESS_MS/DRAG_THRESHOLD) and the "draft during drag, commit once on
// release" rule used everywhere else a drag ends up in `settings` (see usePanelResize call sites) —
// but this one isn't a good fit for either existing composable: useDragReorder is drop-target/list
// based, and usePanelResize only moves one axis. The FAB is a single free-floating element, so it
// gets its own small handler here rather than a third composable for one caller.
//
// Distinguishing "tap to open" from "long-press to drag" without delaying the tap: a normal
// pointerdown->pointerup within LONG_PRESS_MS always still fires a plain `click` (we never call
// preventDefault on pointerdown), so quick taps are exactly as fast as before. Only if the timer
// actually fires do we flip into drag mode and start suppressing the click that would otherwise
// follow the pointerup.
const FAB_SIZE = 48 // keep in sync with .pm-fab's width/height in main.css
const FAB_DRAG_THRESHOLD = 4
const FAB_LONG_PRESS_MS = 100
const fabDragging = ref(false)
let fabLongPressTimer: ReturnType<typeof setTimeout> | null = null
let fabSuppressClick = false

function cancelFabLongPress() {
  if (fabLongPressTimer) { clearTimeout(fabLongPressTimer); fabLongPressTimer = null }
}

function clampFabPos(x: number, y: number) {
  const hostWin = getHostWindow()
  // Only clamps against the raw viewport box, not env(safe-area-inset-*) — reading a CSS env()
  // value back out in JS needs an extra getComputedStyle round-trip for marginal benefit here.
  // The CSS default position (bottom/right, see .pm-fab) still honors the safe-area media query;
  // this only applies once the user has actually dragged the FAB somewhere themselves.
  const maxX = Math.max(0, hostWin.innerWidth - FAB_SIZE)
  const maxY = Math.max(0, hostWin.innerHeight - FAB_SIZE)
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) }
}

const fabStyle = computed(() => {
  const pos = store.settings.fabPos
  if (!pos) return undefined
  return { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' }
})

function onFabPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const hostWin = getHostWindow()
  const fabEl = e.currentTarget as HTMLElement
  const startX = e.clientX, startY = e.clientY
  const pointerId = e.pointerId
  let dragging = false

  function onMove(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    if (!dragging) {
      // Moved before the long-press fired — not a drag start, let the pending timer keep
      // running only while the pointer is still basically still; once it's moved past the
      // threshold this was never a long-press to begin with (e.g. an accidental drag-ish
      // gesture), so cancel and leave it as a would-be plain click.
      if (Math.abs(ev.clientX - startX) < FAB_DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < FAB_DRAG_THRESHOLD) return
      cancelFabLongPress()
      return
    }
    const { x, y } = clampFabPos(ev.clientX - FAB_SIZE / 2, ev.clientY - FAB_SIZE / 2)
    store.settings.fabPos = { x, y } // draft only — not persisted to localStorage until release
  }
  function onUp(ev: PointerEvent) {
    if (ev.pointerId !== pointerId) return
    cancelFabLongPress()
    hostWin.removeEventListener('pointermove', onMove)
    hostWin.removeEventListener('pointerup', onUp)
    hostWin.removeEventListener('pointercancel', onUp)
    if (dragging) {
      fabDragging.value = false
      store.saveSettings() // commit once, on release — same rule as panel-resize/color-picker settings
    }
  }
  hostWin.addEventListener('pointermove', onMove)
  hostWin.addEventListener('pointerup', onUp)
  hostWin.addEventListener('pointercancel', onUp)

  fabLongPressTimer = setTimeout(() => {
    fabLongPressTimer = null
    dragging = true
    fabDragging.value = true
    fabSuppressClick = true
    if (hostWin.navigator?.vibrate) hostWin.navigator.vibrate(40)
    // Freeze the FAB's current rendered box (still on the default bottom/right anchor the first
    // time this runs) into an explicit left/top so it can then follow the pointer freely.
    const r = fabEl.getBoundingClientRect()
    store.settings.fabPos = clampFabPos(r.left, r.top)
  }, FAB_LONG_PRESS_MS)
}

function onFabClick() {
  if (fabSuppressClick) { fabSuppressClick = false; return }
  openPanel()
}

// If a saved position is ever left stranded off-screen (most commonly: rotating a phone, or
// resizing a desktop browser window narrower after dragging the FAB near an edge), pull it back
// on the next resize rather than leaving it stuck somewhere unreachable.
function onHostResize() {
  const pos = store.settings.fabPos
  if (!pos) return
  const clamped = clampFabPos(pos.x, pos.y)
  if (clamped.x !== pos.x || clamped.y !== pos.y) {
    store.settings.fabPos = clamped
    store.saveSettings()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!store.panelOpen) return
  
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    store.doSavePreset()
  }
}


onMounted(() => {
  onHostResize()
  getHostWindow().addEventListener('resize', onHostResize)
  getHostWindow().addEventListener('keydown', handleKeydown)
})
onUnmounted(() => {
  getHostWindow().removeEventListener('resize', onHostResize)
  getHostWindow().removeEventListener('keydown', handleKeydown)
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
