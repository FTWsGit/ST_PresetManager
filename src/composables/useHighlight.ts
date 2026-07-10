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

type Tier = 1 | 2 | 3

function findMacroEnd(text: string, start: number): number {
  let depth = 1, j = start + 2
  while (j < text.length && depth > 0) {
    if (j + 1 < text.length && text[j] === '{' && text[j + 1] === '{') { depth++; j += 2 }
    else if (j + 1 < text.length && text[j] === '}' && text[j + 1] === '}') { depth--; j += 2 }
    else j++
  }
  return depth === 0 ? j : -1
}

function highlightMacro(inner: string): string {
  if (inner.startsWith('//')) return span('hl-b', '{{') + span('hl-cm', esc(inner)) + span('hl-b', '}}')
  const sa = inner.match(/^(setvar|addvar)::([\s\S]+?)::([\s\S]*)$/)
  if (sa) return span('hl-b', '{{') + span('hl-k', sa[1]) + span('hl-s', '::') + span('hl-v', esc(sa[2])) + span('hl-s', '::') + span('hl-val', highlightContent(sa[3])) + span('hl-b', '}}')
  const ga = inner.match(/^getvar::([\s\S]+)$/)
  if (ga) return span('hl-b', '{{') + span('hl-k', 'getvar') + span('hl-s', '::') + span('hl-v', highlightContent(ga[1])) + span('hl-b', '}}')
  return span('hl-b', '{{') + span('hl-m', highlightContent(inner)) + span('hl-b', '}}')
}

/**
 * Scan `text` starting at index `start`, stopping early if `stopChar` is found (used when
 * we're inside a quote/bracket looking for its matching close). `minTier` is the lowest
 * delimiter tier still allowed to open a new nested span here — {{}} macros are checked
 * unconditionally regardless of this. Returns the highlighted HTML for the consumed span, plus
 * the absolute index (into the original `text`) of the first character NOT consumed — either
 * the position of `stopChar` (if found) or `text.length` (if not).
 */
function scan(text: string, start: number, minTier: Tier, stopChar: string | null): { html: string; endIndex: number } {
  let out = '', i = start, plainStart = start
  const flushPlain = (upTo: number) => { if (upTo > plainStart) out += esc(text.substring(plainStart, upTo)) }

  while (i < text.length) {
    if (stopChar !== null && text[i] === stopChar) {
      // word-boundary check for the closing single-quote, mirroring the original regex's (?!\w)
      if (stopChar === "'" && /\w/.test(text[i + 1] || '')) { i++; continue }
      flushPlain(i)
      return { html: out, endIndex: i }
    }

    // Checked unconditionally at every nesting level: {{ macro }} always wins.
    if (i + 1 < text.length && text[i] === '{' && text[i + 1] === '{') {
      const end = findMacroEnd(text, i)
      if (end !== -1) {
        flushPlain(i)
        out += highlightMacro(text.substring(i + 2, end - 2))
        i = end; plainStart = i
        continue
      }
    }

    // Tier 3: <...> — only {{}} (unconditional) and another nested <...> may open inside it;
    // interior minTier stays at 3 (not 4) so a doubled "<<>>" recursively colors both levels
    // instead of the outer span stopping at the first ">" it finds and leaving the rest plain.
    if (minTier <= 3 && text[i] === '<') {
      const inner = scan(text, i + 1, 3, '>')
      if (inner.endIndex < text.length && text[inner.endIndex] === '>') {
        flushPlain(i)
        out += span('hl-ab', esc('<') + inner.html + esc('>'))
        i = inner.endIndex + 1; plainStart = i
        continue
      }
    }

    // Tier 2: [...] — a strictly-higher-priority <...> may open inside it, and so may another
    // nested [...] (interior minTier stays at 2, same reasoning as <> above, for "[[]]").
    if (minTier <= 2 && text[i] === '[') {
      const inner = scan(text, i + 1, 2, ']')
      if (inner.endIndex < text.length && text[inner.endIndex] === ']') {
        flushPlain(i)
        out += span('hl-sb', esc('[') + inner.html + esc(']'))
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
        const inner = scan(text, i + 1, 2, qc)
        if (inner.endIndex < text.length && text[inner.endIndex] === qc) {
          flushPlain(i)
          out += span(qc === '"' ? 'hl-dq' : 'hl-sq', esc(qc) + inner.html + esc(qc))
          i = inner.endIndex + 1; plainStart = i
          continue
        }
      }
    }

    i++
  }
  flushPlain(text.length)
  return { html: out, endIndex: text.length }
}

export function highlightContent(text: string): string {
  return scan(text, 0, 1, null).html
}
