<!--
  Generic macro-syntax textarea: line numbers + syntax-highlight overlay + real-layout line
  wrap measurement (batched DOM measurement, see updateLineNums) + bracket/quote auto-close +
  optional jump-to-position + optional var-click
  detection. This is the machinery that used to live entirely inside Editor.vue (the block content
  editor) — extracted so RegexContentEditor.vue's replaceString editor gets the same line numbers,
  highlighting, and font-size/family (via the same --pm-fs/--pm-ff CSS vars) instead of being a
  bare unstyled <textarea>. See PROJECT_HANDOFF.md 架构总览 2 and the former "已知的视觉不一致"
  section — this is what closes that gap.

  DELIBERATELY DOMAIN-AGNOSTIC: this component has no idea what a "block" or a "regex script" is.
  It knows about ST's macro syntax ({{...}}, {{setvar/addvar/getvar}}) because that's genuinely
  shared syntax between preset block content AND regex replaceString, not because it's coupled to
  either domain's data model. It never touches any Pinia store directly — search-result highlight,
  jump requests, and var-click handling are all opt-in via props/emits, so a caller that doesn't
  need them (RegexContentEditor) just doesn't pass them.

  v-model'd on `modelValue` (plain string). Content sync direction:
   - typing -> emits 'update:modelValue' on every keystroke (same frequency the old Editor.vue's
     content ref did); highlight + line-number recompute run synchronously, same tick, no
     debounce/idle deferral — both are diffed against their previous result and only touch the
     DOM for what actually changed (see refreshHighlight() and updateLineNums() below), so the
     per-keystroke cost is O(lines changed), not O(document length), and is cheap enough to not
     need deferring.
   - `modelValue` changed FROM OUTSIDE (block switched, Replace All ran, regex tab switched) ->
     detected by comparing against the component's own last-known value; refreshes immediately,
     and re-measures cursor position.
