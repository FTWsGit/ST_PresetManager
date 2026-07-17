<template>
  <!-- Settings -->
  <div v-if="store.settingsOpen" class="pm-modal-overlay" @click.self="store.settingsOpen = false">
    <div class="pm-modal lg">
      <h3>⚙ {{ store.t('shared.settings.title') }}</h3>
      <div class="pm-modal-scroll">
        <div class="pm-settings-section">
          <label>{{ store.t('shared.settings.language') }}</label>
          <select class="pm-select-wide" :value="store.settings.language"
                  @change="store.settings.language = ($event.target as HTMLSelectElement).value as 'zh-CN' | 'en'; store.saveSettings()">
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div class="pm-settings-section">
          <label>{{ store.t('shared.settings.fontSize') }}</label>
          <div class="pm-row">
            <input type="range" min="11" max="22" step="0.5" class="pm-range-wide"
                   v-model.number="draftFontSize"
                   @change="commitFontSize" />
            <span class="pm-value-label">{{ draftFontSize }}px</span>
          </div>
        </div>
        <div class="pm-settings-section">
          <label>{{ store.t('shared.settings.fontFamily') }}</label>
          <select class="pm-select-wide" :value="store.settings.editorFontFamily"
                  @change="store.settings.editorFontFamily = ($event.target as HTMLSelectElement).value; store.saveSettings()">
            <option v-for="f in FONT_OPTIONS" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
        </div>
        <div class="pm-settings-section">
          <label>{{ store.t('shared.settings.syntaxColors') }}</label>
          <div v-for="(labelKey, key) in SYNTAX_LABEL_KEYS" :key="key" class="pm-color-row">
            <input type="color" v-model="draftColors[key as keyof SyntaxColors]" @change="commitColor(key as keyof SyntaxColors)" />
            <span class="cl-label">{{ store.t(labelKey) }}</span>
            <span class="cl-hex">{{ draftColors[key as keyof SyntaxColors] }}</span>
          </div>
        </div>
      </div>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="store.resetSettings()">{{ store.t('shared.settings.resetDefaults') }}</button>
        <button class="pm-btn accent" @click="store.settingsOpen = false">{{ store.t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- Generic Confirm (confirmStore) — every "are you sure" in the app goes through this one dialog:
       preset switch/delete, block delete, regex delete, CopyPanel reload/remove/close-unsaved.
       NEVER use getHostWindow().confirm() — it's unreliable inside TauriTavern's WebView2 host,
       see confirmStore.ts's doc comment. -->
  <div v-if="confirmStore.open" class="pm-modal-overlay" @click.self="confirmStore.cancel()">
    <div class="pm-modal sm">
      <h3>{{ confirmStore.title }}</h3>
      <p class="pm-confirm-text" v-html="confirmStore.message"></p>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="confirmStore.cancel()">{{ confirmStore.cancelText }}</button>
        <button class="pm-btn accent" :class="{ 'pm-confirm-danger': confirmStore.danger }" @click="confirmStore.confirm()">{{ confirmStore.confirmText }}</button>
      </div>
    </div>
  </div>

  <!-- Generic Prompt (confirmStore) — replaces window.prompt(), same TauriTavern reasoning. -->
  <div v-if="confirmStore.promptOpen" class="pm-modal-overlay" @click.self="confirmStore.cancelPrompt()">
    <div class="pm-modal sm">
      <h3>{{ confirmStore.promptTitle }}</h3>
      <p v-if="confirmStore.promptMessage" class="pm-confirm-text">{{ confirmStore.promptMessage }}</p>
      <input type="text" class="pm-prompt-input" ref="promptInputRef"
             v-model="confirmStore.promptValue"
             :placeholder="confirmStore.promptPlaceholder"
             @keydown.enter.prevent="confirmStore.confirmPrompt()"
             @keydown.esc.prevent="confirmStore.cancelPrompt()" />
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="confirmStore.cancelPrompt()">{{ confirmStore.promptCancelText }}</button>
        <button class="pm-btn accent" @click="confirmStore.confirmPrompt()">{{ confirmStore.promptConfirmText }}</button>
      </div>
    </div>
  </div>

  <!-- Add Hidden -->
  <div v-if="store.hiddenOpen" class="pm-modal-overlay" @click.self="store.hiddenOpen = false">
    <div class="pm-modal">
      <h3>{{ store.t('block.sidebar.hiddenBlock') }}</h3>
      <div class="pm-modal-list">
        <div v-if="!store.hiddenBlocks.length" class="pm-empty-note">{{ store.t('block.copyPanel.noBlocks') }}</div>
        <div v-for="p in store.hiddenBlocks" :key="p.identifier" class="pm-modal-item"
             @click="store.addHiddenBlock(p.identifier); store.hiddenOpen = false">
          <span class="pm-block-role" :class="roleClass(p.role)">{{ p.role }}</span>
          <span class="pm-flex1">{{ p.name || p.identifier }}</span>
        </div>
      </div>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="store.hiddenOpen = false">{{ store.t('common.close') }}</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="pm-toast" :class="{ show: store.toastVisible }">{{ store.toastMsg }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, nextTick } from 'vue'
import { usePresetStore } from '../../stores/presetStore'
import { FONT_OPTIONS, SYNTAX_LABEL_KEYS } from '../../types'
import type { SyntaxColors } from '../../types'
import { roleClass } from '../../utils'
import { useConfirmStore } from '../../stores/confirmStore'

const confirmStore = useConfirmStore()
const store = usePresetStore()

// Local drafts for the two controls that fire continuously while being dragged (range slider,
// color picker). Binding these straight to store.settings meant every tick of the drag pushed
// a reactive update through cssVars -> the .st-pm inline style -> a full style recalc, PLUS a
// synchronous localStorage write, dozens of times a second — visibly janky. Now the draft only
// updates local component state while dragging, and commits to the store (and localStorage)
// once, on release.
const draftFontSize = ref(store.settings.editorFontSize)
const draftColors = reactive<SyntaxColors>({ ...store.settings.syntaxColors })

watch(() => store.settingsOpen, (open) => {
  if (open) {
    // Re-sync drafts each time the panel opens, in case settings changed elsewhere (e.g. Reset Defaults).
    draftFontSize.value = store.settings.editorFontSize
    Object.assign(draftColors, store.settings.syntaxColors)
  }
})
watch(() => store.settings.editorFontSize, (v) => { draftFontSize.value = v })
watch(() => store.settings.syntaxColors, (v) => { Object.assign(draftColors, v) }, { deep: true })

function commitFontSize() {
  store.settings.editorFontSize = draftFontSize.value
  store.saveSettings()
}
function commitColor(key: keyof SyntaxColors) {
  store.settings.syntaxColors[key] = draftColors[key]
  store.saveSettings()
}

// Prompt modal: autofocus + select-all whenever it opens, matching window.prompt()'s old
// default text-selected behavior.
const promptInputRef = ref<HTMLInputElement>()
watch(() => confirmStore.promptOpen, (open) => {
  if (open) nextTick(() => { promptInputRef.value?.focus(); promptInputRef.value?.select() })
})
</script>
