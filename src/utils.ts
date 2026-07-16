import type { PresetData, PresetBlock } from './types'

export function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function span(cls: string, inner: string): string {
  return `<span class="${cls}">${inner}</span>`
}

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Maps a {{setvar/addvar/getvar}} op's `type` to its badge label + CSS class ('SET'/'set',
 *  'ADD'/'add', 'GET'/'get'). Was duplicated verbatim in VarPanel.vue and VarPopup.vue. */
export function varOpBadge(type: 'setvar' | 'addvar' | 'get'): { cls: string; label: string } {
  if (type === 'setvar') return { cls: 'set', label: 'SET' }
  if (type === 'addvar') return { cls: 'add', label: 'ADD' }
  return { cls: 'get', label: 'GET' }
}

/** Maps a prompt block's `role` to its short CSS class suffix ('user'/'asst'/'sys'), optionally
 *  under a caller-supplied prefix (e.g. PreviewPanel's 'pb-user'/'pb-asst'/'pb-sys'). Was three
 *  separate, functionally-identical copies (Sidebar.vue, CopyPanel.vue, PreviewPanel.vue) —
 *  consolidated here so a future role type doesn't need updating in three places. */
export function roleClass(role: string | undefined, prefix = ''): string {
  const suffix = role === 'user' ? 'user' : role === 'assistant' ? 'asst' : 'sys'
  return prefix + suffix
}

export interface OrderedBlockEntry { block: PresetBlock; hidden: boolean }

/** Flattens a PresetData's prompt_order (which may contain _gid-tagged group entries, see
 *  store.ts's importOrderWithGroups/exportOrder) into a plain, VISUALLY ORDERED list of blocks —
 *  the actual generation order, ignoring group boundaries entirely (callers that only need "top
 *  to bottom order", like CopyPanel.vue, don't care about the group tree itself).
 *
 *  Blocks that exist in `data.prompts` but aren't referenced anywhere in prompt_order (hidden
 *  blocks — same concept as store.ts's `hiddenBlocks` computed) are appended at the end, each
 *  flagged `hidden: true`, in their `prompts` array order.
 *
 *  Dangling order entries that reference a since-deleted prompt identifier are silently skipped
 *  (mirrors what flatNodes effectively does — it can only ever resolve identifiers that exist in
 *  `prompts`), and a duplicate order entry for the same identifier only surfaces once, at its
 *  first position.
 *
 *  Was needed because CopyPanel.vue used to iterate `data.prompts` directly — prompts[] is
 *  whatever order ST happened to store the blocks in on disk, which is NOT the order they
 *  actually render in (that's prompt_order's job) — so the copy-panel block list was visibly out
 *  of order relative to the main editor's Sidebar, and shift-range-select there picked the wrong
 *  span of rows for the same reason. */
export function orderedPromptsWithHidden(data: PresetData): OrderedBlockEntry[] {
  const byId = new Map(data.prompts.map(p => [p.identifier, p]))
  const seen = new Set<string>()
  const out: OrderedBlockEntry[] = []
  const rawOrder = (Array.isArray(data.prompt_order) && data.prompt_order.length && Array.isArray(data.prompt_order[0].order))
    ? data.prompt_order[0].order
    : []
  for (const item of rawOrder) {
    if (seen.has(item.identifier)) continue
    const b = byId.get(item.identifier)
    if (!b) continue
    seen.add(item.identifier)
    out.push({ block: b, hidden: false })
  }
  for (const b of data.prompts) {
    if (!seen.has(b.identifier)) out.push({ block: b, hidden: true })
  }
  return out
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout>
  return ((...a: any[]) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }) as unknown as T
}

/** Find the index right after the matching `}}` for a `{{` opener at `text[start..start+2)`,
 *  handling nested `{{...}}`. Deliberately a standalone minimal copy of the same scan
 *  useHighlight.ts does for coloring — that version is tangled up with recursive tier-based
 *  highlighting concerns we don't need here, and importing it back would make utils.ts (a leaf
 *  module) depend on a component-level composable. Returns -1 if unmatched. */