-->
<template>
  <div class="pm-editor-content">
    <div class="pm-line-nums" ref="lnRef">
      <div v-for="(h, i) in lineHeights" :key="i" class="ln" :class="lineClass(i)" :style="{ height: h + 'px' }">{{ i + 1 }}</div>
    </div>
    <div class="pm-editor-wrap">
      <pre class="pm-editor-hl" ref="hlRef"></pre>
      <textarea class="pm-editor-ta" ref="taRef" spellcheck="false" :placeholder="placeholder"
                :readonly="disabled" autocomplete="off" data-lpignore="true" data-form-type="other"
                :value="content" @input="onInput" @scroll="syncScroll"
                @keydown="onKeydown" @click="onClick" @keyup="updateCursor"></textarea>
      <!-- hidden mirror used to measure single-line height / caret coords (handles CJK / tabs / mixed width) -->
      <div class="pm-line-mirror" ref="mirrorRef" aria-hidden="true"></div>
      <!-- hidden batch container: per-logical-line wrapped heights are measured by laying each
           line out in its own child div here (one append pass + one read pass ≈ one layout),
           see updateLineNums() -->
      <div class="pm-lh-measure" ref="measureRef" aria-hidden="true"></div>
    </div>
  </div>
  <div v-if="showStatusbar" class="pm-statusbar">
    <span>{{ cursorText }}</span>
    <span>{{ charsLabel }}</span>
    <span>{{ linesLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { highlightLines } from '../../composables/useHighlight'
import { getHostWindow, getHostDocument } from '../../composables/hostEnv'
import { findMacroEnd } from '../../utils'

interface JumpRequest { line: number; col: number; len: number; token: number; keepFocus: boolean }

const props = withDefaults(defineProps<{
  modelValue: string
  /** External "please move the caret here" request (search results, var-nav). Omit if the
   *  caller has no such concept (e.g. RegexContentEditor). */
  jump?: JumpRequest | null
  /** Per-line extra CSS class for the line-number gutter (search-hit/search-cur highlighting).
   *  Omit for editors with no concept of "results" to highlight. */
  lineClass?: (line: number) => string
  /** Whether clicking a {{setvar/addvar/getvar::name}} token should emit 'var-click'. Off by
   *  default — only the block content editor currently has a var-nav popup to feed. */
  enableVarClick?: boolean
  showStatusbar?: boolean
  placeholder?: string
  /** i18n: cursor position label, e.g. "Ln 3, Col 12". Receives {line} and {col} params. */
  statusCursorLabel?: string
  /** i18n: character count label, e.g. "{count} chars". Receives {count} param. */
  statusCharsLabel?: string
  /** i18n: line count label, e.g. "{count} lines". Receives {count} param. */
  statusLinesLabel?: string
  disabled?: boolean
}>(), {
  jump: null,
  lineClass: () => '',
  enableVarClick: false,
  showStatusbar: true,
  placeholder: '',
  statusCursorLabel: 'Ln {line}, Col {col}',
  statusCharsLabel: '{count} chars',
  statusLinesLabel: '{count} lines',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [string]
  'var-click': [payload: { varName: string; cursorPos: number; pos: { top: number; left: number } }]
  'var-click-miss': []
}>()

const taRef = ref<HTMLTextAreaElement>()
const hlRef = ref<HTMLPreElement>()
const lnRef = ref<HTMLElement>()
const mirrorRef = ref<HTMLDivElement>()
const measureRef = ref<HTMLDivElement>()

// ---- Tunable performance knobs ----
// RESIZE_DEBOUNCE_MS: how long to wait after the editor's size last changed (e.g. mid-drag on
// the sidebar/var-nav/preview width handles) before re-measuring line-wrap.
const RESIZE_DEBOUNCE_MS = 20

const content = ref(props.modelValue)
const cursorLine = ref(1)
const cursorCol = ref(1)
const cursorText = computed(() =>
  props.statusCursorLabel.replace(/\{line\}/g, String(cursorLine.value)).replace(/\{col\}/g, String(cursorCol.value)))
const lineCount = computed(() => 1 + (content.value.match(/\n/g) || []).length)
const charsLabel = computed(() => props.statusCharsLabel.replace(/\{count\}/g, String(content.value.length)))
const linesLabel = computed(() => props.statusLinesLabel.replace(/\{count\}/g, String(lineCount.value)))

const lineHeights = ref<number[]>([])

// Highlight — bypass Vue's v-html diff entirely, AND patch only the lines that actually
// changed instead of replacing the whole <pre>'s innerHTML on every keystroke.
//
// The old v-html approach meant Vue diffed/patched the entire <pre> tree on every keystroke,
// which is O(n) in the number of highlight spans; going to direct innerHTML fixed the Vue-vdom
// half of that cost, but a single `hlRef.value.innerHTML = ...` assignment is STILL an O(document
// length) DOM write — the browser has to re-layout/re-paint the entire overlay, every keystroke,
// regardless of how the highlighting itself was computed. For long/heavily-highlighted blocks
// that write alone is what caused input to visibly lag behind the caret ("chunky" typing), and
// is also why an earlier version of this file hid the overlay during typing (`.typing` CSS
// class + TYPING_IDLE_MS deferral) — that traded the lag for "highlighting disappears while
// typing, then flashes/re-lags once when it catches up", which is arguably worse.
//
// Fix: `highlightLines()` (composables/useHighlight.ts) returns the highlighted HTML split one
// string per LOGICAL line (same indexing as `lineHeights` below). One <div> per logical line is
// kept as a persistent child of the <pre>; on each refresh we diff the new per-line strings
// against what's currently in the DOM and only touch `.innerHTML` on lines that actually
// changed — typically exactly one, the line being edited. Every other line's DOM node is never
// touched, so the browser has nothing to re-layout/re-paint there. This is the same principle
// CodeMirror 5 uses for its own line rendering (view.changes marks only dirty lines; unmarked
// lines' DOM nodes are reused untouched — see src/display/view_tracking.js/update_line.js in
// the CM5 source) — ported here without needing CM5's own virtualized-viewport machinery, since
// preset blocks are short enough that rendering all lines (not just visible ones) is fine.
//
// Because a single keystroke's DOM write is now O(lines changed) instead of O(document length),
// there's no more need for the typing/idle-deferral dance: refreshHighlight() runs synchronously
// on every input event (see onInput below), and the overlay never goes blank or flashes.
let prevHlLines: string[] = []
function refreshHighlight() {
  const el = hlRef.value
  if (!el) return
  const lines = highlightLines(content.value)
  const hostDoc = getHostDocument() // see updateLineNums() below — imperative nodes must come from the host document
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === prevHlLines[i]) continue // unchanged line — leave this <div> untouched
    let child = el.children[i] as HTMLElement | undefined
    if (!child) { child = hostDoc.createElement('div'); el.appendChild(child) }
    child.innerHTML = lines[i]
  }
  while (el.children.length > lines.length) el.lastElementChild!.remove() // e.g. lines deleted
  prevHlLines = lines
}

// External changes to modelValue (block switched, Replace All, regex tab switched, ...) —
// detected because they don't match our own last-emitted value. Unlike the typing path, this
// refreshes immediately: it's not the typing hot path, and the caller usually wants to see the
// new content rendered correctly right away rather than mid-idle-callback.
watch(() => props.modelValue, (v) => {
  if (v === content.value) return
  content.value = v
  refreshHighlight()
  nextTick(() => { updateLineNums(); updateCursor() })
})

watch(() => props.jump, (jump) => {
  if (!jump || !taRef.value) return
  nextTick(() => moveCursorTo(jump.line, jump.col, jump.len, jump.keepFocus))
})

function onInput(e: Event) {
  if (props.disabled) return
  content.value = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', content.value)
  refreshHighlight() // now O(lines changed), safe to run on every keystroke — see refreshHighlight() above
  updateLineNums() // already per-line-cached; steady-state typing only ever re-measures the edited line
  updateCursor()
}

// Text changes made from onKeydown (Tab, bracket/quote auto-pairing) go through here instead of
// onInput, since they mutate ta.value directly rather than going through a native input event.
function emitContent() {
  content.value = taRef.value?.value || ''
  emit('update:modelValue', content.value)
  refreshHighlight()
  updateLineNums()
}

// ---- Per-line wrapped-height measurement ----
// The line-number gutter must match the textarea's REAL wrapped layout exactly. The previous
// approach estimated each line's wrap count from a canvas measureText() width — but that model
// can't reproduce pre-wrap+break-word layout: it UNDERCOUNTS whenever word-boundary breaks
// waste end-of-line space (gutter falls behind the text), and MISCOUNTS tab stops (a tab
// advances to the next multiple-of-`tab-size` column — anywhere from 1 to 4 space-widths —
// not a fixed 4-space width; gutter overshoots). Both directions were visible depending on
// content. So instead we let the browser itself do the wrapping: each logical line is laid out
// in its own child of a hidden container (.pm-lh-measure) that shares the textarea's exact
// font/white-space/tab-size CSS and content width, and we read its real offsetHeight.
// Cost stays low because (a) results are cached per (contentWidth, lineText) — steady-state
// typing only ever re-measures the line being edited — and (b) cache misses are measured in
// one append-everything-then-read-everything batch (a single layout pass, NOT one forced
// reflow per line), so even pasting a huge block is fine.

// Single-line height (in px) comes from one real DOM measurement of the mirror element —
// cached, and only re-measured when the font changes (see refreshFont).
let cachedLH = -1
function measureSingleLineHeight(): number {
  if (cachedLH > 0) return cachedLH
  if (!mirrorRef.value) return 20
  const mirror = mirrorRef.value
  const prevText = mirror.textContent
  mirror.textContent = '\u00A0' // a single, non-wrapping character guarantees exactly one line
  // getBoundingClientRect() (not offsetHeight) — offsetHeight's IDL type is `long`, so it
  // truncates/rounds any fractional line-height (e.g. --pm-fs:14.5px * --pm-lh:1.65 = 23.925px)
  // to an integer right here at the source. See updateLineNums() for why that sub-pixel loss
  // matters once these per-line heights get stacked.
  const h = mirror.getBoundingClientRect().height || 20
  mirror.textContent = prevText
  cachedLH = h
  return h
}

const lineHeightCache = new Map<string, number>() // key: `${contentWidth}|${lineText}` → px height
let lastLNText: string | null = null
let lastLNWidth = -1
function updateLineNums() {
  if (!taRef.value) return
  const ta = taRef.value
  const text = content.value
  const cs = getComputedStyle(ta) // safe: resolves off the live element itself, not a global
  const cw = ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  // .pm-editor-ta is overflow-y:auto (scrollbar reserved once content overflows vertically,
  // shrinking clientWidth) but .pm-editor-hl (the colored text you actually see) is
  // overflow:hidden and, left to its own CSS width:100%, never loses that width — so once a
  // scrollbar appears the visible layer wraps later than the real textarea underneath it,
  // and the gap grows with every wrapped line below that point. Forcing the same clientWidth
  // here every time (same technique already used for the measure/mirror elements below) keeps
  // the two layers' wrap points identical regardless of scrollbar state.
  if (hlRef.value) hlRef.value.style.width = ta.clientWidth + 'px'
  if (text === lastLNText && cw === lastLNWidth) return // nothing that would change wrapping has changed
  lastLNText = text; lastLNWidth = cw
  if (cw <= 0) { lineHeights.value = []; return }
  const lh = measureSingleLineHeight()
  const lines = text.split('\n')
  const heights: number[] = new Array(lines.length)
  const misses: { i: number; key: string; line: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) { heights[i] = lh; continue } // an empty logical line always renders as exactly one row
    const key = cw + '|' + line
    const hit = lineHeightCache.get(key)
    if (hit !== undefined) heights[i] = hit
    else misses.push({ i, key, line })
  }
  if (misses.length && measureRef.value) {
    const hostDoc = getHostDocument() // imperatively-created nodes must come from the host document (hostEnv.ts)
    const m = measureRef.value
    m.style.width = ta.clientWidth + 'px' // border-box + same side padding as the textarea → same content width
    const els: HTMLElement[] = []
    for (const { line } of misses) {
      const d = hostDoc.createElement('div')
      d.textContent = line
      els.push(d)
      m.appendChild(d)
    }
    for (let k = 0; k < misses.length; k++) {
      // getBoundingClientRect() keeps the fractional part of the wrapped-line height
      // (offsetHeight rounds to an integer per element — see measureSingleLineHeight()'s
      // comment). Rounding each logical line independently before stacking them as CSS
      // `height` is exactly what causes the gutter to drift further out of sync with the
      // textarea the more lines/content there are: every line's own ~0.5px rounding error
      // adds up instead of cancelling out, since the real textarea lays its text out as one
      // continuous flow with no such per-line rounding.
      const h = Math.max(els[k].getBoundingClientRect().height, lh)
      heights[misses[k].i] = h
      if (lineHeightCache.size < 5000) lineHeightCache.set(misses[k].key, h)
    }
    m.textContent = '' // drop all measurement children in one go
  }
  lineHeights.value = heights
}

