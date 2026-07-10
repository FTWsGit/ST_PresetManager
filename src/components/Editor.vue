<template>
  <div class="pm-editor-panel">
    <div class="pm-editor-meta">
      <label>Name</label>
      <input type="text" :value="name" @input="onNameInput" />
      <label>Role</label>
      <select :value="role" @change="onRoleChange">
        <option value="system">system</option>
        <option value="user">user</option>
        <option value="assistant">assistant</option>
      </select>
    </div>
    <div class="pm-editor-content" ref="editorWrap">
      <div class="pm-line-nums" ref="lnRef">
        <div v-for="(h, i) in lineHeights" :key="i" class="ln" :class="lineClass(i)" :style="{ height: h + 'px' }">{{ i + 1 }}</div>
      </div>
      <div class="pm-editor-wrap">
        <pre class="pm-editor-hl" ref="hlRef" v-html="hlHtml"></pre>
        <textarea class="pm-editor-ta" ref="taRef" spellcheck="false"
                  :value="content" @input="onInput" @scroll="syncScroll"
                  @keydown="onKeydown" @click="onClick" @keyup="updateCursor"></textarea>
        <!-- hidden mirror used to measure the true wrapped height of each line (handles CJK / tabs / mixed width) -->
        <div class="pm-line-mirror" ref="mirrorRef" aria-hidden="true"></div>
      </div>
    </div>
    <div class="pm-statusbar">
      <span>{{ cursorText }}</span>
      <span>{{ content.length }} chars</span>
      <span>{{ lineCount }} lines</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useStore } from '../store'
import { highlightContent } from '../composables/useHighlight'
import { getHostWindow, getHostDocument } from '../composables/hostEnv'

const store = useStore()
const taRef = ref<HTMLTextAreaElement>()
const hlRef = ref<HTMLPreElement>()
const lnRef = ref<HTMLElement>()
const editorWrap = ref<HTMLElement>()
const mirrorRef = ref<HTMLDivElement>()

// ---- Tunable performance knobs ----
// RENDER_IDLE_TIMEOUT_MS: the maximum time we'll let syntax-highlight/line-number recompute
// wait for genuine browser idle time before forcing it to run anyway (requestIdleCallback's
// `timeout` option). Lower = catches up sooner under sustained heavy typing, at the cost of
// competing more with input rendering; higher = stays out of the way longer, but the highlighted
// view can lag further behind while typing continuously.
//   Try: 50 (catches up fast), 100 (default), 250 (very lenient, for huge blocks / weak devices).
const RENDER_IDLE_TIMEOUT_MS = 50
// RESIZE_DEBOUNCE_MS: how long to wait after the editor's size last changed (e.g. mid-drag on
// the sidebar/var-nav/preview width handles) before re-measuring line-wrap. Higher = fewer
// recomputes while actively dragging a width handle, but line numbers visibly lag the resize
// by a bit more; lower = line numbers track the drag more closely, more recomputes during drag.
//   Try: 60, 100 (default), 150.
const RESIZE_DEBOUNCE_MS = 50

const content = ref('')
const name = ref('')
const role = ref<'system' | 'user' | 'assistant'>('system')
const cursorLine = ref(1)
const cursorCol = ref(1)
const cursorText = computed(() => `Ln ${cursorLine.value}, Col ${cursorCol.value}`)
const lineCount = computed(() => 1 + (content.value.match(/\n/g) || []).length)

const lineHeights = ref<number[]>([])
let autoClosed = false

// Highlight — a manually-updated ref rather than a computed(), so its (comparatively expensive)
// recompute + innerHTML patch can be coalesced into the same debounced/batched update as line
// numbers and cursor position, instead of firing synchronously on every single keystroke.
//
// Declared here, BEFORE the `immediate: true` watcher below: that watcher calls loadBlock() ->
// refreshHighlight() synchronously the moment watch() runs (immediate watchers fire during
// setup, not on next tick), so refreshHighlight's reference to hlHtml would otherwise hit it
// while it's still in the temporal dead zone (declared later as `const`, not yet initialized) —
// "Cannot access 'hlHtml' before initialization". Function declarations like refreshHighlight
// itself are hoisted so calling them early is fine; the `const` they close over is not.
const hlHtml = ref('')
function refreshHighlight() { hlHtml.value = highlightContent(content.value) + '\n' }

