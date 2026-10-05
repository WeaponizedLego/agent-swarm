---
name: docs-as-static-html
description: Generate self-contained, terminal-retro static HTML documentation pages — single-file or multi-page, with a paper-light default plus a phosphor/amber/solarized theme picker, in-page fuzzy search (Cmd/K), Datatype variable font for inline charts, optional Mermaid diagrams, and browser-side syntax highlighting. Each output .html is fully self-contained (CSS + JS inlined, search index inlined; font, Fuse.js, Mermaid, and highlight.js loaded from CDNs at page open). Use this skill whenever the user asks for documentation, runbooks, README-style pages, internal wikis, API docs, knowledge base entries, release notes, design specs, project handoff docs, or any "static HTML doc" — including when they just say "make me a doc page for X", "write up [thing] as HTML", "I need a one-pager I can email", or hand you content and ask for a published-looking page. Prefer this skill over plain Markdown, over a Word .docx, or over inline chat output any time the deliverable is a standalone documentation artifact the user will save, share, or host.
---

# docs-as-static-html

Generate self-contained terminal-retro HTML documentation pages. Each output is a single `.html` file that works opened from disk, served from any static host, attached to an email, or dropped on a NAS. There is no build script — Claude composes the HTML directly using the design system in `assets/`.

The aesthetic is "`man` rendered to web": monospace-first, high-contrast, paper-and-ink by default — with phosphor green, amber CRT, and Solarized Light all one click away in a header picker, plus a system-auto option. ASCII flourishes like `▌` heading bars and `[ NOTE ]` / `[ WARN ]` / `[ DANGER ]` callout labels appear in whichever palette is active. Charts and sparklines are drawn by the Datatype font itself directly inside running text. Diagrams render client-side via Mermaid. Code blocks highlight client-side via highlight.js. In-page fuzzy search (Cmd/Ctrl-K) runs against an inline JSON index built at generation time — works offline, works under `file://`, and (for multi-page builds) searches across every page in the set.

## When to use this skill

Use this skill any time the deliverable is a **standalone documentation artifact** — something the user will save, share, host, or hand off. Strong signals:

- Words like _documentation, runbook, README, wiki page, knowledge base, API docs, design doc, handoff, release notes, postmortem, spec, one-pager_
- "Make me a doc / page / write-up for X"
- "Generate HTML docs for ..." or "build me a static page for ..."
- "I need a single file I can email / drop on S3 / put on my NAS / share"
- The user pastes content and asks for it "rendered nicely" or "as a page"

Do **not** use this skill for:

- Conversational answers, summaries, or analyses the user reads inline and doesn't save (use normal chat output)
- Word documents — when the user explicitly wants `.docx`, use the `docx` skill instead
- Slide decks — use `pptx`
- Spreadsheets — use `xlsx`
- Interactive web apps, dashboards, or React components (this skill is doc-focused — use a different skill for app UI)

## Workflow

The skill bundles three asset files and one HTML template. To generate a page, Claude:

1. Reads `assets/template.html`, `assets/styles.css`, `assets/runtime.js`.
2. Composes the body HTML for the page using the patterns below.
3. Substitutes placeholders in the template (a handful of string replacements).
4. Writes the result as a `.html` file and presents it.

No external tools required. See `references/content-patterns.md` for a longer walkthrough of how to shape good doc content for this format.

### Step 1: Decide page structure (single-page vs multi-page)

**Default to multi-page for real documentation.** A well-structured multi-page set with a nav-grid index is almost always better than a single long page — it's faster to navigate, easier to share individual sections, and feels more like a polished product.

- **Single-page** if: under ~1,500 words AND at most 3-4 top-level (`##`) sections AND the content reads as one continuous narrative (e.g., a short runbook, a one-pager, a quick reference card).
- **Multi-page** if: anything that could reasonably be split into named chapters — architecture docs, API references, onboarding guides, design specs, anything with 5+ top-level sections. Each chapter becomes its own `.html` file; the index page uses a `nav-grid` to link them all.

When in doubt, go multi-page. The nav-grid index plus cross-page search makes large sets easy to navigate.

### Step 2: Compose the body HTML

Use these patterns (full reference in `references/content-patterns.md`):

**Headings** — every `<h2>` and `<h3>` needs an `id` for TOC linking. Slugify normally:

```html
<h2 id="architecture">Architecture</h2>
<h3 id="components">Components</h3>
```

