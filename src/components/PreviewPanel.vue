<template>
  <div class="pm-preview-panel" :class="{ float: store.settings.previewFloat }" :style="{ width: store.settings.previewWidth + 'px' }">
    <div class="pm-right-resize-handle" :class="{ active: resize.active.value }" @mousedown="resize.onMouseDown"></div>
    <div class="pm-rp-header">
      <span>👁 Prompt Preview</span>
      <div style="display:flex;gap:4px">
        <button v-if="store.previewMode === 'blocks'" class="pm-btn icon-btn" title="Collapse/Expand all" @click="store.toggleAllPreviewBlocks()">▾</button>
        <button class="pm-btn icon-btn" :class="{ active: store.settings.previewFloat }" title="Toggle float mode" @click="toggleFloat">📌</button>
        <button class="pm-btn close-btn" @click="store.previewOpen = false" style="padding:2px 6px">✕</button>
      </div>
    </div>
    <div class="pp-tools">
      <div class="pm-preview-tabs">
        <button class="pm-preview-tab" :class="{ active: store.previewMode === 'blocks' }" @click="store.previewMode = 'blocks'">Per-Block (Precise)</button>
        <button class="pm-preview-tab" :class="{ active: store.previewMode === 'raw' }" @click="store.previewMode = 'raw'">Full Text (Raw)</button>
      </div>
      <p class="pp-mode-hint">
        <template v-if="store.previewMode === 'blocks'">Real per-block rendering from SillyTavern's own prompt manager. Highlighted text was substituted in (macros/regex/etc) — not literally in the block's source.</template>
        <template v-else>The exact `messages` array SillyTavern was about to send to the API — captured off a real generation that's cancelled immediately after, so nothing actually gets sent.</template>
      </p>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="pm-btn accent" :disabled="store.previewLoading" @click="generate()">
          <template v-if="store.previewLoading">⏳ Generating…</template>
          <template v-else>▶ Generate</template>
        </button>
        <button class="pm-btn" @click="copyPreview()">📋 Copy</button>
      </div>
      <p v-if="store.previewError" class="pp-error">⚠ {{ store.previewError }}</p>
    </div>
    <div class="pp-output-wrap">
      <template v-if="store.previewMode === 'blocks'">
        <template v-if="store.previewBlockGroups.length">
          <div v-for="g in store.previewBlockGroups" :key="g.id" class="pb-block" :class="{ collapsed: store.previewCollapsed[g.id] }">
            <div class="pb-header" @click="store.togglePreviewBlock(g.id)">
              <span v-if="g.isMarker" class="pb-role pb-marker">MARKER</span>
              <span class="pb-name">{{ g.name }}</span>
              <span class="pb-msg-count" v-if="g.messages.length > 1">{{ g.messages.length }} messages</span>
              <button class="pb-toggle" title="Collapse/Expand">▾</button>
            </div>
            <div class="pb-body">
              <div v-for="(m, mi) in g.messages" :key="mi" class="pb-msg">
                <div class="pb-msg-meta">
                  <span class="pb-role" :class="roleClass(m.role)">{{ m.role.toUpperCase() }}</span>
                  <span class="pb-tokens">{{ m.tokens }} tok</span>
                </div>
                <pre class="pb-msg-text" v-html="renderSegments(m.segments)"></pre>
              </div>
            </div>
          </div>
        </template>
        <p v-else-if="!store.previewLoading" style="color:var(--pm-tx3)">Click "Generate" for a real per-block render (this runs an actual dry-run generation).</p>
      </template>
      <template v-else>
        <pre v-if="store.previewRawText" class="pp-raw">{{ store.previewRawText }}</pre>
        <p v-else-if="!store.previewLoading" style="color:var(--pm-tx3)">Click "Generate" to capture the final request — this briefly starts a real generation and cancels it right after.</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStore } from '../store'
import { esc } from '../utils'
import { usePanelResize } from '../composables/usePanelResize'
import { watch } from 'vue'
import type { PreviewSegment } from '../types'

const store = useStore()

const resize = usePanelResize({
  getWidth: () => store.settings.previewWidth,
  setWidth: (w) => { store.settings.previewWidth = w },
  min: 350, max: 1100, dir: 'left',
})
watch(() => resize.active.value, (v) => { if (!v) store.saveSettings() })

function toggleFloat() {
  store.settings.previewFloat = !store.settings.previewFloat
  store.saveSettings()
}

function roleClass(role: string) {
  return role === 'user' ? 'pb-user' : role === 'assistant' ? 'pb-asst' : 'pb-sys'
}

function renderSegments(segments: PreviewSegment[]) {
  return segments.map(s => s.added ? `<span class="phl">${esc(s.text)}</span>` : esc(s.text)).join('')
}

function generate() {
  if (store.previewMode === 'blocks') store.generatePreviewBlocks()
  else store.generatePreviewRaw()
}

function copyPreview() {
  const text = store.previewMode === 'blocks'
    ? store.previewBlockGroups.flatMap(g => g.messages.map(m => m.segments.map(s => s.text).join(''))).join('\n\n')
    : store.previewRawText
  if (!text.trim()) { store.showToast('Nothing to copy'); return }
  navigator.clipboard.writeText(text).then(() => store.showToast('Copied')).catch(() => store.showToast('Copy failed'))
}
</script>
