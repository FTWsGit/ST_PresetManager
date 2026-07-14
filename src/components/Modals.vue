<template>
  <!-- Settings -->
  <div v-if="store.settingsOpen" class="pm-modal-overlay" @click.self="store.settingsOpen = false">
    <div class="pm-modal lg">
      <h3>⚙ Editor Settings</h3>
      <div class="pm-modal-scroll">
        <div class="pm-settings-section">
          <label>Font Size</label>
          <div class="pm-row">
            <input type="range" min="11" max="22" step="0.5" class="pm-range-wide"
                   v-model.number="draftFontSize"
                   @change="commitFontSize" />
            <span class="pm-value-label">{{ draftFontSize }}px</span>
          </div>
        </div>
        <div class="pm-settings-section">
          <label>Font Family</label>
          <select class="pm-select-wide" :value="store.settings.editorFontFamily"
                  @change="store.settings.editorFontFamily = ($event.target as HTMLSelectElement).value; store.saveSettings()">
            <option v-for="f in FONT_OPTIONS" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
        </div>
        <div class="pm-settings-section">
          <label>Syntax Highlight Colors</label>
          <div v-for="(label, key) in SYNTAX_LABELS" :key="key" class="pm-color-row">
            <input type="color" v-model="draftColors[key as keyof SyntaxColors]" @change="commitColor(key as keyof SyntaxColors)" />
            <span class="cl-label">{{ label }}</span>
            <span class="cl-hex">{{ draftColors[key as keyof SyntaxColors] }}</span>
          </div>
        </div>
      </div>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="store.resetSettings()">Reset Defaults</button>
        <button class="pm-btn accent" @click="store.settingsOpen = false">Close</button>
      </div>
    </div>
  </div>

  <!-- Confirm Delete -->
  <div v-if="store.confirmOpen" class="pm-modal-overlay" @click.self="store.confirmOpen = false">
    <div class="pm-modal sm">
      <h3>Delete prompt block?</h3>
      <p class="pm-confirm-text">This will permanently remove
        <strong>{{ store.prompts.find(p => p.identifier === store.order[store.confirmIdx]?.identifier)?.name || 'this block' }}</strong>
        from the preset.</p>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="store.confirmOpen = false">Cancel</button>
        <button class="pm-btn accent pm-confirm-danger" @click="store.confirmDelete()">Delete</button>
      </div>
    </div>
  </div>
  <div v-if="confirmStore.open" class="pm-modal-overlay" @click.self="confirmStore.cancel()">
    <div class="pm-modal sm">
      <h3>{{ confirmStore.title }}</h3>
      <p class="pm-confirm-text" v-html="confirmStore.message"></p>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="confirmStore.cancel()">Cancel</button>
        <button class="pm-btn accent pm-confirm-danger" @click="confirmStore.confirm()">Delete</button>
      </div>
    </div>
  </div>

  <!-- Add Hidden -->
  <div v-if="store.hiddenOpen" class="pm-modal-overlay" @click.self="store.hiddenOpen = false">
    <div class="pm-modal">
      <h3>Add Hidden Block</h3>
      <div class="pm-modal-list">
        <div v-if="!store.hiddenBlocks.length" class="pm-empty-note">No hidden blocks</div>
        <div v-for="p in store.hiddenBlocks" :key="p.identifier" class="pm-modal-item"
             @click="store.addHiddenBlock(p.identifier); store.hiddenOpen = false">
          <span class="pm-block-role" :class="roleClass(p.role)">{{ p.role }}</span>
          <span class="pm-flex1">{{ p.name || p.identifier }}</span>
        </div>
      </div>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="store.hiddenOpen = false">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="pm-toast" :class="{ show: store.toastVisible }">{{ store.toastMsg }}</div>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useStore } from '../store'
import { FONT_OPTIONS, SYNTAX_LABELS } from '../types'
import type { SyntaxColors } from '../types'
import { roleClass } from '../utils'
import { useConfirmStore } from '../confirmStore'

const confirmStore = useConfirmStore()
const store = useStore()

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
</script>