**Code blocks** — use `data-filename` for the header strip; the runtime wraps the `<pre>` in a `.code-block` div with a `.strip` header automatically:

```html
<pre><code class="language-python" data-filename="api.py">def hello():
    return "world"</code></pre>
```

**Callouts** — four variants: `note`, `tip`, `warn`, `danger`. The CSS prepends `[ NOTE ]` / `[ TIP ]` / `[ WARN ]` / `[ DANGER ]` labels in the appropriate accent colour, so just write the body:

```html
<div class="callout note">
  <p>Informational context the reader will appreciate.</p>
</div>

<div class="callout danger">
  <p>An operation that can lose data or cause downtime.</p>
</div>
```

**Datatype charts** — wrap chart expressions in `<span class="chart">` for the font to render them as inline visuals:

```html
<p>
  Memory pressure <span class="chart">{l:10,20,35,42,48,55,72,85}</span> has
  been climbing.
</p>
```

See `references/datatype-syntax.md` for the full expression reference.

**Mermaid diagrams** — wrap the source in a `.diagram.mermaid` div; Mermaid (loaded from CDN, see step 4) replaces it with rendered SVG:

```html
<div class="diagram mermaid">graph LR A --> B B --> C</div>
```

**Tables** — standard HTML tables. The CSS styles header rows in accent colour with uppercase headers and dashed row separators. Datatype charts in cells render beautifully.

**Navigation grid** — the index page of every multi-page set should use a `nav-grid` instead of a plain list. Two-column card grid; each card links to a chapter with a title and short description:

```html
<div class="nav-grid">
  <a href="architecture.html">
    <div class="nav-title">Architecture</div>
    <div class="nav-desc">System diagram, deployment model, data flow</div>
  </a>
  <a href="api.html">
    <div class="nav-title">API Reference</div>
    <div class="nav-desc">All endpoints, auth, request/response shapes</div>
  </a>
  <a href="development.html">
    <div class="nav-title">Development Guide</div>
    <div class="nav-desc">Local setup, testing, conventions</div>
  </a>
  <a href="operations.html">
    <div class="nav-title">Operations</div>
    <div class="nav-desc">Deployment, CI/CD, runbooks</div>
  </a>
</div>
```

The grid collapses to a single column on mobile. Always include this on the index page — it's the primary way users navigate the doc set.

**Keyboard keys** — `<kbd>Cmd</kbd>` + `<kbd>K</kbd>` for keyboard shortcuts.

### Step 3: Compose the structural pieces

These are HTML fragments that fill placeholders in the template.

**Title block** (`{{TITLE_BLOCK}}`):

```html
<section class="title-block">
  <h1>Screeps Private Server<span class="cursor"></span></h1>
  <p class="tagline">Self-hosted Screeps on a UGREEN NAS via Docker</p>
  <div class="meta">
    <span>v1.0</span>
    <span>2026-05-18</span>
    <span>by glen</span>
  </div>
</section>
```

The `<span class="cursor"></span>` is a blinking phosphor-green cursor at the end of the title. Always include it on h1.

**Table of contents** (`{{TOC_HTML}}`) — built from your h2/h3 ids:

```html
<nav class="toc" aria-label="On this page">
  <div class="toc-title">Contents</div>
  <ul>
    <li>
      <a href="#architecture">Architecture</a>
      <ul>
        <li><a href="#components">Components</a></li>
      </ul>
    </li>
    <li><a href="#operations">Operations</a></li>
  </ul>
</nav>
```

If the page is short (1-2 sections), the TOC adds noise — leave `{{TOC_HTML}}` empty.

**Man-page header bar** — three plain-text fields plus two interactive controls (search input, theme picker). Set `{{MANHEAD_LEFT}}` / `{{MANHEAD_MID}}` / `{{MANHEAD_RIGHT}}` as plain text. Convention is `SHORTNAME(N)` on left/right and a category on the middle:

```
{{MANHEAD_LEFT}}  → SCREEPS(7)
{{MANHEAD_MID}}   → OPERATIONS
{{MANHEAD_RIGHT}} → SCREEPS(7)
```

Pick the short name from the doc's brand: keep the brand if it's ≤10 chars; otherwise use initials of multi-word titles (e.g. "Screeps Private Server" → "SPS"). Section number is `man`-style: 1 (general), 5 (config files), 7 (operations/runbooks), 8 (admin).

