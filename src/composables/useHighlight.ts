import { esc, span } from '../utils'

// Priority, highest to lowest: {{}} macros (always win, checked unconditionally) > <...> >
// [...] > "..."/'...' (quotes share the lowest tier and don't nest inside each other).
//
// The rule: once inside a delimiter of a given priority, only a delimiter of STRICTLY HIGHER
// priority may still open its own colored span inside it — anything of equal or lower priority
// is just plain content of the outer span. So "<>包裹引号" (a quote inside <...>) leaves the
// quote uncolored (swallowed into the <> span), but "引号包裹<>" (a <...> inside a quote) still
// lets the <> glow with its own color, because <> outranks quotes.
//
// Tiers, as numbers (higher = higher priority): quotes=1, brackets=2, angle=3. `minTier` is the
// lowest tier still allowed to open at the current recursion depth — top-level call uses 1
// (everything allowed); entering a tier-T delimiter recurses with minTier = T + 1.
//
// The previous implementation extracted {{...}} macros first and ran quote/bracket matching
// only on the plain-text segments left BETWEEN macros. That meant a quote spanning across a
// macro (e.g. '{{user}}的说明') scored its two halves independently: the trailing half often
// looked like a self-contained (wrong) quote pair, and text after the macro but still logically
// inside the original quote lost its quote coloring entirely. This version does a single
// recursive-descent pass over the whole string instead, so quote/bracket state correctly
// persists across any {{}} macros nested inside.
//
// 2026-07: `scan()` used to build an HTML string directly (`out += span(...)`/`out += esc(...)`).
// It now builds a flat list of Tokens instead — same matching logic, same recursion, same
// character-by-character control flow, just a different "what do we append" step. This is what
// lets HighlightedEditor.vue turn the result into *per logical line* HTML (`highlightLines()`)
// so it can diff-patch only the DOM of lines that actually changed, instead of replacing the
// whole overlay's innerHTML on every keystroke. See HighlightedEditor.vue's refreshHighlight().
//
// Nested delimiters used to produce literally nested <span> elements (an <hl-ab> span containing
// an <hl-sb> span containing plain text, etc). Flattening to one token per color-run instead
// (a token owns exactly its own text run, with baseCls = the innermost enclosing delimiter's
// class, same as what plain text nested inside a span would inherit) renders pixel-identical:
// every hl-* class in main.css only sets `color` (+ `font-style` for hl-cm), so nested-spans vs
// sibling-spans of the same classes are visually indistinguishable — there's no border/background
// that would make the structural difference visible. Don't add a structural hl-* CSS property
// (border, background, box-shadow) without re-checking this assumption.

type Tier = 1 | 2 | 3

export interface Token { text: string; cls: string | null }

function findMacroEnd(text: string, start: number): number {
  let depth = 1, j = start + 2
  while (j < text.length && depth > 0) {
    if (j + 1 < text.length && text[j] === '{' && text[j + 1] === '{') { depth++; j += 2 }
    else if (j + 1 < text.length && text[j] === '}' && text[j + 1] === '}') { depth--; j += 2 }
    else j++
  }
  return depth === 0 ? j : -1
}

// Pushes the tokens for one {{...}}'s worth of content (braces included) onto `out`.
function pushMacroTokens(out: Token[], inner: string): void {
  out.push({ text: '{{', cls: 'hl-b' })
  if (inner.startsWith('//')) {
    out.push({ text: inner, cls: 'hl-cm' })
  } else {
    const sa = inner.match(/^(setvar|addvar)::([\s\S]+?)::([\s\S]*)$/)
    const ga = !sa && inner.match(/^getvar::([\s\S]+)$/)
    if (sa) {
      out.push({ text: sa[1], cls: 'hl-k' }, { text: '::', cls: 'hl-s' },
                { text: sa[2], cls: 'hl-v' }, { text: '::', cls: 'hl-s' })
      out.push(...scan(sa[3], 0, 1, null, 'hl-val').tokens)
    } else if (ga) {
      out.push({ text: 'getvar', cls: 'hl-k' }, { text: '::', cls: 'hl-s' })
      out.push(...scan(ga[1], 0, 1, null, 'hl-v').tokens)
    } else {
      out.push(...scan(inner, 0, 1, null, 'hl-m').tokens)
    }
  }
  out.push({ text: '}}', cls: 'hl-b' })
}

/**
 * Scan `text` starting at index `start`, stopping early if `stopChar` is found (used when
 * we're inside a quote/bracket looking for its matching close). `minTier` is the lowest
 * delimiter tier still allowed to open a new nested span here — {{}} macros are checked
 * unconditionally regardless of this. `baseCls` is the class assigned to plain (unmatched)
 * text at this recursion level — null at the top level, the enclosing delimiter's class once
 * inside one (mirrors what plain text nested inside a <span class=X> would visually inherit).
 * Returns the flat token list for the consumed span, plus the absolute index (into the
 * original `text`) of the first character NOT consumed — either the position of `stopChar`
 * (if found) or `text.length` (if not).
 */
