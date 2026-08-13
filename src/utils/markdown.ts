/**
 * Zero-dependency Markdown renderer for assistant chat messages.
 *
 * WHY ZERO-DEPENDENCY: `marked` (~35KB) needs DOMPurify (~20KB) alongside it to be
 * safe under `v-html`, and `snarkdown` (~1KB) does not sanitize at all — two new
 * runtime dependencies against an app that ships exactly three. The subset the
 * persona backend actually emits is small enough to own outright.
 *
 * SECURITY — the single invariant that keeps the `v-html` at the call site safe:
 * the FIRST thing renderMarkdown does is HTML-escape the ENTIRE input. Every '<'
 * or '>' in the returned string is therefore one this module emitted itself, from
 * the allowlist below — never a tag that came in through `src`. Do not add a rule
 * that copies un-escaped input into markup or an attribute, and never feed the
 * output of this function to anything that would double-unescape it.
 *
 * Supported subset (the persona backend emits only light Markdown): fenced code
 * blocks, inline code, bold, italic, unordered/ordered lists, hard line breaks,
 * and links whose href is `http(s):` or `mailto:` only (everything else renders
 * as inert literal text).
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(input: string): string {
  // `?? ch` rather than `!` — the callback param is typed `string`, so the lookup
  // is `string | undefined` under noUncheckedIndexedAccess even though the regex
  // guarantees a hit.
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch)
}

function isSafeHref(href: string): boolean {
  // The href has already been HTML-escaped, so an embedded quote is `&quot;` and
  // cannot break out of the attribute. Restricting the scheme is what defuses the
  // `javascript:` / `data:` vectors that v-html would otherwise honour.
  return /^(https?:\/\/|mailto:)/i.test(href)
}

/*
 * Placeholder delimiters, built from Private-Use-Area codepoints via
 * String.fromCharCode (so no exotic literal ever needs to appear in this file).
 * PUA characters never occur in chat text and carry no Markdown meaning, so a
 * later pass leaves them untouched AND a literal digit in the message ("I have 3
 * apples") is never mistaken for a placeholder index. Inline and block spans use
 * distinct delimiter pairs so their restore passes cannot cross-match.
 */
const INLINE_OPEN = String.fromCharCode(0xe000)
const INLINE_CLOSE = String.fromCharCode(0xe001)
const BLOCK_OPEN = String.fromCharCode(0xe002)
const BLOCK_CLOSE = String.fromCharCode(0xe003)
const INLINE_PLACEHOLDER = new RegExp(`${INLINE_OPEN}(\\d+)${INLINE_CLOSE}`, 'g')
const BLOCK_PLACEHOLDER = new RegExp(`${BLOCK_OPEN}(\\d+)${BLOCK_CLOSE}`, 'g')
const BLOCK_LINE = new RegExp(`^${BLOCK_OPEN}\\d+${BLOCK_CLOSE}$`)

/**
 * Inline formatting for one line of already-escaped text.
 *
 * Inline code, links and autolinks are stashed as placeholders BEFORE the emphasis
 * passes run, for two reasons: code spans must render verbatim, and a URL must never
 * meet the emphasis regexes (`https://a.co/a_b_c` would otherwise become
 * `https://a.co/a<em>b</em>c`, corrupting the href).
 *
 * `stashed` is threaded through rather than owned here so the recursive call for a
 * link's label shares one array with its caller. With a per-call array, a placeholder
 * minted by the caller (inline code inside a link label) would hit an empty array in
 * the recursion and resolve to nothing — silently deleting the code span.
 */
function formatInline(text: string, stashed: string[]): string {
  const stash = (html: string): string => `${INLINE_OPEN}${stashed.push(html) - 1}${INLINE_CLOSE}`
  const anchor = (href: string, inner: string): string =>
    stash(`<a href="${href}" target="_blank" rel="noopener noreferrer">${inner}</a>`)

  let out = text

  // Inline code: `code` — contents are literal.
  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => stash(`<code class="inline-code">${code}</code>`))

  // Links: [label](href). The label may still contain emphasis, so it is rendered
  // recursively; the finished anchor is stashed so its href is opaque to the
  // emphasis passes below.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    if (!isSafeHref(href)) return match
    return anchor(href, formatInline(label, stashed))
  })

  // Bare URLs. The trailing class excludes sentence punctuation so "lihat https://a.co."
  // does not swallow the full stop into the href. Must run after the [label](href) pass
  // (whose URLs are already stashed) and before emphasis.
  out = out.replace(
    /(^|[\s(])(https?:\/\/[^\s<>()]*[^\s<>().,!?:;'"])/g,
    (_m, before: string, url: string) => `${before}${anchor(url, url)}`,
  )

  /*
   * Emphasis. Two guards, both load-bearing:
   *
   * - A marker may not be adjacent to whitespace on the inside, so "2 * 3 * 4" stays
   *   arithmetic instead of becoming "2 <em> 3 </em> 4".
   * - An underscore marker may not sit against a word character on the outside, so
   *   snake_case survives. Without it "get_user_by_id" renders "get<em>user</em>by_id"
   *   and Indonesian text like "terputus_di_tengah" is mangled the same way. The
   *   outside-left check is a capture group re-emitted as $1 rather than a lookbehind,
   *   because lookbehind is unsupported in Safari before 16.4 and an unsupported group
   *   is a regex *syntax* error — it would take the whole bundle down, not just
   *   degrade this one rule.
   *
   * Bold runs before italic so `**x**` is not eaten by the single-marker rules.
   */
  out = out.replace(/\*\*(?=\S)([^*\n]*[^*\s])\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^\w_])__(?=\S)([^_\n]*[^_\s])__(?!\w)/g, '$1<strong>$2</strong>')
  out = out.replace(/\*(?=\S)([^*\n]*[^*\s])\*/g, '<em>$1</em>')
  out = out.replace(/(^|[^\w_])_(?=\S)([^_\n]*[^_\s])_(?!\w)/g, '$1<em>$2</em>')

  return out
}