// Sync block → editor
watch(() => store.selIdx, () => { loadBlock() }, { immediate: true })
watch(() => store.currentBlock?.content, (v) => {
  if (v !== undefined && v !== content.value) {
    content.value = v
    refreshHighlight() // external content change (e.g. Replace All) — reflect it immediately, not debounced
    nextTick(() => { updateLineNums() })
  }
})

// React to search / var-nav jump requests
watch(() => store.editorJump, (jump) => {
  if (!jump || !taRef.value) return
  nextTick(() => moveCursorTo(jump.line, jump.col, jump.len, jump.keepFocus))
})

function loadBlock() {
  const b = store.currentBlock
  if (b) { content.value = b.content || ''; name.value = b.name || ''; role.value = b.role || 'system' }
  else { content.value = ''; name.value = ''; role.value = 'system' }
  store.hideVarPopup()
  refreshHighlight() // one-off action, not the typing hot path — update immediately, no debounce
  nextTick(() => { updateLineNums(); updateCursor() })
}

function onNameInput(e: Event) { name.value = (e.target as HTMLInputElement).value; if (store.currentBlock) store.currentBlock.name = name.value }
function onRoleChange(e: Event) { role.value = (e.target as HTMLSelectElement).value as any; if (store.currentBlock) store.currentBlock.role = role.value }

function onInput(e: Event) {
  content.value = (e.target as HTMLTextAreaElement).value
  if (store.currentBlock) store.currentBlock.content = content.value
  store.hideVarPopup()
  scheduleRenderUpdate()
}

function emitContent() {
  content.value = taRef.value?.value || ''
  if (store.currentBlock) store.currentBlock.content = content.value
  scheduleRenderUpdate()
}

// ---- Fast text measurement ----
// The previous approach measured each line's wrapped height by writing it into a hidden DOM
// element and reading offsetHeight back — that forces a synchronous browser reflow, and doing
// it once PER LINE, on every keystroke, every block switch, and every resize-drag tick, was the
// actual cause of the input/open/resize lag: for a block with many lines this could mean dozens
// of forced reflows per frame. A <canvas> context's measureText() gives the same information
// (rendered text width) without ever touching layout, so it's orders of magnitude cheaper — this
// mirrors MiMo's original approach, which never had this lag in the first place.
let measureCanvas: HTMLCanvasElement | null = null
let measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    // IMPORTANT: create this via the host document, not the bare global `document`. A canvas
    // 2D context resolves font names (including our @imported 'JetBrains Mono'/'Fira Code')
    // against whichever document created the canvas. Our font is loaded into the HOST
    // document's stylesheet (see main.ts's style injection) — never into the iframe's own
    // document. A canvas created via the iframe's `document` would silently fail to find those
    // fonts and fall back to a generic monospace with different character-width metrics,
    // throwing off every measurement that depends on it (this is what caused the var-click
    // popup to land near the right edge instead of near the click).
    measureCanvas = getHostDocument().createElement('canvas')
    measureCtx = measureCanvas.getContext('2d')!
  }
  return measureCtx
}
function updateMeasureFont(): CanvasRenderingContext2D {
  const ctx = getMeasureCtx()
  if (taRef.value) {
    const cs = getComputedStyle(taRef.value) // safe: resolves off the live element itself, not a global
    const fontStr = cs.fontSize + ' ' + cs.fontFamily
    if (ctx.font !== fontStr) { ctx.font = fontStr; cachedLH = -1 } // font changed -> line-height cache is stale
  }
  return ctx
}

// Single-line height (in px) still comes from one real DOM measurement — canvas can't give us
// the CSS line-height directly — but it's cached and only re-measured when the font actually
// changes, instead of once per line on every call.
let cachedLH = -1
function measureSingleLineHeight(): number {
  if (cachedLH > 0) return cachedLH
  if (!mirrorRef.value) return 20
  const mirror = mirrorRef.value
  const prevText = mirror.textContent
  mirror.textContent = '\u00A0' // a single, non-wrapping character guarantees exactly one line
  const h = mirror.offsetHeight || 20
  mirror.textContent = prevText
  cachedLH = h
  return h
}

