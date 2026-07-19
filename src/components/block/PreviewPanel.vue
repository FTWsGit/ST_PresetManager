<template>
  <div class="pm-preview-panel" :class="{ float: store.settings.previewFloat }" :style="{ width: store.settings.previewWidth + 'px' }">
    <div class="pm-right-resize-handle" :class="{ active: resize.active.value }" @pointerdown="resize.onPointerDown"></div>
    <div class="pm-rp-header">
      <span>{{ store.t('block.preview.title') }}</span>
      <div class="pm-row-tight">
        <button v-if="store.previewMode === 'blocks'" class="pm-btn icon-btn" :title="store.t('block.preview.collapseExpand')" @click="store.toggleAllPreviewBlocks()">▾</button>
        <button class="pm-btn icon-btn" :class="{ active: store.settings.previewFloat }" :title="store.t('block.preview.toggleFloat')" @click="toggleFloat">📌</button>
        <button class="pm-btn close-btn compact" @click="store.previewOpen = false">✕</button>
      </div>
    </div>
    <div class="pp-tools">
      <div class="pm-preview-tabs">
        <button class="pm-preview-tab" :class="{ active: store.previewMode === 'blocks' }" @click="store.previewMode = 'blocks'">{{ store.t('block.preview.modeBlocks') }}</button>
        <button class="pm-preview-tab" :class="{ active: store.previewMode === 'raw' }" @click="store.previewMode = 'raw'">{{ store.t('block.preview.modeRaw') }}</button>
      </div>
      <p class="pp-mode-hint">
        <template v-if="store.previewMode === 'blocks'">{{ store.t('block.preview.hintBlocks') }}</template>
        <template v-else>{{ store.t('block.preview.hintRaw') }}</template>
      </p>
      <div class="pm-row-mt">
        <button class="pm-btn accent" :disabled="store.previewLoading" @click="generate()">
          <template v-if="store.previewLoading">{{ store.t('block.preview.generating') }}</template>
          <template v-else>{{ store.t('block.preview.generate') }}</template>
        </button>
        <button class="pm-btn" @click="copyPreview()">{{ store.t('block.preview.copy') }}</button>
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
              <span class="pb-msg-count" v-if="g.messages.length > 1">{{ g.messages.length }} {{ store.t('common.messages') }}</span>
              <button class="pb-toggle" :title="store.t('block.preview.collapseExpandSingle')">▾</button>
            </div>
            <div class="pb-body">
              <div v-for="(m, mi) in g.messages" :key="mi" class="pb-msg">
                <div class="pb-msg-meta">
                  <span class="pb-role" :class="roleClass(m.role)">{{ m.role.toUpperCase() }}</span>
                  <span class="pb-tokens">{{ m.tokens }} {{ store.t('common.tokens') }}</span>
                </div>
                <pre class="pb-msg-text" v-html="renderSegments(m.segments)"></pre>
              </div>
            </div>
          </div>
        </template>
        <p v-else-if="!store.previewLoading" class="pm-muted">{{ store.t('block.preview.emptyBlocks') }}</p>
      </template>
      <template v-else>
        <pre v-if="store.previewRawText" class="pp-raw">{{ store.previewRawText }}</pre>
        <p v-else-if="!store.previewLoading" class="pm-muted">{{ store.t('block.preview.emptyRaw') }}</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePresetStore } from '../../stores/presetStore'
import { esc, roleClass as roleClassOf } from '../../utils'
import { usePanelResize } from '../../composables/usePanelResize'
import { copyToHostClipboard } from '../../composables/hostEnv'
import { watch } from 'vue'
import type { PreviewSegment } from '../../types'

const store = usePresetStore()

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
  return roleClassOf(role, 'pb-')
}

function renderSegments(segments: PreviewSegment[]) {
  return segments.map(s => s.added ? `<span class="phl">${esc(s.text)}</span>` : esc(s.text)).join('')
}

function generate() {
  store.selectPresetByName(store.presetName)
  if (store.previewMode === 'blocks') store.generatePreviewBlocks()
  else store.generatePreviewRaw()
}

async function copyPreview() {
  const text = store.previewMode === 'blocks'
    ? store.previewBlockGroups.flatMap(g => g.messages.map(m => m.segments.map(s => s.text).join(''))).join('\n\n')
    : store.previewRawText
  if (!text.trim()) { store.showToast(store.t('shared.toast.nothingToCopy')); return }
  const ok = await copyToHostClipboard(text)
  store.showToast(ok ? store.t('shared.toast.copied') : store.t('shared.toast.copyFailed'))
}
</script>