function scan(text: string, start: number, minTier: Tier, stopChar: string | null, baseCls: string | null): { tokens: Token[]; endIndex: number } {
  const out: Token[] = []
  let i = start, plainStart = start
  const flushPlain = (upTo: number) => { if (upTo > plainStart) out.push({ text: text.substring(plainStart, upTo), cls: baseCls }) }

  while (i < text.length) {
    if (stopChar !== null && text[i] === stopChar) {
      // word-boundary check for the closing single-quote, mirroring the original regex's (?!\w)
      if (stopChar === "'" && /\w/.test(text[i + 1] || '')) { i++; continue }
      flushPlain(i)
      return { tokens: out, endIndex: i }
    }

    // Checked unconditionally at every nesting level: {{ macro }} always wins.
    if (i + 1 < text.length && text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) {
        flushPlain(i)
        pushMacroTokens(out, text.substring(i + 2, end - 2))
        i = end; plainStart = i
        continue
      }
    }

    // Tier 3: <...> — only {{}} (unconditional) and another nested <...> may open inside it;
    // interior minTier stays at 3 (not 4) so a doubled "<<>>" recursively colors both levels
    // instead of the outer span stopping at the first ">" it finds and leaving the rest plain.
    if (minTier <= 3 && text[i] === '<') {
      const inner = scan(text, i + 1, 3, '>', 'hl-ab')
      if (inner.endIndex < text.length && text[inner.endIndex] === '>') {
        flushPlain(i)
        out.push({ text: '<', cls: 'hl-ab' }, ...inner.tokens, { text: '>', cls: 'hl-ab' })
        i = inner.endIndex + 1; plainStart = i
        continue
      }
    }

    // Tier 2: [...] — a strictly-higher-priority <...> may open inside it, and so may another
    // nested [...] (interior minTier stays at 2, same reasoning as <> above, for "[[]]").
    if (minTier <= 2 && text[i] === '[') {
      const inner = scan(text, i + 1, 2, ']', 'hl-sb')
      if (inner.endIndex < text.length && text[inner.endIndex] === ']') {
        flushPlain(i)
        out.push({ text: '[', cls: 'hl-sb' }, ...inner.tokens, { text: ']', cls: 'hl-sb' })
        i = inner.endIndex + 1; plainStart = i
        continue
      }
    }

    // Tier 1: "..." or '...' (share a tier; neither nests inside the other) — both <...> and
    // [...] may still open and glow inside a quote, since both outrank quotes.
    if (minTier <= 1 && (text[i] === '"' || text[i] === "'")) {
      const qc = text[i]
      // word-boundary guard on the OPENING quote too, so e.g. "it's" doesn't treat the
      // apostrophe as a quote-open when it's really a contraction.
      const prevOk = qc === "'" ? !/\w/.test(text[i - 1] || '') : true
      if (prevOk) {
        const cls = qc === '"' ? 'hl-dq' : 'hl-sq'
        const inner = scan(text, i + 1, 2, qc, cls)
        if (inner.endIndex < text.length && text[inner.endIndex] === qc) {
          flushPlain(i)
          out.push({ text: qc, cls }, ...inner.tokens, { text: qc, cls })
          i = inner.endIndex + 1; plainStart = i
          continue
        }
      }
    }

    i++
  }
  flushPlain(text.length)
  return { tokens: out, endIndex: text.length }
}

function tokenize(text: string): Token[] {
  return scan(text, 0, 1, null, null).tokens
}

/** Unchanged public API — full document as one HTML string. Still used internally (macro/quote
 *  content wraps recursively) and by any caller that genuinely needs one big blob (e.g. copy-out
 *  tooling). HighlightedEditor.vue no longer uses this for the live overlay — see highlightLines(). */
export function highlightContent(text: string): string {
  let out = ''
  for (const t of tokenize(text)) {
    const e = esc(t.text)
    out += t.cls ? span(t.cls, e) : e
  }
  return out
}

/**
 * Same highlighting, split into one HTML string per LOGICAL line (i.e. `text.split('\n')`-
 * aligned — same indexing as HighlightedEditor.vue's own `lineHeights`/`updateLineNums()`).
 * A token's text can legitimately contain '\n' (a {{macro}}, <...>, [...], or quote is allowed
 * to span multiple lines — that's the whole point of the recursive-descent rewrite noted above),
 * so splitting has to happen on the token stream, re-opening the same class on the next line,
 * rather than by naively cutting the assembled HTML string on '\n' (which would slice an open
 * <span> in half and leave unbalanced tags).
 *
 * A wholly empty logical line gets a single U+00A0 (matches the nbsp trick already used by
 * HighlightedEditor.vue's measureSingleLineHeight()) instead of '' — a truly empty block element
 * collapses to 0 height in some browsers, which would desync this line from the line-number
 * gutter and the real textarea underneath it.
 */
export function highlightLines(text: string): string[] {
  const lines: string[] = ['']
  for (const t of tokenize(text)) {
    const parts = t.text.split('\n')
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) lines.push('')
      if (!parts[p]) continue
      const e = esc(parts[p])
      lines[lines.length - 1] += t.cls ? span(t.cls, e) : e
    }
  }
  for (let i = 0; i < lines.length; i++) if (!lines[i]) lines[i] = '\u00A0'
  return lines
}