function findMacroEnd(text: string, start: number): number {
  let depth = 1, j = start + 2
  while (j < text.length && depth > 0) {
    if (text[j] === '{' && text[j + 1] === '{') { depth++; j += 2 }
    else if (text[j] === '}' && text[j + 1] === '}') { depth--; j += 2 }
    else j++
  }
  return depth === 0 ? j : -1
}

/**
 * Strip every `{{...}}` macro span out of `text` entirely (removed, not replaced with anything).
 *
 * Used before diffing a block's raw content against its real rendered output (see wordDiff
 * below). A macro's own literal source characters — its name, `::` separators, variable name —
 * have no correspondence to whatever it expands to, but a plain LCS diff doesn't know that; it
 * just matches whatever characters line up. If the substituted value happens to share characters
 * with the macro's own syntax (e.g. `{{getvar::用户名字}}` expanding to a value that itself
 * contains "用户"), those characters spuriously "match" the macro's raw source and get excluded
 * from the highlight — splitting what should be one solid highlighted span into fragments with
 * unhighlighted holes punched through the middle of it. Removing macro spans from the raw side
 * entirely (rather than, say, replacing them with a placeholder) sidesteps this: nothing from a
 * macro's source text can ever be a candidate match for anything in the rendered text again, so
 * a macro's entire expansion always highlights as one uninterrupted span.
 */
export function stripMacros(text: string): string {
  let out = '', i = 0
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) { i = end; continue }
    }
    out += text[i]; i++
  }
  return out
}

/**
 * Split `text` into the literal pieces that sit between/around its top-level `{{...}}` macros,
 * in order, with the macros themselves removed (mirrors stripMacros' own boundary detection so
 * the two stay in lockstep). For `n` macros this returns `n + 1` pieces — any of them can be the
 * empty string (two adjacent macros with nothing between them, or a macro flush against the very
 * start/end of `text`). Used by macroAwareDiff below to anchor on the literal text itself instead
 * of on individual tokens.
 */
function splitByMacros(text: string): string[] {
  const pieces: string[] = []
  let out = '', i = 0
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) { pieces.push(out); out = ''; i = end; continue }
    }
    out += text[i]; i++
  }
  pieces.push(out)
  return pieces
}

function pushRun(out: { text: string; added: boolean }[], text: string, added: boolean) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.added === added) last.text += text
  else out.push({ text, added })
}

/**
 * Macro-boundary-anchored diff between `raw` (author-written block content, WITH its `{{}}`
 * macros still in place) and `rendered` (the real ST-rendered text for that block). This is the
 * primary entry point for precise-preview highlighting now — see wordDiff's own doc comment for
 * the three rounds of token-level fixes it went through, all of which turned out to share one
 * root cause that this function sidesteps entirely instead of patching further:
 *
 * wordDiff's patience-diff anchoring can only ever trust a token as an anchor if that exact
 * token occurs EXACTLY ONCE in the whole block, globally. That assumption quietly breaks down on
 * real preset blocks, which are full of short, highly-repeated tokens — a single space, a lone
 * `-`, `<`/`>` from pseudo-XML wrapper tags repeated once per section, whitespace runs from
 * list-item indentation repeated once per bullet. None of those can ever be trusted anchors, so
 * whole neighborhoods of the diff fall through to plain local LCS, which is free to "borrow" a
 * same-looking token from the wrong place nearby. Visually this showed up as the highlight
 * boundary drifting by one token: swallowing the space before a substituted value, losing the
 * newline+indent after it, or slicing the leading `<` off a closing tag like `</纪录方式>` — all
 * reported independently but all the same class of bug.
 *
 * This function never needs global token uniqueness in the first place. We already know exactly
 * where every macro sits in `raw` (that's what splitByMacros gives us), so `raw` decomposes into
 * literal text segments L0, {{M0}}, L1, {{M1}}, ..., Ln — and because ST substitutes macros
 * in-place, `rendered` is expected to look like L0, expand(M0), L1, expand(M1), ..., Ln with the
 * Li segments carried over VERBATIM. So instead of a global bag-of-tokens comparison, we walk the
 * Li segments in order and locate each one as an exact substring of `rendered`, searching forward
 * from a cursor that only ever advances. A local, sequential search needs no global uniqueness
 * guarantee at all — just "does this segment's text re-occur before the next one does", which
 * holds even when the very same short separator (e.g. a repeated `\n - ` list bullet) appears
 * many times in the block, because we only ever look for the NEXT occurrence after the cursor,
 * never any occurrence anywhere. Whatever lies between two consecutive anchors is, by
 * construction, exactly that macro's expansion — highlighted as one uninterrupted span, with no
 * risk of a token from elsewhere in the block leaking in and punching a hole through it.
 *
 * Falls back to the token-level wordDiff in two cases: no macros at all in `raw` (nothing to
 * anchor on — e.g. pure regex/extension substitution with no `{{}}` involved), or a literal
 * segment that can't be found verbatim (a macro like `{{trim}}` ate some of its neighboring
 * whitespace, or another plugin altered the literal text too) — retried once with the segment's
 * own leading/trailing whitespace trimmed off before giving up and falling back to a local
 * wordDiff for just that stretch.
 */
