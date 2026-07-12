<template>
  <div v-if="store.copyPanelOpen" class="pm-modal-overlay" @click.self="close">
    <div class="pm-modal pm-cp-modal">
      <h3>🔀 Copy Blocks Between Presets</h3>
      <div class="pm-cp-body">
        <div class="pm-cp-col">
          <div class="pm-cp-col-head">
            <select class="pm-cp-sel" v-model="sides.left.name">
              <option value="" disabled>Select preset…</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="pm-btn" :disabled="!sides.left.name" @click="loadSide('left')">Load</button>
          </div>
          <template v-if="sides.left.data">
            <div class="pm-cp-toolbar">
              <button class="pm-btn" @click="selectAll('left')">All</button>
              <button class="pm-btn" @click="clearSel('left')">None</button>
              <span class="pm-search-count">{{ sides.left.sel.size }}/{{ sides.left.data.prompts.length }}</span>
              <span class="pm-spacer"></span>
              <button class="pm-btn accent" :disabled="!sides.left.dirty" @click="saveSide('left')">💾 Save{{ sides.left.dirty ? ' *' : '' }}</button>
            </div>
            <div class="pm-cp-list">
              <p v-if="!sides.left.data.prompts.length" class="pm-cp-empty">No blocks</p>
              <div v-for="b in sides.left.data.prompts" :key="b.identifier" class="pm-cp-item pm-block-item" :class="{ selected: sides.left.sel.has(b.identifier) }" @click="onItemClick('left', b.identifier, $event)">
                <span class="pm-block-role" :class="roleClass(b.role)">{{ b.role }}</span>
                <span class="pm-block-name">{{ b.name || b.identifier }}</span>
                <span class="pm-block-act del" title="Remove from this list" @click.stop="removeBlock('left', b.identifier)">🗑</span>
              </div>
            </div>
          </template>
          <p v-else class="pm-cp-empty">Pick and load a preset</p>
        </div>

        <div class="pm-cp-mid">
          <button class="pm-btn accent" :disabled="!sides.left.sel.size || !sides.right.data" title="Copy selected → right" @click="copy('left')">▶</button>
          <button class="pm-btn accent" :disabled="!sides.right.sel.size || !sides.left.data" title="Copy selected → left" @click="copy('right')">◀</button>
        </div>

        <div class="pm-cp-col">
          <div class="pm-cp-col-head">
            <select class="pm-cp-sel" v-model="sides.right.name">
              <option value="" disabled>Select preset…</option>
              <option v-for="p in presetOptions" :key="p.name" :value="p.name">{{ p.name }}</option>
            </select>
            <button class="pm-btn" :disabled="!sides.right.name" @click="loadSide('right')">Load</button>
          </div>
          <template v-if="sides.right.data">
            <div class="pm-cp-toolbar">
              <button class="pm-btn" @click="selectAll('right')">All</button>
              <button class="pm-btn" @click="clearSel('right')">None</button>
              <span class="pm-search-count">{{ sides.right.sel.size }}/{{ sides.right.data.prompts.length }}</span>
              <span class="pm-spacer"></span>
              <button class="pm-btn accent" :disabled="!sides.right.dirty" @click="saveSide('right')">💾 Save{{ sides.right.dirty ? ' *' : '' }}</button>
            </div>
            <div class="pm-cp-list">
              <p v-if="!sides.right.data.prompts.length" class="pm-cp-empty">No blocks</p>
              <div v-for="b in sides.right.data.prompts" :key="b.identifier" class="pm-cp-item pm-block-item" :class="{ selected: sides.right.sel.has(b.identifier) }" @click="onItemClick('right', b.identifier, $event)">
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
import { ref, reactive, watch } from 'vue'
import { useStore } from '../store'
import * as ST from '../sillytavern'
import type { PresetListEntry } from '../sillytavern'
import type { PresetData, PresetBlock, OrderItem } from '../types'
import { applyMultiSelect, roleClass } from '../utils'
import { getHostWindow } from '../composables/hostEnv'

const store = useStore()

const presetOptions = ref<PresetListEntry[]>([])

type Side = 'left' | 'right'
interface SideState {
  name: string
  data: PresetData | null
  sel: Set<string>
  anchor: string | null
  dirty: boolean
}
// Was five separate ref() pairs (leftName/rightName, leftData/rightData, ...) with every function
// below doing `side === 'left' ? leftX.value : rightX.value` to pick one. A reactive per-side
// object collapses that into `sides[side].x` everywhere and gives a natural home for the third
// column if this panel ever needs one (e.g. copying into a brand-new preset).
const sides = reactive<Record<Side, SideState>>({
  left: { name: '', data: null, sel: new Set(), anchor: null, dirty: false },
  right: { name: '', data: null, sel: new Set(), anchor: null, dirty: false },
})
const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')

// Re-list available presets fresh every time the panel opens — deliberately independent of the
// main editor's store.presetList (which may be stale, or never populated if the main panel's
// list wasn't opened this session).
watch(() => store.copyPanelOpen, (open) => {
  if (!open) return
  try { presetOptions.value = ST.listPresets() }
  catch (e: any) { store.showToast('Could not list presets: ' + (e?.message || e)) }
})