// Scroll sync
function syncScroll() {
  if (!taRef.value || !hlRef.value || !lnRef.value) return
  hlRef.value.scrollTop = taRef.value.scrollTop; hlRef.value.scrollLeft = taRef.value.scrollLeft
  lnRef.value.scrollTop = taRef.value.scrollTop
}

// Cursor
function updateCursor() {
  if (!taRef.value) return
  const pos = taRef.value.selectionStart, val = taRef.value.value, before = val.substring(0, pos)
  cursorLine.value = 1 + (before.match(/\n/g) || []).length
  cursorCol.value = pos - before.lastIndexOf('\n')
}

function onClick() { updateCursor(); if (props.enableVarClick) checkVarClick() }

function getLineColPos(line: number, col: number): number {
  const ls = content.value.split('\n')
  let p = 0
  for (let i = 0; i < line && i < ls.length; i++) p += ls[i].length + 1
  return p + col
}

function moveCursorTo(line: number, col: number, len: number, keepFocus = false) {
  const ta = taRef.value
  if (!ta) return
  const lh = measureSingleLineHeight()
  ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3)
  syncScroll()
  if (keepFocus) return // preview-only: scroll the match into view, don't steal the caret
  ta.focus()
  const pos = getLineColPos(line, col)
  ta.setSelectionRange(pos, pos + len)
  updateCursor()
}

