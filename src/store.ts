import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import type { PresetData, PresetBlock, OrderItem, OrderGroup, OrderNode, FlatNode, SearchResult, VarOp, PreviewBlockGroup } from './types'
import * as ST from './sillytavern'
import type { PresetListEntry } from './sillytavern'
import { escRe, macroAwareDiff, applyMultiSelect } from './utils'
import { useUiState } from './composables/useUiState'

export function isGroup(node: OrderNode): node is OrderGroup {
  return 'children' in node && Array.isArray((node as any).children)
}

export const useStore = defineStore('main', () => {
  /* ====== Core State ====== */
  const rawData = ref<PresetData | null>(null)
  const prompts = ref<PresetBlock[]>([])
  const order = ref<OrderNode[]>([])
  const selectedGi = ref<Set<number>>(new Set())
  const anchorGi = ref(-1)
  const selIdx = ref(-1)
  const presetName = ref('')
  const presetList = ref<PresetListEntry[]>([])

  const flatNodes = computed<FlatNode[]>(() => {
    const nodes: FlatNode[] = []
    function walk(arr: OrderNode[], parent: OrderNode[], depth: number) {
      arr.forEach((ref, parentIdx) => {
        const g = isGroup(ref)
        nodes.push({ ref, parent, parentIdx, depth, isGroup: g })
        if (g && !ref.collapsed) {
          walk(ref.children, ref.children as any, depth + 1)
        }
      })
    }
    walk(order.value, order.value, 0)
    return nodes
  })

  /* ====== UI State ====== */
  const panelOpen = ref(false)
  // Settings (font/colors/panel widths) + toast notifications — extracted to useUiState() since
  // neither is actually preset-specific; see that file's doc comment for why this is a
  // composable rather than a second live Pinia store today.
  const { settings, cssVars, saveSettings, resetSettings, toastMsg, toastVisible, showToast } = useUiState()

  /* ====== Dirty tracking (drives the `*` on the header Save button) ======
   * A single deep watcher on `prompts`/`order` covers every mutation path — direct block-content
   * edits from Editor.vue's v-model-style bindings, and every explicit block/group op below
   * (add/delete/hide/reorder/bind/unbind) that pushes/splices those same reactive arrays —
   * without needing a `markDirty()` call sprinkled into each one individually.
   * The only wrinkle: assigning a freshly-loaded preset's data into `prompts`/`order` in
   * applyLoadedPreset() looks exactly like "a change" to this same watcher, so it fires and
   * marks dirty too. applyLoadedPreset() clears it back via nextTick() right after — Vue flushes
   * watchers queued by that assignment before that nextTick callback runs, so the flag always
   * ends up correctly false once the load has fully settled. */
  const dirty = ref(false)
  watch([prompts, order], () => { dirty.value = true }, { deep: true })

  /* ====== Search ====== */
  const searchOpen = ref(false)
  const searchQuery = ref('')
  const searchReplace = ref('')
  const searchResults = ref<SearchResult[]>([])
  const searchIdx = ref(-1)

  /* ====== Var Nav ====== */
  const varNavOpen = ref(false)
  const varFilterQ = ref('')
  const allVarOps = ref<VarOp[]>([])
  const filteredVarOps = ref<VarOp[]>([])
  const varIdx = ref(-1)

  /* ====== Preview ======
   * Two modes, both driven by real SillyTavern rendering (dry-run generate), NOT by our own
   * client-side macro simulation — see 方案B / GENERATE_AFTER_DATA in sillytavern.ts.
   *   'blocks': per-prompt-block cards, via the openai.js promptManager singleton (方案B).
   *   'raw':    one top-to-bottom concatenated prompt, via the GENERATE_AFTER_DATA event.
   */
  const previewOpen = ref(false)
  const previewMode = ref<'blocks' | 'raw'>('blocks')
  const previewLoading = ref(false)
  const previewError = ref('')
  const previewCollapsed = ref<Record<string, boolean>>({})
  const previewBlockGroups = ref<PreviewBlockGroup[]>([])
  const previewRawText = ref('')

  /* ====== Modals ====== */
  const settingsOpen = ref(false)
  const confirmOpen = ref(false)
  const confirmIdx = ref(-1)
  const hiddenOpen = ref(false)
  const copyPanelOpen = ref(false) // Cross-preset block copy tool (CopyPanel.vue) — fully self-contained there, this is just the open flag

  /* ====== Jump requests (Editor listens & scrolls/selects; Sidebar listens & scrolls into view) ====== */
  // incremented token forces watchers to fire even if line/col repeat
  // `keepFocus: true` scrolls the match into view without moving focus/selection into the
  // editor — used while typing in the search box so the editor previews the current match
  // without stealing the keystroke you're mid-typing.
  const editorJump = ref<{ line: number; col: number; len: number; token: number; keepFocus: boolean } | null>(null)
  const sidebarJumpToken = ref(0)
  let jumpCounter = 0
  function requestEditorJump(line: number, col: number, len: number, keepFocus = false) {
    jumpCounter++
    editorJump.value = { line, col, len, token: jumpCounter, keepFocus }
  }
  function requestSidebarScroll() {
    sidebarJumpToken.value++
  }

  /* ====== Computed ====== */
  const currentBlock = computed<PresetBlock | null>(() => {
    if (selIdx.value < 0 || selIdx.value >= flatNodes.value.length) return null
    const node = flatNodes.value[selIdx.value]
    if (node.isGroup) return null
    const item = node.ref as OrderItem
    return prompts.value.find(p => p.identifier === item.identifier) ?? null
  })
  const hasData = computed(() => rawData.value !== null)
  const hiddenBlocks = computed(() => {
    const ids = new Set(order.value.map(o => o.identifier))
    return prompts.value.filter(p => !ids.has(p.identifier))
  })

  /* ====== Preset IO ======
   * loadPresetByName() is the one real "load" primitive — everything else is a thin wrapper
   * around it:
   *   - loadFromContext(): first load when the panel opens, defaults to whatever ST currently
   *     has selected.
   *   - switchPreset(name): explicitly load a DIFFERENT preset than whatever's currently open
   *     here, independent of ST's own selected preset — this is the actual "preset switcher"
   *     rather than being permanently locked to ST's selection.
   *   - refreshPresetList(): (re)populate presetList so the UI has something to pick from; called
   *     automatically on first load, and exposed standalone in case a preset gets added/removed
   *     in ST elsewhere while our panel is open.
   */
  function importOrderWithGroups(raw: OrderItem[]): OrderNode[] {
    const groups = new Map<string, { name: string; collapsed: boolean; enabled: boolean; items: {item: OrderItem; idx: number}[] }>()
    const topLevel: OrderNode[] = []
    const used = new Set<number>()
    raw.forEach((item, i) => {
      if (item._gid) {
        if (!groups.has(item._gid)) {
          groups.set(item._gid, {
            name: item._gname || 'Group',
            collapsed: item._gcollapsed !== false,
            enabled: item._genabled !== false,
            items: []
          })
        }
        groups.get(item._gid)!.items.push({ item, idx: item._gidx ?? 0 })
      }
    })
    groups.forEach(g => g.items.sort((a, b) => a.idx - b.idx))
    raw.forEach((item, i) => {
      if (item._gid) {
        if (used.has(i)) return
        const g = groups.get(item._gid)!
        const group: OrderGroup = {
          id: 'group_' + item._gid,
          _gid: item._gid,
          name: g.name,
          collapsed: g.collapsed,
          enabled: g.enabled,
          children: g.items.map(x => ({ identifier: x.item.identifier, enabled: x.item.enabled }))
        }
        topLevel.push(group)
        g.items.forEach(x => used.add(raw.indexOf(x.item)))
      } else {
        topLevel.push({ identifier: item.identifier, enabled: item.enabled })
      }
    })
    return topLevel
  }

  function exportOrder(nodes: OrderNode[]): OrderItem[] {
    const out: OrderItem[] = []
    nodes.forEach(node => {
      if (isGroup(node)) {
        node.children.forEach((child, idx) => {
          out.push({
            identifier: child.identifier,
            enabled: child.enabled,
            _gid: node._gid,
            _gname: node.name,
            _gcollapsed: node.collapsed,
            _genabled: node.enabled,
            _gidx: idx
          })
        })
      } else {
        out.push({ identifier: node.identifier, enabled: node.enabled })
      }
    })
    return out
  }

  function applyLoadedPreset(data: PresetData, name: string) {
    rawData.value = data
    prompts.value = data.prompts || []
    const po = data.prompt_order
    const rawOrder = (Array.isArray(po) && po.length && Array.isArray(po[0].order))
      ? po[0].order
      : []
    order.value = importOrderWithGroups(rawOrder)
    selIdx.value = -1
    selectedGi.value = new Set()
    anchorGi.value = -1
    presetName.value = name
    rebuildVarIndex()
    // See dirty's own doc comment above: this assignment just tripped the deep watcher, clear
    // it back to false once that's settled rather than treating a fresh load as "unsaved edits".
    nextTick(() => { dirty.value = false })
  }

  function refreshPresetList() {
    try { presetList.value = ST.listPresets() }
    catch (e: any) { showToast('Could not list presets: ' + (e?.message || e)) }
  }

  function loadPresetByName(name: string, opts: { silent?: boolean } = {}) {
    ST.invalidateCache()
    let data: PresetData | null
    try { data = ST.getPresetByName(name) }
    catch (e: any) { showToast('Load failed: ' + (e?.message || e)); return }
    if (!data) { showToast(`Preset not found: ${name}`); return }
    applyLoadedPreset(data, name)
    if (!opts.silent) showToast('Loaded: ' + name)
  }
  

  /** First load when the panel opens: whatever ST currently has selected. */
  function loadFromContext() {
    refreshPresetList()
    ST.invalidateCache()
    let name: string
    try { name = ST.getSelectedPresetName() }
    catch (e: any) { showToast('Could not read selected preset: ' + (e?.message || e)); return }
    if (!name) { showToast('No preset currently selected in SillyTavern'); return }
    loadPresetByName(name)
  }

  /** Explicit preset switch — loads a DIFFERENT preset than whatever's open here right now,
   *  independent of what ST itself has selected. Any unsaved edits in the current one are
   *  discarded (the caller/UI is expected to confirm first if that matters). */
  function switchPreset(name: string) {
    if (!name || name === presetName.value) return
    //ST.selectPresetByName(name) // Slow. Disable it for now.
    loadPresetByName(name)
  }

  async function doSavePreset() {
    if (!rawData.value) { showToast('No data to save'); return }
    rawData.value.prompts = [...prompts.value]
    if (rawData.value.prompt_order?.length)
      rawData.value.prompt_order[0].order = exportOrder(order.value)
    const name = presetName.value || 'preset_modified'
    try {
      // rawData.value is a live Pinia/Vue-reactive object (ref() deep-wraps it, and everything
      // nested inside — prompts array, each prompt object, prompt_order, ...). ST's own
      // PresetManager.savePreset() calls structuredClone() on whatever we pass it internally,
      // and a Vue reactive Proxy is NOT structured-cloneable — that's the
      // "structuredClone... could not be cloned" toast. Worse: if ST assigns the object we
      // passed into its own live state before hitting that clone call, our Vue Proxy leaks into
      // SillyTavern's internals and stays there (as a "Proxy(Object)" wrapped in a
      // MutableReactiveHandler from THIS app's Vue instance, not ST's own reactivity) until the
      // page is refreshed — which is exactly the corrupted state from your test. So: always hand
      // ST a fully plain, non-reactive deep clone, never the live ref. (savePresetAs() itself
      // also deep-clones defensively — belt and suspenders.)
      await ST.savePresetAs(name, JSON.parse(JSON.stringify(rawData.value)))
      presetName.value = name
      refreshPresetList() // saving under a new name adds an entry — keep the picker in sync
      dirty.value = false
      showToast('Saved: ' + name)
    } catch (e: any) { showToast(`Save failed: ${e.message}`) }
  }

  /* ====== Block Ops ====== */
  function selectBlock(gi: number, opts?: { ctrl?: boolean; shift?: boolean }) {
    const hasCtrl = opts?.ctrl ?? false
    // Shared ctrl/shift/plain multi-select semantics — see applyMultiSelect's doc comment in
    // utils.ts. `all` is just every valid gi in visual order (0..n-1); for this integer-index
    // case that reduces to the same plain Math.min/max range this used to do inline.
    const next = applyMultiSelect(
      { selected: selectedGi.value, anchor: anchorGi.value >= 0 ? anchorGi.value : null },
      gi,
      flatNodes.value.map((_, i) => i),
      opts || {}
    )
    selectedGi.value = next.selected
    anchorGi.value = next.anchor ?? -1
    // selIdx tracks the "focused" row for the editor pane, which isn't simply "whatever ended up
    // selected" — a ctrl-click always focuses the row it clicked even when the click just
    // deselected it (so the editor doesn't jump away), matching the original per-branch behavior.
    selIdx.value = hasCtrl ? gi : (next.selected.has(gi) ? gi : -1)
    requestSidebarScroll()
  }
  function addBlock() {
    if (!rawData.value) { showToast('Load a preset first'); return }
    const id = 'custom_' + Date.now()
    prompts.value.push({
      identifier: id, name: 'New Block', role: 'system',
      content: '', system_prompt: false, enabled: true, marker: false,
    })
    const item: OrderItem = { identifier: id, enabled: true }
    if (selIdx.value >= 0) {
      const node = flatNodes.value[selIdx.value]
      if (node) {
        const parent = node.isGroup ? (node.ref as OrderGroup).children : node.parent
        const idx = node.isGroup ? (node.ref as OrderGroup).children.length : node.parentIdx + 1
        parent.splice(idx, 0, item)
        // 重新计算 gi
        const newGi = flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === id)
        if (newGi >= 0) selIdx.value = newGi
        else selIdx.value = -1
      } else {
        order.value.push(item)
        selIdx.value = flatNodes.value.length - 1
      }
    } else {
      order.value.push(item)
      selIdx.value = flatNodes.value.length - 1
    }
    selectedGi.value = new Set([selIdx.value])
    anchorGi.value = selIdx.value
    requestSidebarScroll()
    showToast('Created')
  }
  function deleteBlock(gi: number) { confirmIdx.value = gi; confirmOpen.value = true }
  function confirmDelete() {
    const gi = confirmIdx.value
    const node = flatNodes.value[gi]
    if (!node) { confirmOpen.value = false; return }
    const parent = node.parent
    const idx = node.parentIdx
    if (node.isGroup) {
      parent.splice(idx, 1)
    } else {
      const id = (node.ref as OrderItem).identifier
      parent.splice(idx, 1)
      const pi = prompts.value.findIndex(p => p.identifier === id)
      if (pi >= 0) prompts.value.splice(pi, 1)
    }
    if (selIdx.value === gi) selIdx.value = -1
    selectedGi.value.delete(gi)
    confirmOpen.value = false
    rebuildVarIndex()
    showToast('Deleted')
  }
  function hideBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    const parent = node.parent
    const idx = node.parentIdx
    parent.splice(idx, 1)
    if (selIdx.value === gi) selIdx.value = -1
    selectedGi.value.delete(gi)
    showToast('Hidden')
  }
  function addHiddenBlock(identifier: string) {
    const item: OrderItem = { identifier, enabled: true }
    if (selIdx.value >= 0) {
      const node = flatNodes.value[selIdx.value]
      if (node) {
        const parent = node.isGroup ? (node.ref as OrderGroup).children : node.parent
        const idx = node.isGroup ? (node.ref as OrderGroup).children.length : node.parentIdx + 1
        parent.splice(idx, 0, item)
      } else {
        order.value.push(item)
      }
    } else {
      order.value.push(item)
    }
    const newGi = flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === identifier)
    selIdx.value = newGi >= 0 ? newGi : -1
    if (selIdx.value >= 0) {
      selectedGi.value = new Set([selIdx.value])
      anchorGi.value = selIdx.value
    }
    requestSidebarScroll()
    showToast('Added')
  }
  function toggleBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    if (node.isGroup) {
      const g = node.ref as OrderGroup
      g.enabled = !g.enabled
    } else {
      const item = node.ref as OrderItem
      item.enabled = !item.enabled
    }
  }
  function reorderBlock(fromGi: number, toGi: number, after: boolean) {
    const fromNode = flatNodes.value[fromGi]
    const toNode = flatNodes.value[toGi]
    if (!fromNode || !toNode) return
    if (fromNode.parent !== toNode.parent) return
    const parent = fromNode.parent
    const fromIdx = fromNode.parentIdx
    const toIdx = toNode.parentIdx
    const item = parent.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx
      ? (after ? toIdx : toIdx - 1)
      : (after ? toIdx + 1 : toIdx)
    parent.splice(ni, 0, item)
  }

  /* ====== Group Ops ====== */
  function bindSelected() {
    const topLevelGi = Array.from(selectedGi.value)
      .filter(gi => flatNodes.value[gi]?.parent === order.value)
      .sort((a, b) => a - b)
    if (topLevelGi.length < 2) { showToast('Select 2+ top-level blocks'); return }
    // items 按 gi（视觉顺序）升序取，保持原始顺序
    const items = topLevelGi.map(gi => order.value[flatNodes.value[gi].parentIdx])
    // indices 单独降序排序，用于从后往前删除（避免索引漂移）
    const indices = topLevelGi.map(gi => flatNodes.value[gi].parentIdx).sort((a, b) => b - a)
    const firstIdx = Math.min(...indices)
    indices.forEach(idx => order.value.splice(idx, 1))
    const group: OrderGroup = {
      id: 'group_' + Date.now(),
      _gid: '_g' + Math.random().toString(36).slice(2, 9) + '_' + Date.now(),
      name: 'Group (' + items.length + ')',
      collapsed: false,
      enabled: true,
      children: items.flatMap(item =>
        isGroup(item) ? [...item.children] : [{ identifier: item.identifier, enabled: item.enabled }]
      )
    }
    order.value.splice(firstIdx, 0, group)
    selectedGi.value = new Set()
    anchorGi.value = -1
    selIdx.value = -1
    showToast('Bound ' + items.length + ' blocks')
  }
  function unbindGroup(gi: number) {
    const node = flatNodes.value[gi]
    if (!node || !node.isGroup) return
    const parent = node.parent
    const idx = node.parentIdx
    const group = node.ref as OrderGroup
    parent.splice(idx, 1, ...group.children)
    selectedGi.value = new Set()
    selIdx.value = -1
    showToast('Unbound')
  }
  function toggleGroupCollapse(gi: number) {
    const node = flatNodes.value[gi]
    if (!node || !node.isGroup) return
    const group = node.ref as OrderGroup
    group.collapsed = !group.collapsed
    if (group.collapsed && selIdx.value >= 0) {
      const selNode = flatNodes.value[selIdx.value]
      if (selNode && selNode.parent === group.children) {
        selIdx.value = gi
      }
    }
  }

  /* ====== Search ====== */
  function doSearch() {
    const q = searchQuery.value
    searchResults.value = []
    searchIdx.value = -1
    if (!q) return
    const ql = q.toLowerCase()
    prompts.value.forEach(p => {
      (p.content || '').split('\n').forEach((line, li) => {
        const ll = line.toLowerCase()
        let si = 0
        while (true) {
          const f = ll.indexOf(ql, si)
          if (f === -1) break
          const cs = Math.max(0, f - 30), ce = Math.min(line.length, f + q.length + 30)
          searchResults.value.push({
            blockId: p.identifier, blockName: p.name || p.identifier,
            line: li, col: f,
            context: (cs > 0 ? '…' : '') + line.substring(cs, ce) + (ce < line.length ? '…' : ''),
            ms: f - cs + (cs > 0 ? 1 : 0), ml: q.length,
          })
          si = f + 1
        }
      })
    })
    // Preview the first match by scrolling it into view, WITHOUT stealing focus from the
    // search box — that's what let the previous behavior only accept one keystroke at a time
    // before you had to re-click the input. Explicit actions (clicking a result, Enter,
    // prev/next buttons) still do a full jump that also moves focus + selection.
    if (searchResults.value.length) previewSearchResult(0)
  }
  function previewSearchResult(i: number) {
    if (i < 0 || i >= searchResults.value.length) return
    searchIdx.value = i
    const r = searchResults.value[i]
    const gi = flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === r.blockId)
    if (gi >= 0 && gi !== selIdx.value) selectBlock(gi)
    else if (gi >= 0) requestSidebarScroll()
    requestEditorJump(r.line, r.col, r.ml, true)
  }
  function jumpToSearchResult(i: number) {
    if (i < 0 || i >= searchResults.value.length) return
    searchIdx.value = i
    const r = searchResults.value[i]
    const gi = flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === r.blockId)
    if (gi >= 0 && gi !== selIdx.value) selectBlock(gi)
    else if (gi >= 0) requestSidebarScroll()
    requestEditorJump(r.line, r.col, r.ml, false)
  }
  function navSearch(dir: number) {
    if (!searchResults.value.length) return
    searchIdx.value = (searchIdx.value + dir + searchResults.value.length) % searchResults.value.length
    jumpToSearchResult(searchIdx.value)
  }
  function replaceCurrent() {
    if (searchIdx.value < 0) return
    const r = searchResults.value[searchIdx.value]
    const p = prompts.value.find(pp => pp.identifier === r.blockId)
    if (!p) return
    const ls = (p.content || '').split('\n')
    const line = ls[r.line] || ''
    ls[r.line] = line.substring(0, r.col) + searchReplace.value + line.substring(r.col + r.ml)
    p.content = ls.join('\n')
    doSearch()
    showToast('Replaced 1')
  }
  function replaceAll() {
    const q = searchQuery.value
    if (!q) return
    let cnt = 0
    prompts.value.forEach(p => {
      if (!p.content) return
      const pts = p.content.split(q)
      if (pts.length > 1) { cnt += pts.length - 1; p.content = pts.join(searchReplace.value) }
    })
    doSearch()
    showToast(`Replaced ${cnt}`)
  }

  /* ====== Var Nav ====== */
  function rebuildVarIndex() {
    allVarOps.value = []
    varIdx.value = -1
    const re = /\{\{(setvar|addvar)::([\s\S]+?)::([\s\S]*?)\}\}|\{\{getvar::([\s\S]+?)\}\}/g
    prompts.value.forEach((p) => {
      const c = p.content || ''
      let m: RegExpExecArray | null
      re.lastIndex = 0
      while ((m = re.exec(c)) !== null) {
        const before = c.substring(0, m.index)
        const lastNl = before.lastIndexOf('\n')
        const line = (before.match(/\n/g) || []).length
        if (m[1]) {
          // {{ setvar/addvar :: varName :: ... }} -- varName starts after "{{" + type + "::"
          const varStart = m.index + 2 + m[1].length + 2
          allVarOps.value.push({
            blockId: p.identifier, blockName: p.name || p.identifier,
            type: m[1] as 'setvar' | 'addvar', varName: m[2].trim(),
            varValue: m[3], line, col: varStart - lastNl - 1, pos: m.index, ordIdx: 0,
          })
        } else if (m[4]) {
          // {{ getvar :: varName }} -- varName starts after "{{getvar::"
          const varStart = m.index + 2 + 'getvar'.length + 2
          allVarOps.value.push({
            blockId: p.identifier, blockName: p.name || p.identifier,
            type: 'get', varName: m[4].trim(), varValue: '',
            line, col: varStart - lastNl - 1, pos: m.index, ordIdx: 0,
          })
        }
      }
    })
    allVarOps.value.sort((a, b) =>
      a.varName.localeCompare(b.varName) ||
      ({ get: 0, setvar: 1, addvar: 2 }[a.type] - { get: 0, setvar: 1, addvar: 2 }[b.type])
    )
    filterVarNav()
  }
  function filterVarNav() {
    const ft = varFilterQ.value.trim().toLowerCase()
    filteredVarOps.value = ft
      ? allVarOps.value.filter(v => v.varName.toLowerCase().includes(ft))
      : [...allVarOps.value]
    varIdx.value = -1
  }
  function jumpToVarOp(i: number) {
    if (i < 0 || i >= filteredVarOps.value.length) return
    varIdx.value = i
    const v = filteredVarOps.value[i]
    const gi = flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === v.blockId)
    if (gi >= 0 && gi !== selIdx.value) selectBlock(gi)
    else if (gi >= 0) requestSidebarScroll()
    requestEditorJump(v.line, v.col, v.varName.length)
  }
  function navVar(dir: number) {
    if (!filteredVarOps.value.length) return
    varIdx.value = (varIdx.value + dir + filteredVarOps.value.length) % filteredVarOps.value.length
    jumpToVarOp(varIdx.value)
  }
  watch(varFilterQ, filterVarNav)

  /* ====== Var Click Popup (small floating popup near the clicked {{...var...}}, distinct
     from the persistent right-side Var Nav panel — both exist side by side, matching MiMo) ====== */
  const varPopupOpen = ref(false)
  const varPopupVarName = ref('')
  const varPopupOps = ref<VarOp[]>([])
  const varPopupIdx = ref(-1)
  const varPopupPos = ref({ top: 0, left: 0 })

  function showVarPopup(varName: string, clickOrdIdx: number, clickPos: number, pos: { top: number; left: number }) {
    const ops: VarOp[] = []
    let currentIdx = -1
    const re = new RegExp('\\{\\{(setvar|addvar)::' + escRe(varName) + '::([\\s\\S]*?)\\}\\}|\\{\\{getvar::' + escRe(varName) + '\\}\\}', 'g')
    order.value.forEach((o, oi) => {
      const p = prompts.value.find(pp => pp.identifier === o.identifier)
      if (!p) return
      const c = p.content || ''
      let m: RegExpExecArray | null
      re.lastIndex = 0
      while ((m = re.exec(c)) !== null) {
        const before = c.substring(0, m.index)
        const lastNl = before.lastIndexOf('\n')
        const line = (before.match(/\n/g) || []).length
        const type = (m[1] as 'setvar' | 'addvar' | undefined) || 'get'
        const varStart = type === 'get' ? m.index + 2 + 'getvar'.length + 2 : m.index + 2 + type.length + 2
        ops.push({
          blockId: p.identifier, blockName: p.name || p.identifier,
          type, varName, varValue: m[2] || '',
          line, col: varStart - lastNl - 1, pos: m.index, ordIdx: oi,
        })
        if (oi === clickOrdIdx && m.index <= clickPos && clickPos <= m.index + m[0].length) currentIdx = ops.length - 1
      }
    })
    varPopupVarName.value = varName
    varPopupOps.value = ops
    varPopupIdx.value = currentIdx
    varPopupPos.value = pos
    varPopupOpen.value = true
  }
  function hideVarPopup() {
    varPopupOpen.value = false
    varPopupOps.value = []
    varPopupIdx.value = -1
  }
  function jumpToPopupVar(i: number) {
    if (i < 0 || i >= varPopupOps.value.length) return
    varPopupIdx.value = i
    const v = varPopupOps.value[i]
    const oIdx = order.value.findIndex(o => o.identifier === v.blockId)
    if (oIdx >= 0 && oIdx !== selIdx.value) selectBlock(oIdx)
    requestEditorJump(v.line, v.col, v.varName.length)
  }
  function navPopupVar(dir: number) {
    if (!varPopupOps.value.length) return
    varPopupIdx.value = (varPopupIdx.value + dir + varPopupOps.value.length) % varPopupOps.value.length
    jumpToPopupVar(varPopupIdx.value)
  }

  /* ====== Preview ====== */

  function diffAgainstRaw(raw: string, rendered: string) {
    // No raw content to diff against at all (marker blocks etc) — nothing to highlight.
    if (!raw.trim()) return [{ text: rendered, added: false }]
    // macroAwareDiff anchors on the literal text between/around {{macros}} instead of doing a
    // global token-level diff — see its doc comment in utils.ts for why that's necessary (the
    // old wordDiff(stripMacros(raw), rendered) approach kept drifting by one token around
    // repeated short tokens like spaces/`<`/`>`/list-bullet whitespace).
    return macroAwareDiff(raw, rendered)
  }

  /** Per-block precise preview (方案B): each card shows the block's REAL rendered text — after
   *  macros, regex, and other extensions all ran — sourced from the openai.js promptManager
   *  singleton, not from our own macro simulation. Substituted/inserted text (vs. the block's
   *  own raw content) is highlighted via a word diff. Marker blocks (chatHistory, world info,
   *  etc.) and blocks that expand into multiple sub-messages have no single "raw content" of
   *  their own to diff against, so those are shown plain. */
  async function generatePreviewBlocks() {
    previewError.value = ''
    previewLoading.value = true
    try {
      const results = await ST.getPromptManagerMessages()
      const groups: PreviewBlockGroup[] = []
      const allItems = order.value.flatMap(node => isGroup(node) ? node.children : [node])
      for (const o of allItems) {
        const msgs = results[o.identifier]
        if (!msgs || !msgs.length) continue
        const p = prompts.value.find(pp => pp.identifier === o.identifier)
        const isMarker = !!p?.marker
        const rawContent = p?.content || ''
        const diffable = !isMarker && msgs.length === 1
        groups.push({
          id: o.identifier,
          name: p?.name || o.identifier,
          isMarker,
          messages: msgs.map(m => ({
            role: m.role,
            tokens: m.tokens,
            identifier: m.identifier,
            segments: diffable ? diffAgainstRaw(rawContent, m.content) : [{ text: m.content, added: false }],
          })),
        })
      }
      previewBlockGroups.value = groups
      previewMode.value = 'blocks'
      showToast(`Rendered ${groups.length} block(s)`)
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast('Preview failed: ' + previewError.value)
    } finally {
      previewLoading.value = false
    }
  }

  /** Whole-prompt precise preview: the exact `messages` array SillyTavern was about to send to
   *  the API, captured off CHAT_COMPLETION_SETTINGS_READY during a REAL generation (immediately
   *  cancelled via stopGeneration() once captured — see getFinalRequestMessages() for why dry-run
   *  isn't enough here: it skips plugin/API-level request processing that this event fires after).
   *  No block boundaries, no highlighting — this is deliberately "what the API actually sees",
   *  for a final sanity check after checking individual blocks in the other mode. */
  async function generatePreviewRaw() {
    previewError.value = ''
    previewLoading.value = true
    try {
      const msgs = await ST.getFinalRequestMessages()
      previewRawText.value = msgs.map(m => `[${(m.role || '?').toUpperCase()}]\n${m.content}`).join('\n\n')
      previewMode.value = 'raw'
      showToast('Rendered full prompt')
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast('Preview failed: ' + previewError.value)
    } finally {
      previewLoading.value = false
    }
  }

  function togglePreviewBlock(id: string) {
    previewCollapsed.value[id] = !previewCollapsed.value[id]
  }
  function toggleAllPreviewBlocks() {
    if (!previewBlockGroups.value.length) return
    const shouldCollapse = previewBlockGroups.value.some(b => !previewCollapsed.value[b.id])
    previewBlockGroups.value.forEach(b => { previewCollapsed.value[b.id] = shouldCollapse })
  }

  return {
    rawData, prompts, order, selIdx, presetName, presetList,
    flatNodes, selectedGi, anchorGi,
    panelOpen, toastMsg, toastVisible, settings, cssVars,
    searchOpen, searchQuery, searchReplace, searchResults, searchIdx,
    varNavOpen, varFilterQ, allVarOps, filteredVarOps, varIdx,
    varPopupOpen, varPopupVarName, varPopupOps, varPopupIdx, varPopupPos,
    showVarPopup, hideVarPopup, jumpToPopupVar, navPopupVar,
    previewOpen, previewMode, previewLoading, previewError,
    previewCollapsed, previewBlockGroups, previewRawText,
    settingsOpen, confirmOpen, confirmIdx, hiddenOpen, copyPanelOpen, dirty,
    currentBlock, hasData, hiddenBlocks,
    editorJump, sidebarJumpToken, requestEditorJump, requestSidebarScroll,
    loadFromContext, doSavePreset, refreshPresetList, switchPreset,
    selectBlock, addBlock, deleteBlock, confirmDelete, hideBlock, addHiddenBlock,
    toggleBlock, reorderBlock,
    bindSelected, unbindGroup, toggleGroupCollapse,
    doSearch, navSearch, jumpToSearchResult, replaceCurrent, replaceAll,
    rebuildVarIndex, filterVarNav, navVar, jumpToVarOp,
    generatePreviewBlocks, generatePreviewRaw, togglePreviewBlock, toggleAllPreviewBlocks,
    saveSettings, resetSettings, showToast,
  }
})