export function macroAwareDiff(raw: string, rendered: string): { text: string; added: boolean }[] {
  const pieces = splitByMacros(raw)
  if (pieces.length === 1) return wordDiff(raw, rendered) // no macros — nothing to anchor on

  const out: { text: string; added: boolean }[] = []
  let cursor = 0

  for (const piece of pieces) {
    if (!piece) continue // empty segment (adjacent macros, or one flush against start/end) — nothing to anchor on here

    let idx = rendered.indexOf(piece, cursor)
    let matched = piece
    if (idx === -1) {
      // Most common reason a literal segment doesn't survive verbatim: a macro on one of its
      // edges (e.g. {{trim}}) consumed some of its own adjacent whitespace. Retry with that
      // whitespace stripped before falling all the way back.
      const trimmed = piece.trim()
      if (trimmed && (idx = rendered.indexOf(trimmed, cursor)) !== -1) matched = trimmed
    }

    if (idx === -1) {
      // Genuinely can't anchor this segment verbatim — fall back to the old token-level diff,
      // scoped to just this segment against the rest of the unconsumed rendered text.
      const local = wordDiff(piece, rendered.slice(cursor))
      for (const seg of local) pushRun(out, seg.text, seg.added)
      cursor = rendered.length // local wordDiff already accounted for everything remaining
      continue
    }

    pushRun(out, rendered.slice(cursor, idx), true) // gap before this anchor = prior macro's expansion
    pushRun(out, matched, false)
    cursor = idx + matched.length
  }

  if (cursor < rendered.length) pushRun(out, rendered.slice(cursor), true) // trailing macro expansion, if raw ended on one

  return out
}