// Var click → locate the {{setvar/addvar/getvar::name}} token under the click, but only when
// the click lands precisely on the variable NAME itself (not the keyword, braces, or a setvar's
// value) — EXCEPT when that value itself contains another {{setvar/addvar/getvar}}, in which case
// we recurse into it, so clicking a var name nested inside another macro's value (e.g.
// {{addvar::a::...{{getvar::b}}...}}) still resolves to the inner `b`, not a dead end at `a`.
// Uses findMacroEnd (utils.ts, `{{`/`}}` depth counting) to find each macro's TRUE end regardless
// of nesting — a naive scan that just looks for the next `}}` would misidentify a nested macro's
// closing brace as the outer macro's own, same class of bug fixed in utils.ts's findVarOps.
function getVarNameAtPos(text: string, pos: number): { varName: string; type: string; pos: number } | null {
  function scan(from: number, to: number): { varName: string; type: string; pos: number } | null {
    let i = from
    while (i < to) {
      if (i + 1 < text.length && text[i] === '{' && text[i + 1] === '{') {
        const end = findMacroEnd(text, i)
        if (end === -1 || end > to) { i++; continue }
        if (pos >= i && pos <= end) {
          const innerStart = i + 2, innerEnd = end - 2
          const inner = text.slice(innerStart, innerEnd)
          const sm = inner.match(/^(setvar|addvar)::([\s\S]+?)::/)
          if (sm) {
            const vs = innerStart + sm[1].length + 2
            const varName = sm[2]
            if (pos >= vs && pos < vs + varName.length) return { varName, type: sm[1], pos: i }
            // Not on the outer macro's own varName — a nested var macro could still be in its value.
            return scan(vs + varName.length + 2, innerEnd)
          }
          const gm = inner.match(/^getvar::([\s\S]+)$/)
          if (gm) {
            const vs = innerStart + 'getvar::'.length
            if (pos >= vs && pos < vs + gm[1].length) return { varName: gm[1], type: 'get', pos: i }
            return null
          }
          // Not a var macro itself (e.g. {{user}}, {{roll::1d6}}) — a var macro could be nested in its args.
          return scan(innerStart, innerEnd)
        }
        i = end
        continue
      }
      i++
    }
    return null
  }
  return scan(0, text.length)
}

