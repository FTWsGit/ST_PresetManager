import { defineStore } from 'pinia'
import { ref, computed, watch, nextTick } from 'vue'
import type { PresetData, PresetBlock, OrderItem, OrderGroup, OrderNode, FlatNode, SearchResult, VarOp, PreviewBlockGroup, RegexScript } from '../types'
import * as ST from '../sillytavern'
import type { PresetListEntry } from '../sillytavern'
import { macroAwareDiff, applyMultiSelect, findVarOps } from '../utils'
import { useUiState } from '../composables/useUiState'
import { useTabsStore } from './tabsStore'
import { useConfirmStore } from './confirmStore'
import { DEFAULT_PRESET } from '../types'

export function isGroup(node: OrderNode): node is OrderGroup {
  return 'children' in node && Array.isArray((node as any).children)
}

// Was useStore()/defineStore('main', ...). Renamed the export (not the Pinia store id — that
// stays 'main', changing it would invalidate anyone's persisted devtools state for no benefit)
// now that this sits alongside tabsStore/confirmStore in stores/ — "useStore" stopped being a
// good name the moment a second domain (regex) joined this file, and would only get more
// confusing once a worldbook/character store exists too (see PROJECT_HANDOFF.md TODO). Every
// call site across the app was updated to usePresetStore() as part of this same reorg.
export const usePresetStore = defineStore('main', () => {
  const tabsStore = useTabsStore()
  const confirmStore = useConfirmStore()

  /* ====== Core State ====== */
  const rawData = ref<PresetData | null>(null)
  const prompts = ref<PresetBlock[]>([])
  const order = ref<OrderNode[]>([])
  const selectedGi = ref<Set<number>>(new Set())
  const anchorGi = ref(-1)
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

  /** Resolves a block identifier to its flatNodes gi, auto-expanding its parent group first if
   *  that group is currently collapsed. flatNodes deliberately excludes children of a collapsed
   *  group (that's what actually drives the sidebar's collapse/expand rendering — see the `walk`
   *  above), but search results / var-nav entries / var-popup entries can point at a block
   *  anywhere in the preset, regardless of what's currently visible in the sidebar. Without this,
   *  flatNodes.findIndex(...) silently returns -1 for anything inside a collapsed group and the
   *  jump becomes a no-op (wrong block stays selected, or nothing happens at all).
   */
  function revealAndFindGi(identifier: string): number {
    for (const node of order.value) {
      if (isGroup(node) && node.collapsed && node.children.some(c => c.identifier === identifier)) {
        node.collapsed = false
        break // an item can only belong to one top-level group
      }
    }
    return flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === identifier)
  }

  /** Single source of truth for "the active block tab drives the sidebar": whenever the active
   *  tab actually changes to a block, this expands whatever collapsed group contains it (via
   *  revealAndFindGi) and highlights it (selectedGi/anchorGi) to just that one row — covers
   *  search-result click, var-nav click, and TabBar click, which all go through
   *  tabsStore.open()/focus() to get there.
   *
   *  MUST key off `tabsStore.activeTab` itself (a reference that only changes when the active tab
   *  identity actually changes), NOT off `listScrollToken['block']`: selectBlock() (the
   *  ctrl/shift multi-select path) also calls requestListScroll('block') — to get the newly
   *  (multi-)selected row scrolled into view — without ever touching activeId. Keying this watcher
   *  off that same token meant every ctrl/shift-click immediately got its own just-computed
   *  selectedGi clobbered back down to a single-row selection derived from whatever tab happened
   *  to still be open. Watching activeTab avoids that entirely, since multi-select never changes
   *  it.
   *
   *  Trade-off: re-clicking a row that's already the active tab won't re-fire this (activeId
   *  doesn't change, so the computed doesn't invalidate) — BlockSidebar.vue's plain-click handler
   *  still sets selectedGi/anchorGi locally itself to cover exactly that case (a plain click's job
   *  is "select exactly this row" regardless of whether it was already open); when it also
   *  changes the active tab, this watcher fires too and computes the identical value, which is
   *  harmless, not a second source of truth for a genuinely different case.
   *
   *  Scrolling itself stays separate, in useListScrollSync.ts on the sidebar side — it needs the
   *  rendered itemEls DOM map, which is a component-layer concern this store has no business
   *  owning; open()/focus() trigger that via requestListScroll() same as always.
   *
   *  `flush: 'sync'` so this resolves before useListScrollSync's watcher (also triggered off
   *  open()/focus(), via requestListScroll) tries to read flatNodes — otherwise a same-tick race
   *  could have it compute gi against a still-collapsed group and scroll to nothing. */
  watch(() => tabsStore.activeTab, (tab) => {
    if (!tab || tab.domain !== 'block') return
    const gi = revealAndFindGi(tab.key)
    if (gi < 0) return
    // Idempotency guard: avoid handing the sidebar's v-for a new Set reference (and a re-render)
    // when the highlight wouldn't actually change — same "only touch the ref when the effective
    // value actually changes" reasoning as useDragReorder.ts's rAF-throttled updateDragOver.
    // useDragReorder.ts's rAF-throttled updateDragOver.
    if (anchorGi.value === gi && selectedGi.value.size === 1 && selectedGi.value.has(gi)) return
    selectedGi.value = new Set([gi])
    anchorGi.value = gi
  }, { immediate: true, flush: 'sync' })



  /* ====== UI State ====== */
  const panelOpen = ref(false)
  // Settings (font/colors/panel widths) + toast notifications — extracted to useUiState() since
  // neither is actually preset-specific; see that file's doc comment for why this is a
  // composable rather than a second live Pinia store today.
  const { settings, cssVars, saveSettings, resetSettings, toastMsg, toastVisible, showToast, t, currentLocale } = useUiState()

  /* ====== Bound Regex Scripts ====== */
  const regexScripts = computed<RegexScript[]>(() => {
    if (!rawData.value) return []
    if (!rawData.value.extensions) rawData.value.extensions = {}
    if (!Array.isArray(rawData.value.extensions.regex_scripts)) rawData.value.extensions.regex_scripts = []
    return rawData.value.extensions.regex_scripts
  })

  function addRegexScript(): string | null {
    if (!rawData.value) { showToast(t('shared.toast.loadPresetFirst')); return null }
    const script: RegexScript = {
      id: 'regex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      scriptName: 'New Regex', findRegex: '', replaceString: '', trimStrings: [],
      placement: [2], // 默认只勾 AI 输出
      disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false,
      substituteRegex: 0, minDepth: null, maxDepth: null,
    }
    regexScripts.value.push(script)
    return script.id
  }
  function deleteRegexScript(id: string) {
    const i = regexScripts.value.findIndex(r => r.id === id)
    if (i >= 0) regexScripts.value.splice(i, 1)
  }

  function reorderRegexScript(fromIdx: number, toIdx: number, after: boolean) {
    const arr = regexScripts.value
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return
    const item = arr.splice(fromIdx, 1)[0]
    const ni = fromIdx < toIdx ? (after ? toIdx : toIdx - 1) : (after ? toIdx + 1 : toIdx)
    arr.splice(ni, 0, item)
  }

  /* ====== Dirty tracking (drives the `*` on the header Save button) ======
   * `order`/`regexScripts` stay deep-watched: every explicit block/group op below (add/delete/
   * hide/reorder/bind/unbind/toggle) and every regex script field (scriptName/findRegex/...)
   * mutates one of these two, and both arrays are small (order = top-level items/groups count,
   * regexScripts = a handful of scripts) — deep-watching them costs Vue a full traverse() of a
   * small tree per mutation, cheap enough to not sprinkle markDirty() calls everywhere.
   *
   * `prompts` is watched WITHOUT deep instead — it holds every block's full content string, and
   * a deep watcher re-traverses the ENTIRE array (every block, every field) on every single
   * mutation it sees, including a nested one. Since block content is edited character-by-
   * character (BlockContentEditor.vue's v-model), a deep watch here meant every keystroke paid
   * for a full-preset traversal — the real cause of the "text appears in chunks" typing lag
   * (see PROJECT.md), nothing to do with the editor's own idle-callback scheduling.
   * A non-deep watch on a ref-wrapped array still fires on top-level mutations (push/splice/
   * reassignment) — i.e. add/delete/duplicate block — for free. It does NOT fire when a nested
   * field (content/name/role) on an existing element changes, so those few call sites mark dirty
   * explicitly via markDirty()/`dirty.value = true` right where they mutate: BlockContentEditor.
   * vue's content setter, BlockSettingsForm.vue's name/role handlers, BlockSidebar.vue's inline
   * rename commit, and replaceCurrent()/replaceAll() below.
   *
   * The only wrinkle: assigning a freshly-loaded preset's data into `prompts`/`order` in
   * applyLoadedPreset() looks exactly like "a change" to these same watchers, so they fire and
   * mark dirty too. applyLoadedPreset() clears it back via nextTick() right after — Vue flushes
   * watchers queued by that assignment before that nextTick callback runs, so the flag always
   * ends up correctly false once the load has fully settled. */
  const dirty = ref(false)
  function markDirty() { dirty.value = true }
  watch([order, regexScripts], markDirty, { deep: true })
  watch(prompts, markDirty)

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
  const hiddenOpen = ref(false)
  const copyPanelOpen = ref(false) // Cross-preset block copy tool (CopyPanel.vue) — fully self-contained there, this is just the open flag

  /* ====== Jump requests (Editor listens & scrolls/selects; Sidebar listens & scrolls into view) ====== */
  // incremented token forces watchers to fire even if line/col repeat
  // `keepFocus: true` scrolls the match into view without moving focus/selection into the
  // editor — used while typing in the search box so the editor previews the current match
  // without stealing the keystroke you're mid-typing.
  const editorJump = ref<{ line: number; col: number; len: number; token: number; keepFocus: boolean } | null>(null)
  let jumpCounter = 0
  function requestEditorJump(line: number, col: number, len: number, keepFocus = false) {
    jumpCounter++
    editorJump.value = { line, col, len, token: jumpCounter, keepFocus }
  }

  /* ====== Computed ====== */
  const currentBlock = computed<PresetBlock | null>(() => {
    const tab = tabsStore.activeTab
    if (!tab || tab.domain !== 'block') return null
    return prompts.value.find(p => p.identifier === tab.key) ?? null
  })

  /** 辅助：根据 block identifier 反查它在 flatNodes 里的 gi（视觉下标），用于侧边栏高亮/滚动 */
  function identifierToGi(identifier: string | null | undefined): number {
    if (!identifier) return -1
    return flatNodes.value.findIndex(n => !n.isGroup && (n.ref as OrderItem).identifier === identifier)
  }
  const hasData = computed(() => rawData.value !== null)
  const hiddenBlocks = computed(() => {
    // Expand groups: a grouped block's identifier lives in group.children, not at the top
    // level — without this, every grouped block would wrongly show up in the Add Hidden list.
    const ids = new Set(order.value.flatMap(o => isGroup(o) ? o.children.map(c => c.identifier) : [o.identifier]))
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
    const rawOrder = (Array.isArray(po) && po.length)
      ? (po.find((p: any) => p.character_id === 100001)?.order ?? [])
      : []
    order.value = importOrderWithGroups(rawOrder)
    selectedGi.value = new Set()
    anchorGi.value = -1
    presetName.value = name
    rebuildVarIndex()
    tabsStore.closeAll() // 旧标签（block、regex都算）指向的都是即将被替换掉的这份数据
    nextTick(() => { dirty.value = false })
  }

  function refreshPresetList() {
    try { presetList.value = ST.listPresets() }
    catch (e: any) { showToast(t('shared.toast.listPresetsFailed', { msg: e?.message || e })) }
  }

  function loadPresetByName(name: string, opts: { silent?: boolean } = {}) {
    ST.invalidateCache()
    let data: PresetData | null
    try { data = ST.getPresetByName(name) }
    catch (e: any) { showToast(t('shared.toast.loadFailed', { msg: e?.message || e })); return }
    if (!data) { showToast(t('shared.toast.presetNotFound', { name })); return }
    applyLoadedPreset(data, name)
    if (!opts.silent) showToast(t('shared.toast.loaded', { name }))
  }
  

  /** First load when the panel opens: whatever ST currently has selected. */
  function loadFromContext() {
    refreshPresetList()
    ST.invalidateCache()
    let name: string
    try { name = ST.getSelectedPresetName() }
    catch (e: any) { showToast(t('shared.toast.cantLoadContext', { msg: e?.message || e })); return }
    if (!name) { showToast(t('shared.toast.noPresetSelected')); return }
    loadPresetByName(name)
  }

  function reloadPreset() {
    refreshPresetList()
    ST.invalidateCache()
    let name: string
    name = presetName.value
    if (!name) { showToast(t('shared.toast.noPresetSelected')); return }
    loadPresetByName(name)
  }

  /** Explicit preset switch — loads a DIFFERENT preset than whatever's open here right now,
   *  independent of what ST itself has selected. Any unsaved edits in the current one are
   *  discarded (the caller/UI is expected to confirm first if that matters). */
  function switchPreset(name: string) {
    if (!name || name === presetName.value) return
    loadPresetByName(name)
  }

  async function doSavePreset() {
    if (!rawData.value) { showToast(t('shared.toast.noDataToSave')); return }
    rawData.value.prompts = [...prompts.value]
    if (rawData.value.prompt_order?.length) {
      let entry = rawData.value.prompt_order.find((p: any) => p.character_id === 100001)
      if (!entry) {
        entry = { character_id: 100001, order: [] }
        rawData.value.prompt_order.push(entry)
      }
      entry.order = exportOrder(order.value)
    }
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
      showToast(t('shared.toast.saved', { name }))
    } catch (e: any) { showToast(t('shared.toast.saveFailed', { msg: e.message })) }
  }

  async function createPreset(name: string) {
    refreshPresetList()
    if (presetList.value.some(p => p.name === name)) { showToast(t('shared.toast.duplicatePresetName')); return }

    const newPreset: PresetData = JSON.parse(JSON.stringify(DEFAULT_PRESET))
    try {
      await ST.savePresetAs(name, newPreset)
      refreshPresetList()
      applyLoadedPreset(newPreset, name)
      showToast(t('shared.toast.created', { name }))
    } catch (e: any) { showToast(t('shared.toast.createFailed', { msg: e?.message || e })) }
  }
  async function removeCurrentPreset() {
    const name = presetName.value
    if (!name) return
    try {
      await ST.deletePreset(name)
      refreshPresetList()
      const next = presetList.value[0]?.name
      if (next) loadPresetByName(next, { silent: true })
      else { rawData.value = null as any; presetName.value = '' }
      showToast(t('shared.toast.deleted', { name }))
    } catch (e: any) { showToast(t('shared.toast.deleteFailed', { msg: e?.message || e })) }
  }

  /* ====== Block Ops ====== */
  function selectBlock(gi: number, opts?: { ctrl?: boolean; shift?: boolean }) {
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
  }
  function addBlock() {
    if (!rawData.value) { showToast(t('shared.toast.loadPresetFirst')); return }
    const id = 'custom_' + Date.now()
    prompts.value.push({
      identifier: id, name: 'New Block', role: 'system',
      content: '', system_prompt: false, enabled: true, marker: false,
    })
    const item: OrderItem = { identifier: id, enabled: true }
    // 插入位置：当前激活的块后面（如果有），否则追加到末尾
    const activeId = tabsStore.activeTab?.domain === 'block' ? tabsStore.activeTab.key : null
    const activeGi = identifierToGi(activeId)
    if (activeGi >= 0) {
      const node = flatNodes.value[activeGi]
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
    // 直接打开新块的标签——编辑器内容由标签驱动，不再需要桥接
    tabsStore.open({ domain: 'block', key: id, label: 'New Block' })
    showToast(t('shared.toast.blockCreated'))
  }
  function deleteBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    if (!node.isGroup) {
      const id = (node.ref as OrderItem).identifier
      const block = prompts.value.find(p => p.identifier === id)
      if (block?.marker) {
        showToast(t('shared.toast.cannotDeleteMarker'))
        return
      }
    }
    const name = node.isGroup
      ? (node.ref as OrderGroup).name || t('common.unnamed')
      : prompts.value.find(p => p.identifier === (node.ref as OrderItem).identifier)?.name || t('common.new')
    confirmStore.ask({
      title: t('shared.confirm.deleteBlock.title'),
      message: t('shared.confirm.deleteBlock.message', { name }),
      confirmText: t('shared.confirm.deleteBlock.confirm'),
      cancelText: t('shared.confirm.deleteBlock.cancel'),
      onConfirm: () => {
        const parent = node.parent
        const idx = node.parentIdx
        if (node.isGroup) {
          // 删除组时关闭组内所有块的标签
          for (const child of (node.ref as OrderGroup).children) {
            tabsStore.close('block', child.identifier)
          }
          parent.splice(idx, 1)
        } else {
          const id = (node.ref as OrderItem).identifier
          parent.splice(idx, 1)
          const pi = prompts.value.findIndex(p => p.identifier === id)
          if (pi >= 0) prompts.value.splice(pi, 1)
          // 关闭被删除块的标签
          tabsStore.close('block', id)
        }
        selectedGi.value.delete(gi)
        rebuildVarIndex()
        showToast(t('shared.toast.blockDeleted'))
      }
    })
  }
  function hideBlock(gi: number) {
    const node = flatNodes.value[gi]
    if (!node) return
    const parent = node.parent
    const idx = node.parentIdx
    if (!node.isGroup) {
      const id = (node.ref as OrderItem).identifier
      const block = prompts.value.find(p => p.identifier === id)
      if (block?.marker) {
        showToast(t('shared.toast.cannotHideMarker'))
        return
      }
      tabsStore.close('block', id)
    }
    parent.splice(idx, 1)
    selectedGi.value.delete(gi)
    showToast(t('shared.toast.blockHidden'))
  }
  function addHiddenBlock(identifier: string) {
    const item: OrderItem = { identifier, enabled: true }
    // 插入位置：当前激活的块后面（如果有），否则追加到末尾
    const activeId = tabsStore.activeTab?.domain === 'block' ? tabsStore.activeTab.key : null
    const activeGi = identifierToGi(activeId)
    if (activeGi >= 0) {
      const node = flatNodes.value[activeGi]
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
    // 打开标签让编辑器显示新加的块
    const block = prompts.value.find(p => p.identifier === identifier)
    tabsStore.open({ domain: 'block', key: identifier, label: block?.name || identifier })
    showToast(t('shared.toast.blockAdded'))
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
    if (topLevelGi.length < 2) { showToast(t('shared.toast.select2PlusBlocks')); return }
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
    showToast(t('shared.toast.boundBlocks', { count: items.length }))
  }
  function unbindGroup(gi: number) {
    const node = flatNodes.value[gi]
    if (!node || !node.isGroup) return
    const parent = node.parent
    const idx = node.parentIdx
    const group = node.ref as OrderGroup
    parent.splice(idx, 1, ...group.children)
    selectedGi.value = new Set()
    anchorGi.value = -1
    showToast(t('shared.toast.unbound'))
  }
  function toggleGroupCollapse(gi: number) {
    const node = flatNodes.value[gi]
    if (!node || !node.isGroup) return
    const group = node.ref as OrderGroup
    group.collapsed = !group.collapsed
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
    revealAndFindGi(r.blockId) // 自动展开折叠组
    tabsStore.requestListScroll('block')
    requestEditorJump(r.line, r.col, r.ml, true)
  }
  function jumpToSearchResult(i: number) {
    if (i < 0 || i >= searchResults.value.length) return
    searchIdx.value = i
    const r = searchResults.value[i]
    // 直接打开标签——编辑器内容、展开折叠组、侧边栏高亮全部由标签驱动（见 revealAndFindGi 上方
    // 那个 watch(tabsStore.activeTab, ...)），这里不用再手动 revealAndFindGi 一次
    const block = prompts.value.find(p => p.identifier === r.blockId)
    tabsStore.open({ domain: 'block', key: r.blockId, label: block?.name || r.blockName })
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
    markDirty() // nested field mutation — the shallow `prompts` watch above won't catch this
    doSearch()
    showToast(t('shared.toast.replaced1'))
  }
  function replaceAll() {
    const q = searchQuery.value
    if (!q) return
    let cnt = 0
    prompts.value.forEach(p => {
      if (!p.content) return
      const pts = p.content.split(q)
      if (pts.length > 1) { cnt += pts.length - 1; p.content = pts.join(searchReplace.value); markDirty() }
    })
    doSearch()
    showToast(`Replaced ${cnt}`)
  }

  /* ====== Var Nav ====== */
  function rebuildVarIndex() {
    allVarOps.value = []
    varIdx.value = -1
    // findVarOps (utils.ts) is nesting-aware — unlike a naive regex, it correctly picks up var ops
    // nested inside another setvar/addvar's value, e.g. {{setvar::a::...{{getvar::b}}...}}.
    prompts.value.forEach((p) => {
      const c = p.content || ''
      findVarOps(c).forEach((v) => {
        allVarOps.value.push({
          blockId: p.identifier, blockName: p.name || p.identifier,
          type: v.type, varName: v.varName, varValue: v.varValue,
          line: v.line, col: v.col, pos: v.pos, ordIdx: 0,
        })
      })
    })
    allVarOps.value.sort((a, b) =>
      a.varName.localeCompare(b.varName) ||
      // Within the same variable: writes before reads — SET → ADD → GET. (Used to be
      // get-first, which put the least informative badge at the top of each group.)
      ({ setvar: 0, addvar: 1, get: 2 }[a.type] - { setvar: 0, addvar: 1, get: 2 }[b.type])
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
    // 展开折叠组、侧边栏高亮由 tabsStore.open() 触发的 activeTab watcher 统一处理，见 revealAndFindGi 上方
    const block = prompts.value.find(p => p.identifier === v.blockId)
    tabsStore.open({ domain: 'block', key: v.blockId, label: block?.name || v.blockName })
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

  function showVarPopup(varName: string, clickBlockId: string | null, clickPos: number, pos: { top: number; left: number }) {
    const ops: VarOp[] = []
    let currentIdx = -1
    // findVarOps (utils.ts) is nesting-aware — unlike the old per-varName regex here, it correctly
    // finds ops nested inside another setvar/addvar's value instead of mis-closing on the nested
    // macro's own `}}`. We scan for ALL var ops in the block and filter down to `varName` here,
    // since findVarOps has no notion of "only this variable".
    // The click always originates from the block currently open in the editor (that's the only
    // place enableVarClick is wired up), so we receive the block identifier directly.
    // Groups: scan order.value.flatMap (like generatePreviewBlocks) rather than flatNodes, since
    // flatNodes deliberately drops the children of a COLLAPSED group — a collapsed group must
    // not make its blocks' variables invisible to this popup.
    const allItems = order.value.flatMap(node => isGroup(node) ? node.children : [node])
    allItems.forEach((o) => {
      const p = prompts.value.find(pp => pp.identifier === o.identifier)
      if (!p) return
      const c = p.content || ''
      findVarOps(c).filter(v => v.varName === varName).forEach((v) => {
        ops.push({
          blockId: p.identifier, blockName: p.name || p.identifier,
          type: v.type, varName, varValue: v.varValue,
          line: v.line, col: v.col, pos: v.pos, ordIdx: 0, // not a real index anymore (see comment above) — unused elsewhere, kept for shape compat with VarOp
        })
        // clickPos falls anywhere within this macro's source span — for setvar/addvar that span can
        // run over multiple lines and contain nested macros, so use findVarOps' nesting-aware `end`
        // rather than assuming a single-line, non-nested match like the old regex did.
        if (p.identifier === clickBlockId && v.pos <= clickPos && clickPos <= v.end) currentIdx = ops.length - 1
      })
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
    // 展开折叠组、侧边栏高亮由 tabsStore.open() 触发的 activeTab watcher 统一处理，见 revealAndFindGi 上方
    const block = prompts.value.find(p => p.identifier === v.blockId)
    tabsStore.open({ domain: 'block', key: v.blockId, label: block?.name || v.blockName })
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

  /** For Now, the only Function that will use ST main Menu data is Block Preview.
   * And since switch to another preset is SLOW in ST, we decided to only *select*(switch) preset
   * when the selected preset in main Menu is different with the chosen preset in script.*/
  function selectPresetByName(name: string) {
    if (!name || ST.getSelectedPresetName() === name) return
    if (!ST.selectPresetByName(name)) showToast(t('shared.toast.selectPresetFailed'))
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
      showToast(t('shared.toast.renderedBlocks', { count: groups.length }))
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast(t('shared.toast.previewFailed', { msg: previewError.value }))
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
      showToast(t('shared.toast.renderedFullPrompt'))
    } catch (e: any) {
      previewError.value = e?.message || String(e)
      showToast(t('shared.toast.previewFailed', { msg: previewError.value }))
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
    rawData, prompts, order, presetName, presetList,
    flatNodes, selectedGi, anchorGi, identifierToGi,
    panelOpen, toastMsg, toastVisible, settings, cssVars,
    searchOpen, searchQuery, searchReplace, searchResults, searchIdx,
    varNavOpen, varFilterQ, allVarOps, filteredVarOps, varIdx,
    varPopupOpen, varPopupVarName, varPopupOps, varPopupIdx, varPopupPos,
    showVarPopup, hideVarPopup, jumpToPopupVar, navPopupVar,
    previewOpen, previewMode, previewLoading, previewError,
    previewCollapsed, previewBlockGroups, previewRawText,
    regexScripts, addRegexScript, deleteRegexScript, reorderRegexScript,
    settingsOpen, hiddenOpen, copyPanelOpen, dirty, markDirty,
    currentBlock, hasData, hiddenBlocks,
    editorJump, requestEditorJump,
    loadFromContext, doSavePreset, refreshPresetList, switchPreset, createPreset, removeCurrentPreset, reloadPreset,
    selectBlock, addBlock, deleteBlock, hideBlock, addHiddenBlock,
    toggleBlock, reorderBlock,
    bindSelected, unbindGroup, toggleGroupCollapse,
    doSearch, navSearch, jumpToSearchResult, replaceCurrent, replaceAll,
    rebuildVarIndex, filterVarNav, navVar, jumpToVarOp,
    generatePreviewBlocks, generatePreviewRaw, togglePreviewBlock, toggleAllPreviewBlocks, selectPresetByName,
    saveSettings, resetSettings, showToast, t, currentLocale,
  }
})