let lastLNText: string | null = null
let lastLNWidth = -1
function updateLineNums() {
  if (!taRef.value) return
  const ta = taRef.value
  const text = content.value
  const cw = ta.clientWidth - 32 // minus the textarea's own 16px left+right padding
  if (text === lastLNText && cw === lastLNWidth) return // nothing that would change wrapping has changed
  lastLNText = text; lastLNWidth = cw
  if (cw <= 0) { lineHeights.value = []; return }
  const ctx = updateMeasureFont()
  const lh = measureSingleLineHeight()
  lineHeights.value = text.split('\n').map(line => {
    const expanded = line.replace(/\t/g, '    ') // approximate tab width for measurement purposes
    const w = expanded.length > 0 ? ctx.measureText(expanded).width : 0
    const vl = Math.max(1, Math.ceil(w / cw))
    return lh * vl
  })
}

// Schedules the (comparatively expensive, for big blocks) highlight + line-number + cursor
// recompute for genuine browser idle time rather than "right before the next paint"
// (requestAnimationFrame). This distinction matters: rAF callbacks run as part of the same
// rendering pipeline that's also responsible for painting the character you just typed — if the
// rAF callback's work takes long enough, it can itself delay that paint, which is exactly what
// produces the "text appears in chunks" feeling under sustained fast typing. requestIdleCallback
// explicitly only runs when the browser has spare time *after* input/rendering work is handled,
// so it can never compete with displaying what you just typed. (Safari doesn't implement
// requestIdleCallback as of this writing, hence the setTimeout fallback below.)
const ric: (cb: () => void, opts?: { timeout: number }) => number =
  (typeof (window as any).requestIdleCallback === 'function')
    ? (window as any).requestIdleCallback.bind(window)
    : ((cb: () => void) => setTimeout(cb, 1) as unknown as number)
const cic: (id: number) => void =
  (typeof (window as any).cancelIdleCallback === 'function')
    ? (window as any).cancelIdleCallback.bind(window)
    : ((id: number) => clearTimeout(id))

let pendingIdle = 0
function scheduleRenderUpdate() {
  if (pendingIdle) return // already scheduled — will pick up the latest content.value when it runs
  pendingIdle = ric(() => {
    pendingIdle = 0
    refreshHighlight()
    updateLineNums()
    updateCursor()
  }, { timeout: RENDER_IDLE_TIMEOUT_MS })
}

function lineClass(ln: number) {
  if (!store.searchResults.length) return ''
  const blockId = store.currentBlock?.identifier
  if (!blockId) return ''
  const hit = store.searchResults.some(r => r.blockId === blockId && r.line === ln)
  if (!hit) return ''
  const cur = store.searchIdx >= 0 && store.searchResults[store.searchIdx]?.blockId === blockId && store.searchResults[store.searchIdx]?.line === ln
  return cur ? 'search-cur' : 'search-hit'
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

function onClick() { updateCursor(); checkVarClick() }

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

// Var click → show a small floating popup listing every occurrence of that variable, but only
// when the click lands precisely on the variable NAME itself — not anywhere else in the macro
// (e.g. clicking inside the value of a setvar, or the keyword, or the braces, should NOT open
// it). Ported from MiMo's getVarNameAtPos.
function getVarNameAtPos(text: string, pos: number): { varName: string; type: string; pos: number } | null {
  let depth = 0, os = -1, ois = -1, i = 0
  while (i < text.length) {
    if (i + 1 < text.length && text[i] === '{' && text[i + 1] === '{') {
      if (depth === 0) { os = i; ois = i + 2 }
      depth++; i += 2
    } else if (i + 1 < text.length && text[i] === '}' && text[i + 1] === '}') {
      depth--
      if (depth === 0 && os >= 0) {
        const me = i + 2
        if (pos >= os && pos <= me) {
          const inner = text.substring(ois, i)
          const sm = inner.match(/^(setvar|addvar)::([\s\S]+?)::([\s\S]*)$/)
          if (sm) {
            const vs = os + 2 + sm[1].length + 2
            if (pos >= vs && pos < vs + sm[2].length) return { varName: sm[2], type: sm[1], pos: os }
            return null
          }
          const gm = inner.match(/^getvar::([\s\S]+)$/)
          if (gm) {
            const vs = os + 10 // "{{" + "getvar::".length
            if (pos >= vs && pos < vs + gm[1].length) return { varName: gm[1], type: 'get', pos: os }
            return null
          }
          return null
        }
        os = -1
      }
      i += 2
    } else i++
  }
  return null
}

// Finds the on-screen (viewport) coordinates of a given character offset within the textarea,
// accounting for real word-wrapping — done by mirroring the text-up-to-that-offset into the
// hidden measurement element (which shares the textarea's exact font/padding/width/wrap
// settings) with a zero-width marker span at the end, then reading that marker's real
// getBoundingClientRect(). This is the standard "textarea caret position" technique: since it's
// driven by the browser's own layout engine, it's correct for wrapped lines in a way that a
// character-counting or unwrapped-width approximation can't be — canvas measureText() gives a
// line's *total* width, not which wrapped visual row a given offset falls on.
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
  else store.hideVarPopup()
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

  store.showVarPopup(varName, store.selIdx, cursorPos, { top, left })
}