/**
 * Word-level diff between `a` (raw, author-written block content) and `b` (the real
 * ST-rendered text for that block, after macros/regex/other extensions ran). Used to highlight
 * which parts of the rendered text are the *result* of substitution rather than literal
 * boilerplate that was already there — the ST render only gives us final text with no markers
 * of what changed, so this reconstructs an approximation.
 *
 * Returns `b` as a sequence of {text, added} runs: `added: false` runs are tokens that matched
 * something in `a` (kept verbatim, in order); `added: true` runs are tokens present in `b` but
 * not matched from `a` (macro output, regex-inserted text, etc). Tokens only in `a` (removed by
 * rendering, e.g. a `{{trim}}` macro eating the newline after it) are simply dropped — `b` is
 * ground truth for what to display, `a` only exists to tell added text apart from kept text.
 *
 * This is a heuristic, not a semantic diff: it can't know a plugin transformed "foo" into "bar"
 * vs. coincidentally matched tokens elsewhere. It's meant for "does this look substituted",
 * not a byte-exact provenance trace.
 *
 * Tokenization: plain whitespace-delimited "words" fall apart badly on CJK/punctuation-dense
 * text, because there are no spaces between "words" to split on — a whole clause like
 * `|对'{{user}}'怀有爱护` is ONE token, so as soon as `{{user}}` resolves to something else the
 * entire clause reads as "changed" and gets highlighted wholesale, when really only the 3
 * substituted characters should be. So tokens are: whitespace runs, OR runs of ASCII
 * letters/digits/underscore (keeps English words/macro output like "FTW" atomic instead of
 * shattering them into single letters), OR any other single character on its own (CJK
 * ideographs, punctuation, quotes, emoji, ...). That lets the diff align at per-character
 * resolution through CJK text while still treating Latin words as whole units.
 *
 * Matching strategy: plain LCS on that token stream turns out not to be enough on its own.
 * Repeated short tokens are everywhere in this kind of text — `<`/`>` from custom pseudo-XML
 * wrappers, CJK punctuation, quote marks — and whenever several equally-short-distance candidates
 * exist, a plain LCS DP will happily settle on WHICHEVER maximum-length alignment it finds first,
 * which is "valid" by the letter of longest-common-subsequence but not necessarily the one a
 * human reading the two texts side by side would consider correct — e.g. matching a `<` deep
 * inside one substituted value against an unrelated `<` several lines away, instead of the `<`
 * that actually belongs to the closing tag right next to it. That shows up as a stray
 * unhighlighted character (or a whole tag) punched out of the middle of what should read as one
 * continuous highlighted span, or — worse — a literal, unchanged tag like `</纪录方式>` reading as
 * partly "substituted" because its own `<` got stolen by a wrong match elsewhere.
 *
 * So matching is done in two tiers:
 *  1. Patience-style anchoring (diffRange): tokens that occur EXACTLY ONCE on both sides are
 *     unambiguous — there's only one thing they could possibly correspond to. Take the longest
 *     increasing (order-preserving) subsequence of those as trusted sync points, then recurse on
 *     the gaps between them. This is what correctly threads the needle between two genuinely
 *     identical structural tags even when there are many other repeated tokens in between.
 *  2. Plain LCS (lcsAtoms) as the base case, only ever run on whatever's left AFTER anchoring —
 *     i.e. small stretches already boxed in by trusted anchors on both sides (or the whole input,
 *     if it has no unique tokens at all to anchor on, which only happens for very short/highly
 *     repetitive spans where an O(n*m) DP is cheap anyway).
 * A final noise-collapse pass folds any short (< MIN_TRUSTED_RUN tokens) matched run that came
 * from tier 2 and is sandwiched between two highlighted runs back into the highlight — even with
 * anchoring, a small leftover gap can still occasionally resolve to a coincidental single-token
 * match rather than a meaningful one.
 */
function tokenizeForDiff(s: string): string[] {
  return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []
}

type DiffAtom = { text: string; added: boolean; trusted: boolean }

// Plain LCS, one atom per token. Used as the base case once patience-anchoring has boxed a
// region in (or immediately, for regions too small to bother anchoring). Matches here are
// `trusted: false` — still just "a" valid alignment, not necessarily "the" correct one.
function lcsAtoms(A: string[], B: string[]): DiffAtom[] {
  const n = A.length, m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffAtom[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ text: B[j], added: false, trusted: false }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { i++ } // token only in A: dropped from rendered output
    else { out.push({ text: B[j], added: true, trusted: false }); j++ } // token only in B: substituted/inserted
  }
  while (j < m) { out.push({ text: B[j], added: true, trusted: false }); j++ }
  return out
}

// Below this (post-anchor-split) n*m, just run plain LCS directly — small enough to be cheap,
// and not worth the overhead of scanning for anchors that likely aren't there anyway.
const LCS_FALLBACK_MAX = 2500
// Overall (pre-split) budget backstop — see wordDiff's top-level call site.
const DIFF_TOKEN_BUDGET = 4_000_000

