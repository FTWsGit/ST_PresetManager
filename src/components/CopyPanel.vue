<template>
  <div v-if="store.copyPanelOpen" class="pm-modal-overlay" @click.self="close">
    <div class="pm-modal pm-cp-modal">
      <h3>🔀 Copy Blocks Between Presets</h3>
      <div class="pm-cp-body">
        <div class="pm-cp-col">
          <div class="pm-cp-col-head">
            <select class="pm-cp-sel" v-model="leftName">
              <option value="" disabled>Select preset…</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="pm-btn" :disabled="!leftName" @click="loadSide('left')">Load</button>
          </div>
          <template v-if="leftData">
            <div class="pm-cp-toolbar">
              <button class="pm-btn" @click="selectAll('left')">All</button>
              <button class="pm-btn" @click="clearSel('left')">None</button>
              <span class="pm-search-count">{{ leftSel.size }}/{{ leftData.prompts.length }}</span>
              <span class="pm-spacer"></span>
              <button class="pm-btn accent" :disabled="!leftDirty" @click="saveSide('left')">💾 Save{{ leftDirty ? ' *' : '' }}</button>
            </div>
            <div class="pm-cp-list">
              <p v-if="!leftData.prompts.length" class="pm-cp-empty">No blocks</p>
              <div v-for="b in leftData.prompts" :key="b.identifier" class="pm-cp-item pm-block-item" :class="{ selected: leftSel.has(b.identifier) }" @click="onItemClick('left', b.identifier, $event)">
                <span class="pm-block-role" :class="roleClass(b.role)">{{ b.role }}</span>
                <span class="pm-block-name">{{ b.name || b.identifier }}</span>
                <span class="pm-block-act del" title="Remove from this list" @click.stop="removeBlock('left', b.identifier)">🗑</span>
              </div>
            </div>
          </template>
          <p v-else class="pm-cp-empty">Pick and load a preset</p>
        </div>

        <div class="pm-cp-mid">
          <button class="pm-btn accent" :disabled="!leftSel.size || !rightData" title="Copy selected → right" @click="copy('left')">▶</button>
          <button class="pm-btn accent" :disabled="!rightSel.size || !leftData" title="Copy selected → left" @click="copy('right')">◀</button>
        </div>

        <div class="pm-cp-col">
          <div class="pm-cp-col-head">
            <select class="pm-cp-sel" v-model="rightName">
              <option value="" disabled>Select preset…</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="pm-btn" :disabled="!rightName" @click="loadSide('right')">Load</button>
          </div>
          <template v-if="rightData">
            <div class="pm-cp-toolbar">
              <button class="pm-btn" @click="selectAll('right')">All</button>
              <button class="pm-btn" @click="clearSel('right')">None</button>
              <span class="pm-search-count">{{ rightSel.size }}/{{ rightData.prompts.length }}</span>
              <span class="pm-spacer"></span>
              <button class="pm-btn accent" :disabled="!rightDirty" @click="saveSide('right')">💾 Save{{ rightDirty ? ' *' : '' }}</button>
            </div>
            <div class="pm-cp-list">
              <p v-if="!rightData.prompts.length" class="pm-cp-empty">No blocks</p>
              <div v-for="b in rightData.prompts" :key="b.identifier" class="pm-cp-item pm-block-item" :class="{ selected: rightSel.has(b.identifier) }" @click="onItemClick('right', b.identifier, $event)">
                <span class="pm-block-role" :class="roleClass(b.role)">{{ b.role }}</span>
                <span class="pm-block-name">{{ b.name || b.identifier }}</span>
                <span class="pm-block-act del" title="Remove from this list" @click.stop="removeBlock('right', b.identifier)">🗑</span>
              </div>
            </div>
          </template>
          <p v-else class="pm-cp-empty">Pick and load a preset</p>
        </div>
      </div>
      <div class="pm-modal-footer">
        <button class="pm-btn" @click="close">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStore } from '../store'
import * as ST from '../sillytavern'
import type { PresetListEntry } from '../sillytavern'
import type { PresetData, PresetBlock, OrderItem } from '../types'
import { applyMultiSelect } from '../utils'
import { getHostWindow } from '../composables/hostEnv'

const store = useStore()

const presetOptions = ref<PresetListEntry[]>([])

const leftName = ref('')
const leftData = ref<PresetData | null>(null)
const leftSel = ref<Set<string>>(new Set())
const leftAnchor = ref<string | null>(null)
const leftDirty = ref(false)

const rightName = ref('')
const rightData = ref<PresetData | null>(null)
const rightSel = ref<Set<string>>(new Set())
const rightAnchor = ref<string | null>(null)
const rightDirty = ref(false)

// Re-list available presets fresh every time the panel opens — deliberately independent of the
// main editor's store.presetList (which may be stale, or never populated if the main panel's
// list wasn't opened this session).
watch(() => store.copyPanelOpen, (open) => {
  if (!open) return
  try { presetOptions.value = ST.listPresets() }
  catch (e: any) { store.showToast('Could not list presets: ' + (e?.message || e)) }
})

function roleClass(role: string) {
  return role === 'user' ? 'user' : role === 'assistant' ? 'asst' : 'sys'
}

function genId() {
  return 'copy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadSide(side: 'left' | 'right') {
  const name = side === 'left' ? leftName.value : rightName.value
  const dirty = side === 'left' ? leftDirty.value : rightDirty.value
  if (!name) return
  if (dirty && !getHostWindow().confirm(`Reloading "${name}" will discard unsaved copy/delete changes on this side. Continue?`)) return
  try {
    const data = ST.getPresetByName(name)
    if (!data) { store.showToast('Preset not found: ' + name); return }
    if (side === 'left') { leftData.value = data; leftSel.value = new Set(); leftAnchor.value = null; leftDirty.value = false }
    else { rightData.value = data; rightSel.value = new Set(); rightAnchor.value = null; rightDirty.value = false }
  } catch (e: any) { store.showToast('Load failed: ' + (e?.message || e)) }
}