// Tab & Auto-close (bracket/quote pairing, matching MiMo behavior 1:1)
function onKeydown(e: KeyboardEvent) {
  const ta = taRef.value!; const pos = ta.selectionStart, end = ta.selectionEnd, val = ta.value, hasSel = pos !== end

  if (e.key === 'Tab') { e.preventDefault(); ta.value = val.substring(0, pos) + '\t' + val.substring(end); ta.selectionStart = ta.selectionEnd = pos + 1; emitContent(); return }

  // Backspace between an adjacent pair deletes both sides together (e.g. {{|}} -> |)
  if (e.key === 'Backspace' && !hasSel && pos > 0 && pos < val.length) {
    if (pos >= 2 && pos + 1 < val.length && val.substring(pos - 2, pos) === '{{' && val.substring(pos, pos + 2) === '}}') {
      e.preventDefault(); ta.value = val.substring(0, pos - 2) + val.substring(pos + 2); ta.selectionStart = ta.selectionEnd = pos - 2; autoClosed = true; emitContent(); updateCursor(); return
    }
    const pv = val[pos - 1], nx = val[pos]
    const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']', '<': '>', '"': '"', "'": "'" }
    if (pairs[pv] === nx) { e.preventDefault(); ta.value = val.substring(0, pos - 1) + val.substring(pos + 1); ta.selectionStart = ta.selectionEnd = pos - 1; autoClosed = true; emitContent(); updateCursor(); return }
  }

  // Wrap selection with bracket/quote pair
  if (hasSel) {
    const wp: Record<string, string> = { '{': '}', '(': ')', '[': ']', '<': '>', '"': '"', "'": "'" }
    if (wp[e.key]) {
      e.preventDefault()
      const s = val.substring(pos, end)
      ta.value = val.substring(0, pos) + e.key + s + wp[e.key] + val.substring(end)
      ta.selectionStart = pos + 1; ta.selectionEnd = end + 1
      autoClosed = true; emitContent(); updateCursor()
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
    autoClosed = true; emitContent(); updateCursor(); return
  }

  const bp: Record<string, string> = { '(': ')', '[': ']', '<': '>' }
  if (bp[e.key]) { e.preventDefault(); ta.value = val.substring(0, pos) + e.key + bp[e.key] + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1; autoClosed = true; emitContent(); updateCursor(); return }

  if (e.key === '"' || e.key === "'") { e.preventDefault(); ta.value = val.substring(0, pos) + e.key + e.key + val.substring(pos); ta.selectionStart = ta.selectionEnd = pos + 1; autoClosed = true; emitContent(); updateCursor(); return }
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
})
onUnmounted(() => { if (ro) ro.disconnect(); if (pendingIdle) cic(pendingIdle) })

// Re-measure when font settings change — must force past the memoization guards below, since
// text content and container width can both be unchanged while only the font itself changed.
watch(() => [store.settings.editorFontSize, store.settings.editorFontFamily], () => {
  cachedLH = -1
  lastLNText = null
  nextTick(() => updateLineNums())
})
</script>