The full manhead element should look like this (the runtime wires up `#doc-search` and `#doc-theme`):

```html
<div class="manhead">
  <span class="left">{{MANHEAD_LEFT}}</span>
  <span class="mid">{{MANHEAD_MID}}</span>
  <span class="controls">
    {{SEARCH_INPUT_HTML}}
    {{THEME_PICKER_HTML}}
    <span class="right">{{MANHEAD_RIGHT}}</span>
  </span>
</div>
```

**Search input** (`{{SEARCH_INPUT_HTML}}`) — include on every page unless the doc is a single-section one-pager where search adds no value:

```html
<span class="search">
  <input id="doc-search" type="search" placeholder="search… (⌘K)" autocomplete="off" spellcheck="false">
  <div id="doc-search-results" class="search-results" hidden></div>
</span>
```

If search is omitted, leave `{{SEARCH_INPUT_HTML}}` empty and do not include the search-index `<script>` or the Fuse.js CDN tag (see Step 3b and Step 4).

**Theme picker** (`{{THEME_PICKER_HTML}}`) — always include; native `<select>` keeps the footprint trivial:

```html
<select id="doc-theme" class="theme-picker" aria-label="Theme">
  <option value="paper">paper</option>
  <option value="solarized">solarized</option>
  <option value="phosphor">phosphor</option>
  <option value="amber">amber</option>
  <option value="auto">auto</option>
</select>
```

The runtime hydrates the selected option from `localStorage["doc-theme"]` on load and writes back on change.

**Pagenav** (`{{PAGENAV_HTML}}`) — only for multi-page builds. Each page gets a prev/index/next row:

```html
<nav class="pagenav">
  <a class="prev" href="encounters.html">Encounter Mechanics</a>
  <a class="home" href="index.html">index</a>
  <a class="next" href="loot.html">Loot Budget</a>
</nav>
```

For single-page builds, leave it empty.

### Step 3a: Inline the CSS

Read `assets/styles.css` verbatim and substitute it into `{{CSS}}`. The file contains all four palettes, all component styles, and the `nav-grid` and `pagenav` helpers. Do not copy-paste fragments — read and use the whole file.

Key design decisions already baked in (do not override them):

- **Sticky manhead** (`position:sticky; top:0; z-index:50`) — the header bar stays visible when scrolling.
- **`.wrap` container** — all body content sits inside a max-width `980px` centered div; the manhead sits outside it (full-width, sticky).
- **`scroll-margin-top:60px`** on `h2`/`h3` — anchors land below the sticky header, not behind it.
- **h2 gets `▌` in `--accent`, h3 gets `▌` in `--accent-dim`** — the hierarchy is visually distinct.
- **h4** is styled as an uppercase label in `--accent` (useful for sub-subsections and table captions).
- **`.code-block .strip`** — the runtime creates this header element; CSS styles it as the filename bar above the code.
- **`.docfoot`** — the footer class (not `.footer`).
- All CSS variables (`var(--bg)`, `var(--accent)`, etc.) — no hard-coded colours — so a single `data-theme` attribute flip restyles the whole page. Highlight.js token classes are also expressed in terms of these variables.

### Step 3b: Build and inline the search index

When the page has a search input, also inline a JSON index that maps every `<h2>`/`<h3>` with an `id` to its heading text and a snippet of its body. The runtime hands this to Fuse.js (or to a substring fallback if Fuse fails to load).

**Index shape** — one entry per heading:

```json
[
  {
    "p": "operations.html",
    "pt": "Operations",
    "i": "components",
    "h": "Components",
    "b": "first ~240 chars of plain text from this section, up to the next heading"
  }
]
```

- `p` — page filename. Empty string for single-page builds.
- `pt` — page title. Empty string for single-page builds.
- `i` — the heading's `id` (becomes the anchor).
- `h` — the heading's text content.
- `b` — concatenated plain text of every sibling node between this heading and the next heading of equal or higher level. Strip tags, collapse whitespace, trim to ~240 chars.