// Finds the on-screen (viewport) coordinates of a given character offset within the textarea,
// accounting for real word-wrapping — mirrors the text-up-to-that-offset into the hidden
// measurement element (shares the textarea's exact font/padding/width/wrap settings) with a
// zero-width marker span at the end, then reads that marker's real getBoundingClientRect().
function getCaretCoords(pos: number): { top: number; left: number } | null {
  const ta = taRef.value, mirror = mirrorRef.value
  if (!ta || !mirror) return null
  const hostDoc = getHostDocument()
  mirror.style.width = ta.clientWidth + 'px'
  mirror.textContent = ''
  mirror.appendChild(hostDoc.createTextNode(ta.value.substring(0, pos)))
  const marker = hostDoc.createElement('span')
  marker.textContent = '\u200b' // zero-width space: a real node to measure, but no visible width
  mirror.appendChild(marker)
  const markerRect = marker.getBoundingClientRect()
  mirror.textContent = '' // restore the mirror to its normal single-purpose (line-height) state
  return { top: markerRect.top, left: markerRect.left }
}

function checkVarClick() {
  if (!taRef.value) return
  const info = getVarNameAtPos(taRef.value.value, taRef.value.selectionStart)
  if (info) openVarPopupAt(info.varName.trim(), taRef.value.selectionStart)
  else emit('var-click-miss')
}

function openVarPopupAt(varName: string, cursorPos: number) {
  const ta = taRef.value
  if (!ta) return
  const hostWin = getHostWindow()
  const lh = measureSingleLineHeight()
  const coords = getCaretCoords(cursorPos)
  if (!coords) return

  // The mirror shares the textarea's exact top-left origin (both are position:absolute at
  // top:0/left:0 within the same parent), but the mirror is never scrolled — it always lays out
  // as if scrollTop/scrollLeft were 0. Subtracting the textarea's real scroll position converts
  // that into where the caret actually appears on screen right now.
  let top = coords.top - ta.scrollTop + lh + 4
  let left = coords.left - ta.scrollLeft
  left = Math.max(8, Math.min(left, hostWin.innerWidth - 380))
  if (top + 260 > hostWin.innerHeight) top = Math.max(8, coords.top - ta.scrollTop - 250)

  emit('var-click', { varName, cursorPos, pos: { top, left } })
}

// Bracket/quote pairing, matching MiMo behavior 1:1 — entirely generic text-editing behavior,
// not coupled to any domain's data model.
const BRACKET_PAIR_MAP: Record<string, string> = { '{': '}', '(': ')', '[': ']', '<': '>', '"': '"', "'": "'" }