function genId() {
  return 'copy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadSide(side: Side) {
  const s = sides[side]
  if (!s.name) return
  if (s.dirty && !getHostWindow().confirm(`Reloading "${s.name}" will discard unsaved copy/delete changes on this side. Continue?`)) return
  try {
    const data = ST.getPresetByName(s.name)
    if (!data) { store.showToast('Preset not found: ' + s.name); return }
    s.data = data; s.sel = new Set(); s.anchor = null; s.dirty = false
  } catch (e: any) { store.showToast('Load failed: ' + (e?.message || e)) }
}

// Same ctrl/shift/plain click model as the main editor's sidebar (Sidebar.vue → store.ts's
// selectBlock) — see applyMultiSelect's doc comment in utils.ts for the exact semantics.
function onItemClick(side: Side, id: string, e: MouseEvent) {
  const s = sides[side]
  if (!s.data) return
  const all = s.data.prompts.map(b => b.identifier)
  const next = applyMultiSelect(
    { selected: s.sel, anchor: s.anchor },
    id, all,
    { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }
  )
  s.sel = next.selected; s.anchor = next.anchor
}
function selectAll(side: Side) {
  const s = sides[side]
  if (!s.data) return
  s.sel = new Set(s.data.prompts.map(b => b.identifier))
  s.anchor = null
}
function clearSel(side: Side) {
  sides[side].sel = new Set()
  sides[side].anchor = null
}

/** prompt_order in a raw PresetData is always a flat array (groups are just `_gid`-tagged
 *  entries within it, see store.ts's importOrderWithGroups/exportOrder) — no tree to build here. */
function ensureOrder(data: PresetData): OrderItem[] {
  if (!Array.isArray(data.prompt_order) || !data.prompt_order.length) data.prompt_order = [{ order: [] }]
  if (!Array.isArray(data.prompt_order[0].order)) data.prompt_order[0].order = []
  return data.prompt_order[0].order
}

function copy(from: Side) {
  const src = sides[from]
  const dst = sides[other(from)]
  if (!src.data || !dst.data) { store.showToast('Load both sides first'); return }
  if (!src.sel.size) { store.showToast('Select block(s) to copy first'); return }

  const dstOrder = ensureOrder(dst.data)
  const existingIds = new Set(dst.data.prompts.map(p => p.identifier))
  let n = 0
  for (const b of src.data.prompts) {
    if (!src.sel.has(b.identifier)) continue
    const clone: PresetBlock = JSON.parse(JSON.stringify(b))
    // Always mint a fresh identifier on the destination side — reusing the source's own id
    // risks colliding with an unrelated block that already happens to use it over there (or
    // with an earlier copy of this same block pasted in previously), which would silently
    // overwrite/duplicate the wrong block instead of adding a new one.
    let newId = genId()
    while (existingIds.has(newId)) newId = genId()
    clone.identifier = newId
    existingIds.add(newId)
    dst.data.prompts.push(clone)
    dstOrder.push({ identifier: newId, enabled: true })
    n++
  }
  dst.dirty = true
  store.showToast(`Copied ${n} block(s) ${from === 'left' ? '→ right' : '→ left'}`)
}

function removeBlock(side: Side, id: string) {
  const s = sides[side]
  if (!s.data) return
  const pi = s.data.prompts.findIndex(p => p.identifier === id)
  if (pi >= 0) s.data.prompts.splice(pi, 1)
  const order = ensureOrder(s.data)
  for (let i = order.length - 1; i >= 0; i--) if (order[i].identifier === id) order.splice(i, 1)
  if (s.sel.has(id)) {
    const next = new Set(s.sel); next.delete(id)
    s.sel = next
  }
  if (s.anchor === id) s.anchor = null
  s.dirty = true
}

async function saveSide(side: Side) {
  const s = sides[side]
  if (!s.data || !s.name) return
  try {
    // Same rule as store.ts's doSavePreset(): never hand ST a live reactive object, always a
    // plain deep clone (structuredClone inside ST's savePreset can't clone a Vue Proxy).
    await ST.savePresetAs(s.name, JSON.parse(JSON.stringify(s.data)))
    s.dirty = false
    store.refreshPresetList()
    store.showToast('Saved: ' + s.name)
    // This tool operates on its own independently-loaded copy of the preset data, not on the
    // main editor's live store — if this happens to be the same preset currently open there,
    // that in-memory copy is now stale relative to what was just written to disk.
    if (s.name === store.presetName) store.showToast('Note: this is your currently-open preset — Reload it in the main editor to see these changes')
  } catch (e: any) { store.showToast('Save failed: ' + (e?.message || e)) }
}

function close() {
  if (sides.left.dirty || sides.right.dirty) {
    if (!getHostWindow().confirm('You have unsaved copy/delete changes on one or both sides. Close anyway?')) return
  }
  store.copyPanelOpen = false
}
</script>
