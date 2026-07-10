export function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function span(cls: string, inner: string): string {
  return `<span class="${cls}">${inner}</span>`
}

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
 * Word-level diff between `a` (raw, author-written block content) and `b` (the real
 * ST-rendered text for that block, after macros/regex/other extensions ran). Used to highlight
 * which parts of the rendered text are the *result* of substitution rather than literal
 * boilerplate that was already there — the ST render only gives us final text with no markers
 * of what changed, so this reconstructs an approximation via LCS on tokens.
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
 */
function tokenizeForDiff(s: string): string[] {
  return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []
}

// Max (post-trim) token-count product we're willing to run the O(n*m) LCS DP over. Prefix/suffix
// trimming (below) usually keeps the actual DP input far smaller than the whole block even for
// long blocks, since it only needs to cover the neighborhood of the actual edits — this budget
// is a backstop for the rare case of a genuinely large, genuinely different middle section.
const DIFF_TOKEN_BUDGET = 4_000_000

// Minimum number of CONSECUTIVE tokens an LCS-matched run inside the (ambiguous) middle region
// needs before we trust it as "genuinely carried-over text" rather than a coincidental character
// collision — see the noise-collapse pass at the end of wordDiff for why this matters.
const MIN_TRUSTED_RUN = 2

export function wordDiff(a: string, b: string): { text: string; added: boolean }[] {
  const A = tokenizeForDiff(a), B = tokenizeForDiff(b)

  // Segment builder: merges adjacent runs that share both `added` and `trusted` into one, and
  // (for untrusted `added:false` runs) counts how many discrete matched tokens went into it —
  // that count is what the noise-collapse pass below uses to tell a real multi-token match apart
  // from a single coincidentally-matching character.
  type Seg = { text: string; added: boolean; tokens: number; trusted: boolean }
  const segs: Seg[] = []
  const push = (text: string, added: boolean, trusted: boolean) => {
    if (!text) return
    const last = segs[segs.length - 1]
    if (last && last.added === added && last.trusted === trusted) { last.text += text; last.tokens++ }
    else segs.push({ text, added, tokens: 1, trusted })
  }

  // Trim matching prefix/suffix first. Real preset blocks are usually mostly-identical text with
  // one or a few small substituted spots, so this alone shrinks the O(n*m) DP down to just the
  // neighborhood of the actual edits, regardless of how long the surrounding block is. These are
  // exact anchor matches walked in from both ends of the whole string, not an ambiguous LCS pick
  // among several candidates — trustworthy regardless of length, unlike matches found by the DP
  // below, so they're tagged `trusted` and the noise-collapse pass never reconsiders them.
  let lo = 0
  const maxLo = Math.min(A.length, B.length)
  while (lo < maxLo && A[lo] === B[lo]) lo++
  let hiA = A.length, hiB = B.length
  while (hiA > lo && hiB > lo && A[hiA - 1] === B[hiB - 1]) { hiA--; hiB-- }

  if (lo > 0) push(B.slice(0, lo).join(''), false, true)

  const midA = A.slice(lo, hiA), midB = B.slice(lo, hiB)
  const n = midA.length, m = midB.length
  if (n * m > DIFF_TOKEN_BUDGET) {
    // Edit region itself too large to LCS cheaply — show it as one plain (unhighlighted) chunk
    // rather than risk a multi-second synchronous diff. Prefix/suffix outside it are still
    // correctly un-highlighted above/below, so this only degrades the middle.
    push(midB.join(''), false, false)
  } else {
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
    let i = 0, j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) { push(midB[j], false, false); i++; j++ } // untrusted: an ambiguous LCS pick
      else if (dp[i + 1][j] >= dp[i][j + 1]) { i++ } // token only in A: dropped from rendered output
      else { push(midB[j], true, false); j++ }       // token only in B: substituted/inserted
    }
    while (j < m) { push(midB[j], true, false); j++ }
  }

  if (hiB < B.length) push(B.slice(hiB).join(''), false, true)

  // Noise collapse: when several identical short tokens exist on both sides (very common with
  // CJK punctuation like `<`/`。`/quote marks), a plain LCS has multiple equally "optimal"
  // alignments to choose from and can arbitrarily pick one that matches, say, a `<` deep inside
  // one substituted value against an unrelated `<` a few characters later — technically a valid
  // longest-common-subsequence, but visually it punches an unhighlighted hole through the middle
  // of what should read as one continuous highlighted span. An untrusted matched run sandwiched
  // between two highlighted runs, made of fewer than MIN_TRUSTED_RUN tokens, is far more likely
  // to be exactly that kind of coincidental collision than a genuine chunk of carried-over
  // literal text — so it gets folded into the surrounding highlight instead.
  const out: { text: string; added: boolean }[] = []
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]
    const prevAdded = out.length ? out[out.length - 1].added : false
    const nextAdded = k + 1 < segs.length ? segs[k + 1].added : false
    const isNoise = !seg.added && !seg.trusted && prevAdded && nextAdded && seg.tokens < MIN_TRUSTED_RUN
    const added = isNoise ? true : seg.added
    if (out.length && out[out.length - 1].added === added) out[out.length - 1].text += seg.text
    else out.push({ text: seg.text, added })
  }
  return out
}