**Inline placement** — directly before the closing `</body>` (so the parser doesn't try to render the JSON):

```html
<script id="search-index" type="application/json">[{"p":"","pt":"","i":"architecture","h":"Architecture","b":"..."}]</script>
```

**Multi-page** — build the index **once** across all pages first, then embed the **same** full array into every page's `<script id="search-index">`. That way search on any page returns results from every page in the set, and no `fetch()` of a sibling JSON file is needed (which would break under `file://` in Chrome).

**Procedure** for assembling the index (Claude does this inline while composing the pages; no runnable script ships with the skill):

```
entries = []
for each page in pages:
    parse the page's body HTML
    for each <h2> or <h3> with an id:
        h = heading text
        b = concatenated plain text of nodes until the next heading of equal/higher level
        b = strip_tags(b); collapse_whitespace(b); b[:240]
        entries.append({p: page.filename, pt: page.title, i: id, h: h, b: b})
embed json.dumps(entries) into every page's <script id="search-index">
```

### Step 4: Decide which CDN scripts to include (`{{SCRIPTS}}`)

The template loads Datatype from Google Fonts unconditionally (it's how chart expressions render). Three more CDN scripts are optional, included only when needed:

**highlight.js** — include if the page has any `<pre><code>` blocks. The CSS already styles `.hljs-*` token classes; the script just applies them:

```html
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js"></script>
<script>
  hljs.highlightAll();
</script>
```

**Mermaid** — include if the page has any `<div class="diagram mermaid">` blocks. Picks `dark` or `default` theme to match the page's resolved palette at load time. The four theme keys map as: `phosphor` and `amber` → `dark`; `paper` and `solarized` → `default`; `auto` and unset → system preference:

```html
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  const t = document.documentElement.getAttribute('data-theme');
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = t === 'phosphor' || t === 'amber'
    || ((t === 'auto' || !t) && sysDark);
  mermaid.initialize({
    startOnLoad: true,
    theme: isDark ? 'dark' : 'default',
    themeVariables: { fontFamily: '"JetBrains Mono", monospace' },
    securityLevel: 'strict',
  });
</script>
```

**Fuse.js** — include if the page has a search input (`{{SEARCH_INPUT_HTML}}` is non-empty). The runtime wires the input to Fuse and renders the results panel; if this CDN fails to load, the runtime silently falls back to plain substring matching against the same inline index:

```html
<script src="https://cdn.jsdelivr.net/npm/fuse.js@7/dist/fuse.min.js"></script>
```

Concatenate the needed ones into `{{SCRIPTS}}` (with a blank line between each). Leave it empty if none apply.

#### What `{{JS}}` (the inline runtime) does

Read `assets/runtime.js` verbatim and substitute it into `{{JS}}`. The file is a self-contained IIFE. Its responsibilities:

1. **Pre-paint theme** — the template's `<head>` contains a one-liner that reads `localStorage["doc-theme"]` and sets `data-theme` immediately to prevent FOUC. The runtime then syncs the `<select>` value and wires the `change` handler to persist back and re-init Mermaid (stored as `window.__mermaid`) so diagrams recolour on theme switch.
2. **Code-block frame** — for every `<pre><code data-filename="...">`, wraps the parent `<pre>` in a `.code-block` div and prepends a `.strip` header element containing the filename. The CSS styles it as the filename bar.
3. **TOC scrollspy** — observes `<h2>`/`<h3>` via IntersectionObserver and toggles `.active` on the matching `.toc a` as the user scrolls.
4. **Search** — reads the inline `<script id="search-index">` JSON. If `window.Fuse` is loaded, uses fuzzy matching; otherwise falls back to substring filter. Renders up to 10 results into `#doc-search-results`; rows link to `${p}#${i}` (cross-page) or `#${i}` (same-page). Keyboard: `Cmd/Ctrl-K` focuses, `Esc` clears, arrow keys + `Enter` navigate results.

### Step 5: Assemble and save

Read the template and asset files, do the substitutions, write the result.

**OUTPUT LOCATION — this is a hard rule, not a default.**

All generated `.html` files go in a `docs/` directory:

- **Single-page**: `<project-root>/docs/<slug>.html`
- **Multi-page**: `<project-root>/docs/<slug>/index.html` plus sibling `<page>.html` files in that same subdirectory

`<project-root>` is the nearest ancestor of the current working directory that contains a `.git/`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or `pom.xml`. If none is found, use the current working directory. Create `docs/` if it doesn't exist. Don't write to `/tmp`, `~/Downloads`, the project root itself, or anywhere else — even if the user doesn't explicitly say "put it in `docs/`", that is still where it goes.

`<slug>` is a kebab-case version of the page title — letters and digits only, lowercased, joined by single hyphens. `Screeps Private Server` → `screeps-private-server`. For multi-page, the directory takes the slug of the overall doc set and each page file takes its own slug.

Quick shell snippet to find the project root:

```bash
root=$(git rev-parse --show-toplevel 2>/dev/null) || \
root=$(pwd)
mkdir -p "$root/docs"
```

Then write to `"$root/docs/<slug>.html"`.

For the substitution itself (any tool that does string replacement is fine — Python, sed, or just composing the entire HTML inline with `create_file`):

```python
from pathlib import Path

SKILL = Path("<wherever the skill lives>")
template = (SKILL / "assets/template.html").read_text()
css = (SKILL / "assets/styles.css").read_text()
js = (SKILL / "assets/runtime.js").read_text()

html = template
for placeholder, value in {
    "{{TITLE}}": "Screeps Private Server",
    "{{DESCRIPTION}}": "Self-hosted Screeps on a UGREEN NAS via Docker",
    "{{BRAND}}": "Screeps",
    "{{MANHEAD_LEFT}}": "SCREEPS(7)",
    "{{MANHEAD_MID}}": "OPERATIONS",
    "{{MANHEAD_RIGHT}}": "SCREEPS(7)",
    "{{SEARCH_INPUT_HTML}}": search_input_html,   # or "" to disable search
    "{{THEME_PICKER_HTML}}": theme_picker_html,
    "{{TITLE_BLOCK}}": title_block_html,
    "{{TOC_HTML}}": toc_html,
    "{{CONTENT}}": body_html + search_index_script,  # <script id="search-index">…</script>
    "{{PAGENAV_HTML}}": "",
    "{{FOOTER_LEFT}}": "docs-as-static-html",
    "{{FOOTER_RIGHT}}": "built 2026-05-18",
    "{{SCRIPTS}}": scripts_html,
    "{{CSS}}": css,
    "{{JS}}": js,
}.items():
    html = html.replace(placeholder, value)

# Always docs/ — never elsewhere.
import subprocess, os
root = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    capture_output=True, text=True
).stdout.strip() or os.getcwd()
out = Path(root) / "docs" / "screeps-private-server.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
```

If `docs/<slug>.html` already exists, overwrite it (the assumption is that the user is iterating on the same doc). If the user clearly means a _new_ doc with the same title, ask before clobbering.

### Step 6: Present

Tell the user where the file(s) were written (path relative to project root) so they can open them directly. For multi-page output, lead with the index page path.

## Worked examples

Two real examples live in `examples/`:

- **`examples/example_1_docs/ts-ooono-backend-support/`** — canonical multi-page set (index + 6 chapter pages). Read `index.html` for the nav-grid index pattern and `architecture.html` for a typical chapter page. This is the target quality for multi-page output.
- **`examples/example_2_docs/pantry-architecture.html`** — a dense single-page design doc. Good reference for TOC depth, Mermaid diagrams, tables, and callout usage.

Open these in a browser to see the design system in action; read their source to see the exact HTML patterns to follow.

## A note on browser-side dependencies

Four CDNs are involved in the live rendering:

| Resource      | CDN                                              | When loaded                |
| ------------- | ------------------------------------------------ | -------------------------- |
| Datatype font | Google Fonts (`fonts.googleapis.com`)            | Always                     |
| highlight.js  | jsDelivr (`cdn.jsdelivr.net/gh/highlightjs/...`) | Pages with code blocks     |
| Mermaid       | jsDelivr (`cdn.jsdelivr.net/npm/mermaid@11`)     | Pages with diagrams        |
| Fuse.js       | jsDelivr (`cdn.jsdelivr.net/npm/fuse.js@7`)      | Pages with a search input  |

If any CDN is unreachable, the page degrades gracefully:

- No Datatype → chart expressions appear as literal monospace text
- No highlight.js → code blocks render plain (still readable, just no colour)
- No Mermaid → diagram source displays as monospace inside the diagram container
- No Fuse.js → search input falls back to plain substring matching against the inline index (still works, just no fuzzy ranking)

The four themes (paper, solarized, phosphor, amber) and the search index are inlined into the HTML itself — no CDN dependency for either. Theme switching is instant; search works offline and under `file://`.

For pages that truly need offline rendering, the user can self-host the remaining assets (font + highlight.js + Mermaid + Fuse.js) and tweak the template — but for typical doc-on-the-web use, the CDN setup is what makes the skill setup-free.