/**
 * Formats one line, then resolves every placeholder minted while doing so.
 *
 * The restore is deliberately separate from `formatInline` so it runs only at the top
 * level, over the single shared stash — and it repeats, because a stashed value can
 * itself contain a placeholder (inline code inside a link label) and `String.replace`
 * does not rescan the text it just substituted in. One pass would leave that inner
 * placeholder in the output as a stray invisible PUA character.
 *
 * The condition tests for the delimiter with `includes` rather than `INLINE_PLACEHOLDER.test`
 * on purpose: that regex is global, and `test` on a global regex advances `lastIndex`,
 * so it would start skipping matches between iterations.
 */
function renderInline(text: string): string {
  const stashed: string[] = []
  let out = formatInline(text, stashed)

  // Real nesting depth is 2 (an anchor holding a code span); the cap is a guarantee that
  // an unresolvable placeholder cannot spin here rather than a real expectation.
  for (let pass = 0; pass < 5 && out.includes(INLINE_OPEN); pass++) {
    // `?? _m` keeps an unresolvable placeholder as-is instead of deleting text. The only
    // way to see one is a Private-Use-Area character arriving in the source message.
    out = out.replace(INLINE_PLACEHOLDER, (_m, i: string) => stashed[Number(i)] ?? _m)
  }

  return out
}

export function renderMarkdown(src: string): string {
  if (!src) return ''

  // Step 1 (SECURITY-CRITICAL, must stay first): escape the whole input.
  const escaped = escapeHtml(src)

  // Step 2: lift fenced code blocks out before anything else looks at the text,
  // so their bodies are never treated as lists / emphasis / links. The body is
  // already escaped; stash the finished <pre> and leave a standalone-line marker.
  const blocks: string[] = []
  const deblocked = escaped.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, body: string) => {
    const trimmedBody = body.replace(/\n+$/, '')
    const idx = blocks.push(`<pre class="code-block"><code>${trimmedBody}</code></pre>`) - 1
    return `\n${BLOCK_OPEN}${idx}${BLOCK_CLOSE}\n`
  })

  // Step 3: block-level assembly. Consecutive list items collapse into one list;
  // other non-blank lines gather into paragraphs (blank lines end a paragraph);
  // a code-block marker on its own line is emitted as a standalone block.
  const lines = deblocked.split('\n')
  const parts: string[] = []
  let paragraph: string[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      // Lines inside one paragraph become hard breaks, preserving the old
      // renderer's line-by-line feel while allowing real paragraph breaks.
      parts.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`)
      paragraph = []
    }
  }
  const flushList = (): void => {
    if (listType !== null && listItems.length > 0) {
      const items = listItems.map((li) => `<li>${renderInline(li)}</li>`).join('')
      parts.push(`<${listType}>${items}</${listType}>`)
    }
    listType = null
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (BLOCK_LINE.test(trimmed)) {
      flushParagraph()
      flushList()
      parts.push(trimmed)
      continue
    }

    if (trimmed === '') {
      flushParagraph()
      flushList()
      continue
    }

    // Unordered marker needs whitespace after it, so `*italic*` (no space) is not
    // mistaken for a list item.
    const ul = /^[-*+]\s+(.+)$/.exec(trimmed)
    if (ul) {
      flushParagraph()
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(ul[1] ?? '')
      continue
    }

    const ol = /^\d+\.\s+(.+)$/.exec(trimmed)
    if (ol) {
      flushParagraph()
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(ol[1] ?? '')
      continue
    }

    // Plain text line: it ends any open list, then joins the current paragraph.
    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()

  // Step 4: drop the stashed code blocks back in.
  return parts.join('').replace(BLOCK_PLACEHOLDER, (_m, i: string) => blocks[Number(i)] ?? '')
}