function diffRange(A: string[], B: string[]): DiffAtom[] {
  if (!A.length) return B.length ? [{ text: B.join(''), added: true, trusted: false }] : []
  if (!B.length) return []
  if (A.length * B.length <= LCS_FALLBACK_MAX) return lcsAtoms(A, B)

  // Tokens that occur exactly once in BOTH A and B: unambiguous by construction, whatever else
  // is going on elsewhere in the text.
  const countA = new Map<string, number>(), firstA = new Map<string, number>()
  A.forEach((t, idx) => { countA.set(t, (countA.get(t) || 0) + 1); if (!firstA.has(t)) firstA.set(t, idx) })
  const countB = new Map<string, number>(), firstB = new Map<string, number>()
  B.forEach((t, idx) => { countB.set(t, (countB.get(t) || 0) + 1); if (!firstB.has(t)) firstB.set(t, idx) })

  const candidates: { ai: number; bi: number }[] = []
  for (let ai = 0; ai < A.length; ai++) {
    const t = A[ai]
    if (countA.get(t) !== 1 || countB.get(t) !== 1) continue
    candidates.push({ ai, bi: firstB.get(t)! })
  }
  if (!candidates.length) return lcsAtoms(A, B) // nothing unique to anchor on — fall back directly

  // Anchors must also preserve relative order (can't match ai=5<->bi=10 and ai=8<->bi=3, that'd
  // cross) — the longest increasing subsequence of B-positions, taken in A-order, is the largest
  // non-crossing set of these unique matches.
  const lis = lisIndices(candidates.map(c => c.bi))
  const anchors = lis.map(idx => candidates[idx])

  const out: DiffAtom[] = []
  let prevA = 0, prevB = 0
  for (const anc of anchors) {
    out.push(...diffRange(A.slice(prevA, anc.ai), B.slice(prevB, anc.bi)))
    out.push({ text: B[anc.bi], added: false, trusted: true })
    prevA = anc.ai + 1; prevB = anc.bi + 1
  }
  out.push(...diffRange(A.slice(prevA), B.slice(prevB)))
  return out
}

// Longest increasing subsequence, returned as indices into `seq` (patience sorting). Used to
// pick the largest non-crossing set of candidate anchor pairs.
function lisIndices(seq: number[]): number[] {
  const parent: number[] = new Array(seq.length).fill(-1)
  const pileTops: number[] = []
  for (let idx = 0; idx < seq.length; idx++) {
    const v = seq[idx]
    let lo = 0, hi = pileTops.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[pileTops[mid]] < v) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) parent[idx] = pileTops[lo - 1]
    if (lo === pileTops.length) pileTops.push(idx)
    else pileTops[lo] = idx
  }
  const result: number[] = []
  let k = pileTops.length ? pileTops[pileTops.length - 1] : -1
  while (k !== -1) { result.push(k); k = parent[k] }
  return result.reverse()
}

// Minimum number of CONSECUTIVE tokens an untrusted (tier-2 LCS) matched run needs before we
// trust it as "genuinely carried-over text" rather than a coincidental character collision —
// see the noise-collapse pass at the end of wordDiff for why this matters.
const MIN_TRUSTED_RUN = 2

export function wordDiff(a: string, b: string): { text: string; added: boolean }[] {
  const A = tokenizeForDiff(a), B = tokenizeForDiff(b)

  // Trim matching prefix/suffix first. Real preset blocks are usually mostly-identical text with
  // one or a few small substituted spots, so this alone shrinks the anchoring/DP work down to
  // just the neighborhood of the actual edits, regardless of how long the surrounding block is.
  // These are exact matches walked in from both ends of the whole string — trustworthy
  // regardless of length, same as a patience anchor.
  let lo = 0
  const maxLo = Math.min(A.length, B.length)
  while (lo < maxLo && A[lo] === B[lo]) lo++
  let hiA = A.length, hiB = B.length
  while (hiA > lo && hiB > lo && A[hiA - 1] === B[hiB - 1]) { hiA--; hiB-- }

  const midA = A.slice(lo, hiA), midB = B.slice(lo, hiB)
  const atoms: DiffAtom[] = []
  for (let k = 0; k < lo; k++) atoms.push({ text: B[k], added: false, trusted: true })
  if (midA.length * midB.length > DIFF_TOKEN_BUDGET) {
    // Edit region itself too large to diff cheaply — show it as one plain (unhighlighted) chunk
    // rather than risk a multi-second synchronous computation. Prefix/suffix outside it are still
    // correctly un-highlighted above/below, so this only degrades the middle.
    if (midB.length) atoms.push({ text: midB.join(''), added: false, trusted: false })
  } else {
    atoms.push(...diffRange(midA, midB))
  }
  for (let k = hiB; k < B.length; k++) atoms.push({ text: B[k], added: false, trusted: true })

  // Merge consecutive same-`added` atoms into runs, tracking token count and whether ANY atom in
  // the run is trusted (patience anchor or boundary trim) — a run touched by even one trusted
  // atom is exempt from the noise-collapse check below, same as a long-enough untrusted run.
  const segs: { text: string; added: boolean; tokens: number; anyTrusted: boolean }[] = []
  for (const at of atoms) {
    const last = segs[segs.length - 1]
    if (last && last.added === at.added) { last.text += at.text; last.tokens++; last.anyTrusted = last.anyTrusted || at.trusted }
    else segs.push({ text: at.text, added: at.added, tokens: 1, anyTrusted: at.trusted })
  }

  // Noise collapse: an untrusted matched run sandwiched between two highlighted runs, made of
  // fewer than MIN_TRUSTED_RUN tokens, is more likely a coincidental leftover collision (even
  // after anchoring, small gaps between anchors can still resolve this way) than a genuine chunk
  // of carried-over literal text — fold it into the surrounding highlight instead of letting it
  // punch a hole through the middle of it.
  const out: { text: string; added: boolean }[] = []
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]
    const prevAdded = out.length ? out[out.length - 1].added : false
    const nextAdded = k + 1 < segs.length ? segs[k + 1].added : false
    const isNoise = !seg.added && !seg.anyTrusted && prevAdded && nextAdded && seg.tokens < MIN_TRUSTED_RUN
    const added = isNoise ? true : seg.added
    if (out.length && out[out.length - 1].added === added) out[out.length - 1].text += seg.text
    else out.push({ text: seg.text, added })
  }
  return out
}