// Same ctrl/shift/plain click model as the main editor's sidebar (Sidebar.vue → store.ts's
// selectBlock) — see applyMultiSelect's doc comment in utils.ts for the exact semantics.
function onItemClick(side: 'left' | 'right', id: string, e: MouseEvent) {
  const data = side === 'left' ? leftData.value : rightData.value
  if (!data) return
  const sel = side === 'left' ? leftSel.value : rightSel.value
  const anchor = side === 'left' ? leftAnchor.value : rightAnchor.value
  const all = data.prompts.map(b => b.identifier)
  const next = applyMultiSelect(
    { selected: sel, anchor },
    id, all,
    { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }
  )
  if (side === 'left') { leftSel.value = next.selected; leftAnchor.value = next.anchor }
  else { rightSel.value = next.selected; rightAnchor.value = next.anchor }
}
function selectAll(side: 'left' | 'right') {
  const data = side === 'left' ? leftData.value : rightData.value
  if (!data) return
  const all = new Set(data.prompts.map(b => b.identifier))
  if (side === 'left') { leftSel.value = all; leftAnchor.value = null } else { rightSel.value = all; rightAnchor.value = null }
}
function clearSel(side: 'left' | 'right') {
  if (side === 'left') { leftSel.value = new Set(); leftAnchor.value = null } else { rightSel.value = new Set(); rightAnchor.value = null }
}

/** prompt_order in a raw PresetData is always a flat array (groups are just `_gid`-tagged
 *  entries within it, see store.ts's importOrderWithGroups/exportOrder) — no tree to build here. */
function ensureOrder(data: PresetData): OrderItem[] {
  if (!Array.isArray(data.prompt_order) || !data.prompt_order.length) data.prompt_order = [{ order: [] }]
  if (!Array.isArray(data.prompt_order[0].order)) data.prompt_order[0].order = []
  return data.prompt_order[0].order
}

function copy(from: 'left' | 'right') {
  const srcData = from === 'left' ? leftData.value : rightData.value
  const dstData = from === 'left' ? rightData.value : leftData.value
  const srcSel = from === 'left' ? leftSel.value : rightSel.value
  if (!srcData || !dstData) { store.showToast('Load both sides first'); return }
  if (!srcSel.size) { store.showToast('Select block(s) to copy first'); return }

  const dstOrder = ensureOrder(dstData)
  const existingIds = new Set(dstData.prompts.map(p => p.identifier))
  let n = 0
  for (const b of srcData.prompts) {
    if (!srcSel.has(b.identifier)) continue
    const clone: PresetBlock = JSON.parse(JSON.stringify(b))
    // Always mint a fresh identifier on the destination side — reusing the source's own id
    // risks colliding with an unrelated block that already happens to use it over there (or
    // with an earlier copy of this same block pasted in previously), which would silently
    // overwrite/duplicate the wrong block instead of adding a new one.
    let newId = genId()
    while (existingIds.has(newId)) newId = genId()
    clone.identifier = newId
    existingIds.add(newId)
    dstData.prompts.push(clone)
    dstOrder.push({ identifier: newId, enabled: true })
    n++
  }
  if (from === 'left') rightDirty.value = true; else leftDirty.value = true
  store.showToast(`Copied ${n} block(s) ${from === 'left' ? '→ right' : '→ left'}`)
}

function removeBlock(side: 'left' | 'right', id: string) {
  const data = side === 'left' ? leftData.value : rightData.value
  if (!data) return
  const pi = data.prompts.findIndex(p => p.identifier === id)
  if (pi >= 0) data.prompts.splice(pi, 1)
  const order = ensureOrder(data)
  for (let i = order.length - 1; i >= 0; i--) if (order[i].identifier === id) order.splice(i, 1)
  const sel = side === 'left' ? leftSel.value : rightSel.value
  if (sel.has(id)) {
    const next = new Set(sel); next.delete(id)
    if (side === 'left') leftSel.value = next; else rightSel.value = next
  }
  const anchorRef = side === 'left' ? leftAnchor : rightAnchor
  if (anchorRef.value === id) anchorRef.value = null
  if (side === 'left') leftDirty.value = true; else rightDirty.value = true
}

async function saveSide(side: 'left' | 'right') {
  const name = side === 'left' ? leftName.value : rightName.value
  const data = side === 'left' ? leftData.value : rightData.value
  if (!data || !name) return
  try {
    // Same rule as store.ts's doSavePreset(): never hand ST a live reactive object, always a
    // plain deep clone (structuredClone inside ST's savePreset can't clone a Vue Proxy).
    await ST.savePresetAs(name, JSON.parse(JSON.stringify(data)))
    if (side === 'left') leftDirty.value = false; else rightDirty.value = false
    store.refreshPresetList()
    store.showToast('Saved: ' + name)
    // This tool operates on its own independently-loaded copy of the preset data, not on the
    // main editor's live store — if this happens to be the same preset currently open there,
    // that in-memory copy is now stale relative to what was just written to disk.
    if (name === store.presetName) store.showToast('Note: this is your currently-open preset — Reload it in the main editor to see these changes')
  } catch (e: any) { store.showToast('Save failed: ' + (e?.message || e)) }
}

function close() {
  if (leftDirty.value || rightDirty.value) {
    if (!getHostWindow().confirm('You have unsaved copy/delete changes on one or both sides. Close anyway?')) return
  }
  store.copyPanelOpen = false
}
</script>