function onKeydown(e: KeyboardEvent) {
  const ta = taRef.value!; const pos = ta.selectionStart, end = ta.selectionEnd, val = ta.value, hasSel = pos !== end

  if (e.key === 'Tab') { e.preventDefault(); ta.value = val.substring(0, pos) + '\t' + val.substring(end); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); return }

  // Backspace between an adjacent pair deletes both sides together (e.g. {{|}} -> |)
  if (e.key === 'Backspace' && !hasSel && pos > 0 && pos < val.length) {
    if (pos >= 2 && pos + 1 < val.length && val.substring(pos - 2, pos) === '{{' && val.substring(pos, pos + 2) === '}}') {
      e.preventDefault(); ta.value = val.substring(0, pos - 2) + val.substring(pos + 2); ta.selectionStart = ta.selectionEnd = pos - 2; emitContent(); updateCursor(); return
    }
    const pv = val[pos - 1], nx = val[pos]
    if (BRACKET_PAIR_MAP[pv] === nx) { e.preventDefault(); ta.value = val.substring(0, pos - 1) + val.substring(pos + 1); ta.selectionStart = ta.selectionEnd = pos - 1; emitContent(); updateCursor(); return }
  }

  // Wrap selection with bracket/quote pair
  if (hasSel) {
    if (BRACKET_PAIR_MAP[e.key]) {
      e.preventDefault()
      const s = val.substring(pos, end)
      ta.value = val.substring(0, pos) + e.key + s + BRACKET_PAIR_MAP[e.key] + val.substring(end)
      ta.selectionStart = pos + 1; ta.selectionEnd = end + 1
      emitContent(); updateCursor()
    }
    return
  }

  // Typing a closing char right before an existing matching closer just skips over it
  if (pos < val.length) {
    const nc = val[pos]
    if ((e.key === '}' && nc === '}') || (e.key === ')' && nc === ')') || (e.key === ']' && nc === ']') || (e.key === '>' && nc === '>') || (e.key === '"' && nc === '"') || (e.key === "'" && nc === "'")) {
      e.preventDefault(); ta.selectionStart = ta.selectionEnd = pos + 1; updateCursor(); return
    }
  }

  // Typing "{" — special-cased to build "{{}}" macro brackets
  if (e.key === '{') {
    e.preventDefault()
    if (pos > 0 && val[pos - 1] === '{') {
      if (pos < val.length && val[pos] === '}') { ta.value = val.substring(0, pos - 1) + '{{}}' + val.substring(pos + 1); ta.selectionStart = ta.selectionEnd = pos + 1 }
      else { ta.value = val.substring(0, pos) + '{}}' + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1 }
    } else {
      ta.value = val.substring(0, pos) + '{}' + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1
    }
    emitContent(); updateCursor(); return
  }

  const bp: Record<string, string> = { '(': ')', '[': ']', '<': '>' }
  if (bp[e.key]) { e.preventDefault(); ta.value = val.substring(0, pos) + e.key + bp[e.key] + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); updateCursor(); return }

  if (e.key === '"' || e.key === "'") { e.preventDefault(); ta.value = val.substring(0, pos) + e.key + e.key + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); updateCursor(); return }
}

// ---- ResizeObserver: re-measure line numbers when the editor is resized (e.g. sidebar/panel drag) ----
let ro: ResizeObserver | null = null
let roTimer: ReturnType<typeof setTimeout>
onMounted(() => {
  const HostResizeObserver = (getHostWindow() as any).ResizeObserver || ResizeObserver
  ro = new HostResizeObserver(() => {
    clearTimeout(roTimer)
    roTimer = setTimeout(() => { updateLineNums() }, RESIZE_DEBOUNCE_MS)
  })
  if (taRef.value) ro!.observe(taRef.value)
  nextTick(() => { refreshHighlight(); updateLineNums(); updateCursor() })
})
onUnmounted(() => { if (ro) ro.disconnect() })

// Re-measure when the font CSS vars change (Settings dialog font-size/family). Unlike Editor.vue's
// old version (which watched store.settings directly), this just re-measures on any resize of the
// textarea itself PLUS exposes refreshFont() for a caller that wants to force it explicitly — a
// font change doesn't resize the element, so the ResizeObserver above won't catch it on its own.
function refreshFont() {
  cachedLH = -1
  lastLNText = null
  lineHeightCache.clear() // font metrics changed — every cached wrapped height is stale
  nextTick(() => updateLineNums())
}
defineExpose({ refreshFont })
</script>