export interface MultiSelectState<T> {
  selected: Set<T>
  anchor: T | null
}

/**
 * Shared plain/ctrl/shift multi-select semantics — one click model used both by the main
 * editor's block list (Sidebar.vue, via store.ts's selectBlock) and CopyPanel.vue's two
 * independent block lists, so the two don't drift out of sync with each other over time.
 *
 * `id` is whatever the caller uses to identify a selectable row (a numeric flatNodes index for
 * the main sidebar, a string block identifier for CopyPanel). `all` is every selectable id in
 * the list's current on-screen order — only needed for the shift-range case, to walk from the
 * anchor to the clicked row in visual order rather than doing raw Math.min/max arithmetic on the
 * ids themselves (which only happens to work when ids ARE consecutive integers, as in the
 * original gi-index-based sidebar implementation; CopyPanel's string identifiers aren't).
 *
 * Semantics (mirrors the original store.ts selectBlock() exactly):
 *  - plain click: if this is the only currently-selected row, clicking it again clears the
 *    selection entirely; otherwise the selection becomes just this row, which also becomes the
 *    new anchor.
 *  - ctrl+click: toggles this row in/out of the existing selection; becomes the new anchor
 *    either way (even when the click just removed it).
 *  - shift+click: requires an existing anchor (a no-op otherwise) — selects every row between
 *    the anchor and this one, inclusive, in `all`'s order. The anchor itself doesn't move, so
 *    repeated shift-clicks keep extending/shrinking the range from the same fixed start point.
 *
 * Pure/no mutation — callers assign the returned state back to their own refs, which works
 * equally well from a Pinia store action or a plain component-local ref.
 */
export function applyMultiSelect<T>(
  state: MultiSelectState<T>,
  id: T,
  all: T[],
  opts: { ctrl?: boolean; shift?: boolean }
): MultiSelectState<T> {
  const hasCtrl = opts.ctrl ?? false
  const hasShift = opts.shift ?? false
  if (!hasCtrl && !hasShift) {
    if (state.selected.size === 1 && state.selected.has(id)) return { selected: new Set(), anchor: null }
    return { selected: new Set([id]), anchor: id }
  }
  if (hasShift && state.anchor !== null) {
    const ai = all.indexOf(state.anchor), bi = all.indexOf(id)
    if (ai === -1 || bi === -1) return state
    const lo = Math.min(ai, bi), hi = Math.max(ai, bi)
    const next = new Set<T>()
    for (let i = lo; i <= hi; i++) next.add(all[i])
    return { selected: next, anchor: state.anchor }
  }
  if (hasCtrl) {
    const next = new Set(state.selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    return { selected: next, anchor: id }
  }
  return state
}
