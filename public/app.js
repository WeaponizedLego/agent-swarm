import { Terminal } from '/vendor/xterm/lib/xterm.mjs'
import { FitAddon } from '/vendor/addon-fit/lib/addon-fit.mjs'

const $ = (id) => document.getElementById(id)
// Every string here goes in via textContent/properties, never innerHTML: session names, repo files and model output are untrusted.
const h = (tag, props = {}, ...kids) => {
  const el = Object.assign(document.createElement(tag), props)
  el.append(...kids.flat().filter((k) => k != null))
  return el
}

const els = {
  list: $('sessions'), count: $('count'), empty: $('empty'), meta: $('meta'), fields: $('meta-fields'),
  term: $('term'), overview: $('overview'), changes: $('changes'), tabs: $('tabs'), placeholder: $('placeholder'), status: $('status'),
  formSession: $('form-session'), skillList: $('skill-list'),
  formWs: $('form-workspace'), wsList: $('workspace-list'),
  stage: document.querySelector('.stage'),
  usage: $('usage'),
  laneList: $('lane-list'), laneForm: $('lane-form'), laneInput: $('lane-input'), laneEmpty: $('lane-empty'), laneFilter: $('lane-filter'),
}

let sessions = []
let workspaces = {}
let selected = null
let socket = null
let tab = 'term'

const say = (msg, isError = false) => {
  els.status.textContent = msg
  els.status.classList.toggle('error', isError)
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
  })
  if (res.status === 204) return null
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

// ---- session colours ----
// Every session gets its own hue: the lowest palette slot no live session holds. The choice is remembered in
// localStorage, so a reload or another session ending never repaints the rest.
const PALETTE = [20, 55, 90, 125, 165, 200, 235, 270, 305, 335].map((hue) => `oklch(0.78 0.13 ${hue})`)
let slots = {}
try {
  slots = JSON.parse(localStorage.getItem('swarm-colours') ?? '{}')
} catch {
  /* private mode or blocked storage: colours still work, they just reset on reload */
}

// Sessions that are gone (old lane history) fall back to a hue derived from the id.
const colourOf = (id) => PALETTE[slots[id] ?? [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PALETTE.length]

function assignColours() {
  const taken = new Set(sessions.map((s) => slots[s.id]))
  let changed = false
  for (const s of sessions) {
    if (slots[s.id] != null) continue
    const free = PALETTE.findIndex((_, i) => !taken.has(i))
    slots[s.id] = free < 0 ? sessions.length % PALETTE.length : free // more sessions than colours: reuse
    taken.add(slots[s.id])
    changed = true
  }
  if (changed) {
    try {
      localStorage.setItem('swarm-colours', JSON.stringify(slots))
    } catch {
      /* see above */
    }
  }
  return changed
}

// ---- terminal ----
const term = new Terminal({
  cursorBlink: true,
  fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace',
  fontSize: 13,
  // Same Tokyo Night palette as the page, so agent output that uses ANSI colours is readable too.
  theme: {
    background: '#16161e', foreground: '#c0caf5', cursor: '#c0caf5', selectionBackground: '#33467c',
    black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
    brightBlack: '#565f89', brightRed: '#ff899d', brightGreen: '#b9f27c', brightYellow: '#ffc777', brightBlue: '#9ab8ff', brightMagenta: '#d0b4ff', brightCyan: '#a4daff', brightWhite: '#c0caf5',
  },
})
const fit = new FitAddon()
term.loadAddon(fit)
term.open(els.term)

const send = (msg) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg))
term.onData((d) => send({ t: 'i', d }))
term.onResize(({ cols, rows }) => send({ t: 'r', cols, rows }))
new ResizeObserver(() => selected && tab === 'term' && fit.fit()).observe(els.term)

function attach(id) {
  socket?.close()
  term.reset()
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${proto}://${location.host}/ws/sessions/${id}`)
  socket.onopen = () => {
    fit.fit()
    send({ t: 'r', cols: term.cols, rows: term.rows })
    if (tab === 'term') term.focus()
  }
  socket.onmessage = (e) => term.write(e.data)
  socket.onclose = () => say(`DETACHED FROM ${id}`)
}

// ---- tabs ----
const TABS = ['term', 'overview', 'changes']
function setTab(next) {
  tab = next
  for (const name of TABS) {
    $(`tab-${name}`).setAttribute('aria-selected', String(name === next))
    els[name].hidden = name !== next
  }
  if (next === 'term') requestAnimationFrame(() => (fit.fit(), term.focus()))
  else if (next === 'overview') loadOverview()
  else loadChanges()
}
for (const name of TABS) $(`tab-${name}`).onclick = () => setTab(name)
// Arrow keys move between tabs, as the tab pattern expects.
els.tabs.onkeydown = (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const next = TABS[(TABS.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
  setTab(next)
  $(`tab-${next}`).focus()
}

// ---- sessions ----
function select(id) {
  selected = id
  showView(null) // picking a session means you want its terminal, not whatever view was open
  els.placeholder.hidden = true
  attach(id)
  if (tab === 'overview') loadOverview()
  if (tab === 'changes') loadChanges()
  render()
  renderLane()
}

function render() {
  els.count.textContent = String(sessions.length).padStart(2, '0')
  els.empty.hidden = sessions.length > 0
  els.list.replaceChildren(
    ...sessions.map((s) => {
      const state = h('span', { className: 'state', textContent: s.state })
      state.dataset.state = s.state
      const btn = h(
        'button',
        { type: 'button', onclick: () => select(s.id) },
        h('span', { className: 'task', textContent: s.task }),
        h('span', { className: 'sub', textContent: `${s.agent} / ${s.workspace} / ${s.repos.length} repo${s.repos.length === 1 ? '' : 's'}` }),
        state,
      )
      btn.setAttribute('aria-current', String(s.id === selected))
      btn.style.setProperty('--c', colourOf(s.id))
      return h('li', {}, btn)
    }),
  )

  const current = sessions.find((s) => s.id === selected)
  els.meta.hidden = !current
  els.tabs.hidden = !current
  if (current) els.stage.style.setProperty('--c', colourOf(current.id))
  else els.stage.style.removeProperty('--c')
  if (current) {
    els.fields.replaceChildren(
      ...[['DIR', current.dir], ['BRANCH', current.repos[0]?.branch ?? ''], ['SESSION', current.handle], ['SKILLS', current.skills.join(', ') || 'none']].flatMap(([k, v]) => [
        h('dt', { textContent: k }),
        h('dd', { textContent: v }),
      ]),
    )
  }
}

async function refresh() {
  try {
    sessions = await api('/api/sessions')
    if (selected && !sessions.some((s) => s.id === selected)) {
      selected = null
      socket?.close()
      term.reset()
      els.placeholder.hidden = false
      els.overview.replaceChildren()
      els.changes.replaceChildren()
      setTab('term')
    }
    const recoloured = assignColours()
    render()
    if (recoloured) renderLane() // lane lines drawn before their session was known used a fallback colour
  } catch (err) {
    say(err.message, true)
  }
}

async function stop(cleanup) {
  const s = sessions.find((x) => x.id === selected)
  if (!s) return
  const what = cleanup ? 'Stop and remove all worktrees (refused if there are uncommitted changes)?' : 'Stop this session? Worktrees and branches are kept.'
  if (!confirm(what)) return
  try {
    await api(`/api/sessions/${s.id}?cleanup=${cleanup}`, { method: 'DELETE' })
    say(`STOPPED ${s.task}`)
    await refresh()
  } catch (err) {
    say(err.message, true)
  }
}

$('stop').onclick = () => stop(false)
$('stop-clean').onclick = () => stop(true)

// ---- overview ----
let overviewData = []
const results = new Map() // `${sessionId}/${repo}` -> last action result
const busy = new Set()

async function loadOverview() {
  const sid = selected
  if (!sid) return
  try {
    const data = await api(`/api/sessions/${sid}/overview`)
    if (sid !== selected) return // user switched sessions while this was loading
    overviewData = data
    renderOverview()
  } catch (err) {
    say(err.message, true)
  }
}

async function runAction(repo, action) {
  const sid = selected
  const label = action.kind === 'script' ? `${repo.pm} run ${action.script}` : `${repo.pm} ${action.kind}`
  // outdated and audit only read; install and scripts run the repo's own code, so ask first.
  if ((action.kind === 'install' || action.kind === 'script') && !confirm(`Run "${label}" in ${repo.name}?\nThis executes the repo's own scripts.`)) return
  const key = `${sid}/${repo.name}`
  busy.add(key)
  results.set(key, { command: label, pending: true })
  renderOverview()
  try {
    results.set(key, await api(`/api/sessions/${sid}/repos/${encodeURIComponent(repo.name)}/actions`, { method: 'POST', body: JSON.stringify(action) }))
  } catch (err) {
    results.set(key, { command: label, error: err.message })
  }
  busy.delete(key)
  if (sid === selected) await loadOverview()
}

function repoCard(r) {
  const key = `${selected}/${r.name}`
  const isBusy = busy.has(key)
  const result = results.get(key)
  const btn = (text, action) =>
    h('button', { type: 'button', className: 'btn small', disabled: isBusy, textContent: `[ ${text} ]`, onclick: () => runAction(r, action) })

  const facts = h(
    'div',
    { className: 'facts' },
    h('span', {}, 'BRANCH ', h('b', { textContent: r.branch })),
    h('span', {}, 'PM ', h('b', { textContent: r.pm ?? 'NONE' })),
    h('span', { className: r.dirty ? 'dirty' : '' }, r.dirty ? `${r.dirty} UNCOMMITTED` : 'CLEAN'),
    h('span', { textContent: r.lastCommit, style: 'text-transform:none' }),
  )

  const sections = []
  if (r.node && r.pm) {
    const n = r.node
    sections.push(
      h(
        'section',
        {},
        h('h4', { textContent: `>>> ACTIONS${n.nodeModules ? '' : ' // NODE_MODULES MISSING, INSTALL FIRST'}` }),
        h('div', { className: 'row' }, btn('INSTALL', { kind: 'install' }), btn('OUTDATED', { kind: 'outdated' }), btn('AUDIT', { kind: 'audit' })),
        Object.keys(n.scripts).length
          ? h('div', { className: 'row' }, ...Object.keys(n.scripts).map((name) => btn(`RUN ${name}`, { kind: 'script', script: name })))
          : null,
      ),
    )
  }
  if (result) {
    const head = result.pending
      ? `$ ${result.command} // RUNNING...`
      : result.error
        ? `$ ${result.command} // ERROR: ${result.error}`
        : `$ ${result.command} // EXIT ${result.timedOut ? 'TIMEOUT' : result.code}`
    sections.push(
      h(
        'section',
        {},
        h('div', { className: `output-head${result.error || result.code ? ' fail' : ''}` }, h('span', { className: result.error || result.code ? 'fail' : '', textContent: head })),
        result.output ? h('pre', { className: 'output', textContent: result.output }) : null,
      ),
    )
  }
  if (r.node) {
    const n = r.node
    const engines = Object.entries(n.engines).map(([k, v]) => `${k} ${v}`)
    sections.push(
      h(
        'section',
        {},
        h('h4', { textContent: `>>> PACKAGE ${n.name ?? ''} ${n.version ?? ''}${engines.length ? ` // ENGINES ${engines.join(', ')}` : ''}` }),
        n.deps.length
          ? h(
              'div',
              { className: 'deps-scroll' },
              h(
                'table',
                { className: 'deps' },
                h('thead', {}, h('tr', {}, h('th', { textContent: 'NAME' }), h('th', { textContent: 'WANTED' }), h('th', { textContent: 'INSTALLED' }))),
                h(
                  'tbody',
                  {},
                  ...n.deps.map((d) =>
                    h(
                      'tr',
                      {},
                      h('td', { textContent: d.dev ? `${d.name} (dev)` : d.name }),
                      h('td', { textContent: d.range }),
                      h('td', { className: d.installed || !n.nodeModules ? '' : 'missing', textContent: d.installed ?? (n.nodeModules ? 'MISSING' : '-') }),
                    ),
                  ),
                ),
              ),
            )
          : h('span', { className: 'dim', textContent: 'NO DEPENDENCIES DECLARED' }),
      ),
    )
  }
  if (r.otherManifests.length) {
    sections.push(h('section', {}, h('h4', { textContent: '>>> OTHER MANIFESTS' }), h('div', { className: 'row' }, ...r.otherManifests.map((m) => h('span', { className: 'chip', textContent: m })))))
  }
  sections.push(
    h(
      'section',
      {},
      h('h4', { textContent: '>>> AGENT CONFIG' }),
      h(
        'div',
        { className: 'row' },
        ...(r.agentFiles.length || r.skills.length
          ? [...r.agentFiles.map((f) => h('span', { className: 'chip', textContent: f })), ...r.skills.map((s) => h('span', { className: 'chip', textContent: `skill: ${s}` }))]
          : [h('span', { className: 'dim', textContent: 'NONE FOUND' })]),
      ),
    ),
  )
  return h('article', { className: 'repo' }, h('header', {}, h('h3', { textContent: r.name }), facts), ...sections)
}

function renderOverview() {
  els.overview.replaceChildren(...overviewData.map(repoCard))
}

// ---- changes: the change-map skill's story of what this session did, drawn with the overview's own parts ----
let changesData = null

async function loadChanges() {
  const sid = selected
  if (!sid) return
  try {
    const data = await api(`/api/sessions/${sid}/changes`)
    if (sid !== selected) return
    changesData = data
    renderChanges()
  } catch (err) {
    els.changes.replaceChildren(h('p', { className: 'dim pad', textContent: `CANNOT READ THE CHANGE MAP: ${err.message}` }))
  }
}

// Kind of change -> glyph, label, colour. Glyphs instead of icons: this page is a terminal.
const KINDS = {
  feature: ['+', 'NEW', 'green'], fix: ['!', 'FIX', 'red'], refactor: ['~', 'REFACTOR', 'accent'], removal: ['-', 'REMOVED', 'dim'],
  test: ['?', 'TESTS', 'label'], config: ['*', 'CONFIG', 'amber'], deps: ['#', 'DEPS', 'amber'], docs: ['=', 'DOCS', 'dim'],
  style: ['%', 'STYLE', 'label'], security: ['$', 'SECURITY', 'red'], perf: ['>', 'PERF', 'green'], chore: ['.', 'CHORE', 'dim'],
}
const FILE_STATUS = { A: ['ADDED', 'green'], M: ['MODIFIED', 'amber'], T: ['MODIFIED', 'amber'], D: ['DELETED', 'red'], R: ['RENAMED', 'accent'], C: ['COPIED', 'accent'] }
const RISK = { low: 'green', medium: 'amber', high: 'red' }
const tint = (el, colour) => (el.style.setProperty('--k', `var(--${colour})`), el)
// `backticks` in the agent's prose become <code>; everything stays text.
const prose = (tag, text, props = {}) => h(tag, props, ...String(text).split('`').map((part, i) => (i % 2 ? h('code', { textContent: part }) : part)))
const label = (text) => h('h4', { textContent: `>>> ${text}` })
const section = (title, ...kids) => h('section', {}, label(title), ...kids)

function askForMap() {
  // Typed and submitted separately: sent in one chunk the Enter can land inside a paste and never submit.
  send({ t: 'i', d: 'Use the change-map skill to map what this session has changed so far.' })
  setTimeout(() => send({ t: 'i', d: '\r' }), 150)
  setTab('term')
  say('ASKED THE AGENT FOR A CHANGE MAP. RELOAD THE TAB WHEN IT IS DONE.')
}

function changesActions() {
  const s = sessions.find((x) => x.id === selected)
  const canAsk = s?.skills.includes('change-map') && s.state !== 'exited'
  return h(
    'div',
    { className: 'row' },
    h('button', { type: 'button', className: 'btn small', textContent: '[ RELOAD ]', onclick: loadChanges }),
    canAsk
      ? h('button', { type: 'button', className: 'btn small', textContent: changesData?.facts ? '[ ASK FOR A FRESH MAP ]' : '[ ASK THE AGENT FOR A MAP ]', onclick: askForMap })
      : h('span', { className: 'dim', textContent: s?.skills.includes('change-map') ? 'SESSION HAS EXITED' : 'LAUNCH WITH THE CHANGE-MAP SKILL TICKED TO GET A MAP' }),
  )
}

function renderChanges() {
  const { facts, story, coverage } = changesData ?? {}
  if (!facts) {
    els.changes.replaceChildren(
      h('article', { className: 'repo' }, h('header', {}, h('h3', { textContent: 'NO CHANGE MAP YET' })),
        h('section', {}, h('p', { className: 'cm-text', textContent: 'The agent writes one with the change-map skill: what changed, why, where to look first, with the diff underneath.' }), changesActions())),
    )
    return
  }

  const multi = facts.repos.length > 1
  const files = facts.repos.flatMap((r) => r.files.map((f) => ({ ...f, repo: r.name, key: multi ? `${r.name}/${f.path}` : f.path })))
  files.forEach((f, i) => (f.id = `cm-f${i}`))
  const byKey = new Map(files.map((f) => [f.key, f]))
  const unexplained = new Set(coverage?.unexplained ?? [])
  const add = files.reduce((n, f) => n + f.add, 0)
  const del = files.reduce((n, f) => n + f.del, 0)
  const commits = facts.repos.flatMap((r) => r.commits.map((c) => ({ ...c, repo: r.name })))

  const openDiff = (f) => {
    const d = $(f.id)
    d.open = true
    d.scrollIntoView({ block: 'start' })
  }
  const fileChip = (f) => {
    const [word, colour] = FILE_STATUS[f.status] ?? [f.status, 'dim']
    return tint(h('button', { type: 'button', className: 'chip cm-file', title: `${word}, open its diff`, onclick: () => openDiff(f) },
      h('span', { className: 'cm-k', textContent: f.status }), ` ${f.key} `, h('b', { className: 'cm-add', textContent: `+${f.add}` }), ' ', h('b', { className: 'cm-del', textContent: `-${f.del}` })), colour)
  }

  const head = h(
    'header', {},
    h('h3', { textContent: story?.title || 'WHAT CHANGED' }),
    h('div', { className: 'facts' },
      h('span', { textContent: `${files.length} FILE${files.length === 1 ? '' : 'S'}` }),
      h('span', {}, h('b', { textContent: `+${add}` }), ' ', h('span', { className: 'dirty', textContent: `-${del}` })),
      h('span', { textContent: `${commits.length} COMMIT${commits.length === 1 ? '' : 'S'}` }),
      h('span', { textContent: `MAPPED ${hhmm(facts.generatedAt)}` }),
    ),
  )

  const sections = []
  sections.push(h('section', {},
    story?.tldr ? prose('p', story.tldr, { className: 'cm-text cm-tldr' }) : h('p', { className: 'dim', textContent: 'THE AGENT HAS COLLECTED THE FACTS BUT NOT WRITTEN THE STORY YET.' }),
    h('p', { className: 'dim cm-base', textContent: facts.repos.map((r) => `${r.name} ${r.branch} vs ${r.base.slice(0, 8)} (${r.how})`).join(' / ') }),
    changesActions(),
  ))

  if (coverage && (coverage.unexplained.length || coverage.phantom.length)) {
    sections.push(h('section', { className: 'cm-warn' }, label('THE STORY AND THE DIFF DISAGREE'),
      coverage.unexplained.length ? h('p', { className: 'warn', textContent: 'CHANGED, BUT NO CARD EXPLAINS IT:' }) : null,
      coverage.unexplained.length ? h('div', { className: 'row' }, ...coverage.unexplained.map((k) => fileChip(byKey.get(k)))) : null,
      coverage.phantom.length ? h('p', { className: 'warn', textContent: `NAMED IN THE STORY, BUT NOT CHANGED: ${coverage.phantom.join(', ')}` }) : null,
    ))
  }

  if (story?.hotspots.length) {
    sections.push(section('LOOK HERE FIRST', h('ol', { className: 'cm-hot' }, ...story.hotspots.map((s) => {
      const f = byKey.get(s.file)
      const where = s.file + (s.line ? `:${s.line}` : '')
      return h('li', {}, f ? h('button', { type: 'button', className: 'chip', textContent: where, onclick: () => openDiff(f) }) : h('span', { className: 'chip', textContent: where }), ' ', prose('span', s.why, { className: 'cm-text' }))
    }))))
  }

  if (story?.diagrams.length) {
    sections.push(section('HOW IT CONNECTS',
      ...story.diagrams.map((d) => h('figure', { className: 'cm-fig' },
        h('figcaption', {}, h('b', { textContent: d.title }), d.caption ? prose('span', ` ${d.caption}`, { className: 'dim' }) : null),
        h('pre', { className: 'cm-mermaid', textContent: d.mermaid }))),
      h('div', { className: 'row cm-legend' }, ...[['NEW', 'green'], ['CHANGED', 'amber'], ['REMOVED', 'red'], ['UNTOUCHED', 'line']].map(([t, c]) => tint(h('span', { textContent: t }), c))),
    ))
  }

  if (story?.changes.length) {
    sections.push(section(`CHANGES (${story.changes.length})`, h('div', { className: 'cm-cards' }, ...story.changes.map((c) => {
      const [glyph, word, colour] = KINDS[c.kind] ?? ['.', c.kind.toUpperCase(), 'dim']
      const fs = c.files.map((k) => byKey.get(k)).filter(Boolean)
      const syms = fs.flatMap((f) => [...f.symbols.added.map((n) => `+${n}`), ...f.symbols.removed.map((n) => `-${n}`), ...f.symbols.changed.map((n) => `~${n}`)])
      return tint(h('article', { className: 'cm-card' },
        h('div', { className: 'cm-tag' }, h('span', { textContent: `[${glyph}] ${word}` }), c.risk ? tint(h('span', { className: 'cm-risk', textContent: `${c.risk} risk` }), RISK[c.risk]) : null),
        h('h5', { textContent: c.title }),
        c.what ? prose('p', c.what, { className: 'cm-text' }) : null,
        c.why ? h('p', { className: 'cm-text' }, h('span', { className: 'dim', textContent: 'WHY ' }), prose('span', c.why)) : null,
        c.before || c.after ? h('div', { className: 'cm-ba' }, prose('div', c.before || '(nothing)'), h('span', { className: 'dim', textContent: '->' }), prose('div', c.after || '(gone)')) : null,
        fs.length ? h('div', { className: 'row' }, ...fs.map(fileChip)) : null,
        syms.length ? h('div', { className: 'cm-syms dim', textContent: [...new Set(syms)].slice(0, 16).join('  ') }) : null,
      ), colour)
    }))))
  }

  // One tile per changed file, grouped by folder; width follows how much changed (square root, so small edits stay visible).
  const peak = Math.sqrt(Math.max(1, ...files.map((f) => f.add + f.del)))
  const groups = new Map()
  for (const f of files) {
    const dir = (multi ? `${f.repo}/` : '') + (f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/') + 1) : '')
    groups.set(dir || '/', [...(groups.get(dir || '/') ?? []), f])
  }
  sections.push(section('WHERE THE EDITS LANDED',
    h('div', { className: 'cm-mosaic' }, ...[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([dir, fs]) => h('div', { className: 'cm-row' },
      h('span', { className: 'dim cm-dir', textContent: dir }),
      h('div', { className: 'cm-tiles' }, ...fs.map((f) => {
        const [word, colour] = FILE_STATUS[f.status] ?? [f.status, 'dim']
        const tile = tint(h('button', { type: 'button', className: `cm-tile${unexplained.has(f.key) ? ' lost' : ''}`, title: `${f.path}  ${word}  +${f.add} -${f.del}`, textContent: f.path.split('/').pop(), onclick: () => openDiff(f) }), colour)
        tile.style.width = `${((Math.sqrt(f.add + f.del) / peak) * 100).toFixed(1)}%`
        return tile
      }))))),
    h('div', { className: 'row cm-legend' }, ...[['ADDED', 'green'], ['MODIFIED', 'amber'], ['DELETED', 'red'], ['RENAMED', 'accent']].map(([t, c]) => tint(h('span', { textContent: t }), c)), h('span', { className: 'dim', textContent: 'WIDTH = LINES CHANGED' })),
  ))

  if (story?.verify.length) {
    sections.push(section('CHECK IT', ...story.verify.map((v) => h('label', { className: 'cm-check' }, h('input', { type: 'checkbox' }), prose('span', v, { className: 'cm-text' })))))
  }
  if (commits.length) {
    sections.push(section('COMMITS', ...commits.map((c) => h('div', { className: 'cm-text' }, h('span', { className: 'dim', textContent: `${c.sha} ` }), c.subject, multi ? h('span', { className: 'dim', textContent: ` ${c.repo}` }) : null))))
  }
  sections.push(section('RAW DIFF', ...files.map((f) => h('details', { className: 'cm-diff', id: f.id },
    h('summary', {}, fileChip(f), f.from ? h('span', { className: 'dim', textContent: ` FROM ${f.from}` }) : null),
    f.binary ? h('p', { className: 'dim', textContent: 'BINARY FILE' }) : h('pre', { className: 'output' },
      ...f.patch.map((l) => h('span', { className: l[0] === '+' ? 'cm-add' : l[0] === '-' ? 'cm-del' : l.startsWith('@@') ? 'cm-hunk' : '', textContent: `${l}\n` })),
      f.truncated ? h('span', { className: 'dim', textContent: '... CUT HERE; GIT DIFF HAS THE REST' }) : null),
  ))))

  els.changes.replaceChildren(h('article', { className: 'repo' }, head, ...sections))
  drawDiagrams()
}

// Mermaid is big, so it loads the first time a map has a diagram. Its colours come from this page's own tokens.
let mermaidReady = null
async function drawDiagrams() {
  const nodes = [...els.changes.querySelectorAll('.cm-mermaid')]
  if (!nodes.length) return
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()
  mermaidReady ??= import('/vendor-mermaid/mermaid.esm.min.mjs').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base',
      themeVariables: {
        darkMode: true, fontFamily: css('--mono'), fontSize: '12px', background: css('--bg'),
        primaryColor: css('--panel'), primaryTextColor: css('--fg'), primaryBorderColor: css('--line'),
        lineColor: css('--dim'), secondaryColor: css('--raised'), tertiaryColor: css('--bg'),
        edgeLabelBackground: css('--bg'), clusterBkg: css('--panel'), clusterBorder: css('--line'),
        actorBkg: css('--panel'), actorBorder: css('--line'), actorTextColor: css('--fg'), signalColor: css('--dim'), signalTextColor: css('--fg'), noteBkgColor: css('--raised'), noteTextColor: css('--fg'),
      },
      flowchart: { curve: 'linear' },
    })
    return m
  })
  const classes = [['added', '--green', ''], ['changed', '--amber', ''], ['removed', '--red', ',stroke-dasharray:4 3'], ['ctx', '--line', '']]
    .map(([name, v, extra]) => `classDef ${name} fill:${css('--panel')},stroke:${css(v)},color:${name === 'ctx' ? css('--dim') : css(v)}${extra}`).join('\n')
  for (const n of nodes) if (/^\s*(flowchart|graph)\b/.test(n.textContent)) n.textContent += `\n${classes}`
  try {
    await (await mermaidReady).run({ nodes })
  } catch (err) {
    say(`A DIAGRAM DID NOT DRAW: ${err.message}`, true) // the source stays on screen as text
  }
}

// ---- chat lane ----
let lane = []
let laneAfter = 0
let onlySelected = false

const hhmm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// Who a message is from: sessions speak as themselves, the house keeper and you as one voice each.
const author = (m) => (m.kind === 'house' ? 'house' : m.kind === 'user' ? 'you' : m.sessionId)
const who = (m) => (m.kind === 'house' ? 'HOUSE KEEPER (haiku)' : m.kind === 'user' ? 'YOU' : `${m.task} (${m.agent})`)
const letter = (m) => (m.kind === 'house' ? 'H' : m.kind === 'user' ? 'Y' : m.agent[0].toUpperCase())
// The filter keeps the selected session's lines plus the conversation with the house keeper.
const inFilter = (m) => m.sessionId === selected || m.kind === 'user' || (m.kind === 'house' && m.sessionId === 'house')
const isAlert = (m) => m.text.startsWith('needs you:') || m.text.startsWith('heads up:') || m.kind === 'system'

function renderLane() {
  const shown = onlySelected ? lane.filter(inFilter) : lane
  els.laneEmpty.hidden = shown.length > 0
  // newest first: a reader scrolled down into history keeps their place as new lines land on top
  const fromBottom = els.laneList.scrollHeight - els.laneList.scrollTop
  const atTop = els.laneList.scrollTop < 40
  let prev = null
  els.laneList.replaceChildren(
    ...shown.toReversed().map((m) => {
      const sameAsPrev = prev && author(prev) === author(m) && new Date(prev.ts) - new Date(m.ts) < 5 * 60_000
      prev = m
      const alert = isAlert(m)
      const li = h('li', { className: `msg ${m.kind}${sameAsPrev ? '' : ' head'}` })
      if (m.kind !== 'house' && m.kind !== 'user') li.style.setProperty('--c', colourOf(m.sessionId)) // house and you stay neutral
      if (!sameAsPrev) {
        const opens = m.kind !== 'house' && m.kind !== 'user' && sessions.some((s) => s.id === m.sessionId)
        const avatar = h('button', { type: 'button', className: 'avatar', textContent: letter(m), tabIndex: opens ? 0 : -1, onclick: () => opens && select(m.sessionId) })
        if (opens) avatar.title = avatar.ariaLabel = `Open session ${m.task}`
        else avatar.disabled = true
        li.append(avatar, h('div', {}, h('span', { className: 'who', textContent: who(m) }), h('time', { className: 'when', dateTime: m.ts, textContent: hhmm(m.ts) })))
      }
      li.append(h('div', { className: `text${alert ? ' alert' : ''}`, textContent: m.text }))
      return li
    }),
  )
  els.laneList.scrollTop = atTop ? 0 : els.laneList.scrollHeight - fromBottom
}

async function pollLane() {
  try {
    const fresh = await api(`/api/lane?after=${laneAfter}`)
    if (fresh.length) {
      if (fresh.some((m) => m.kind === 'house') && els.status.textContent.startsWith('ASKING')) say('READY')
      if (laneAfter) fresh.filter(isAlert).forEach(notify) // the first poll is history, not news
      lane = [...lane, ...fresh].slice(-500)
      laneAfter = fresh.at(-1).id
      renderLane()
    }
  } catch {
    /* the sessions poll already surfaces connection errors */
  }
}

// ---- desktop alerts ----
// The browser's own notifications: no native helper per OS, and a localhost page is allowed to ask.
// The browser remembers the permission; the mute switch is ours, so it lives in localStorage.
const supportsAlerts = 'Notification' in window
let alertsMuted = (() => {
  try {
    return localStorage.getItem('alerts') === 'off'
  } catch {
    return false
  }
})()
const alertsOn = () => supportsAlerts && Notification.permission === 'granted' && !alertsMuted

function renderAlertsButton() {
  const btn = $('notify')
  btn.hidden = !supportsAlerts
  if (!supportsAlerts) return
  const denied = Notification.permission === 'denied'
  btn.textContent = denied ? '[ ALERTS: BLOCKED ]' : alertsOn() ? '[ ALERTS: ON ]' : '[ ALERTS: OFF ]'
  btn.title = denied ? 'Notifications are blocked for this page. Allow them in the browser site settings.' : 'Desktop notification when a session needs you'
  btn.setAttribute('aria-pressed', String(alertsOn()))
}

$('notify').onclick = async () => {
  // First click asks (it must run from a click); after that the button mutes and unmutes.
  if (Notification.permission === 'default') alertsMuted = (await Notification.requestPermission()) !== 'granted'
  else alertsMuted = !alertsMuted
  try {
    localStorage.setItem('alerts', alertsMuted ? 'off' : 'on')
  } catch {
    /* private window: the switch just does not survive a reload */
  }
  renderAlertsButton()
}

function notify(m) {
  if (!alertsOn() || (document.hasFocus() && !document.hidden)) return // you are already looking at the lane
  const opens = sessions.some((s) => s.id === m.sessionId)
  // One tag per session, so a repeat alert replaces the old one instead of stacking.
  const n = new Notification(m.kind === 'house' && !opens ? 'House keeper' : m.task, { body: m.text, tag: m.sessionId })
  n.onclick = () => {
    window.focus()
    if (opens) select(m.sessionId)
    n.close()
  }
}

renderAlertsButton()

els.laneForm.onsubmit = async (e) => {
  e.preventDefault()
  const text = els.laneInput.value.trim()
  if (!text) return
  els.laneInput.value = ''
  say('ASKING THE HOUSE KEEPER...')
  try {
    await api('/api/lane', { method: 'POST', body: JSON.stringify({ text }) })
    await pollLane()
  } catch (err) {
    say(err.message, true)
  }
}

els.laneFilter.onclick = () => {
  onlySelected = !onlySelected
  els.laneFilter.textContent = onlySelected ? '[ THIS SESSION ]' : '[ ALL ]'
  els.laneFilter.setAttribute('aria-pressed', String(onlySelected))
  renderLane()
}

// ---- plan usage ----
const level = (percent) => (percent >= 90 ? 'hot' : percent >= 70 ? 'warn' : 'ok')

function resetsIn(iso) {
  const mins = Math.max(0, Math.round((new Date(iso) - Date.now()) / 60_000))
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins % 60}m` : `${mins}m`
}

function meterEl(agent, m) {
  const percent = Math.min(100, Math.round(m.percent))
  const tip = [`${percent}% used`, `${100 - percent}% left`, m.detail, m.resetsAt && `resets in ${resetsIn(m.resetsAt)}`].filter(Boolean).join(', ')
  const el = h('span', { className: 'meter', title: tip }, m.name, h('span', { className: 'track' }, h('span', { className: 'fill', style: `width:${percent}%` })), `${percent}%${m.detail ? ` (${m.detail})` : ''}`)
  el.dataset.level = level(percent)
  // A meter's children are presentational, so the label has to carry the whole reading.
  el.setAttribute('role', 'meter')
  el.setAttribute('aria-label', `${agent} ${m.name}: ${tip}`)
  el.setAttribute('aria-valuemin', '0')
  el.setAttribute('aria-valuemax', '100')
  el.setAttribute('aria-valuenow', String(percent))
  return el
}

async function refreshUsage() {
  try {
    const usage = await api('/api/usage')
    els.usage.replaceChildren(
      ...usage.map((u) => h('span', { className: 'usage-agent' }, h('b', { textContent: u.agent }), ...(u.error ? [h('span', { className: 'dim', textContent: u.error })] : u.meters.map((m) => meterEl(u.agent, m))))),
    )
  } catch {
    /* the sessions poll already surfaces connection errors */
  }
}

// ---- views: new session, workspaces and skills each cover the stage; one at a time ----
const views = {
  session: [$('session-view'), $('new-session')],
  workspaces: [$('workspaces-view'), $('open-workspaces')],
  skills: [$('skills-view'), $('open-skills')],
}
let openView = null

function showView(name) {
  openView = name
  for (const [key, [view, btn]] of Object.entries(views)) {
    view.hidden = key !== name
    btn.setAttribute('aria-pressed', String(key === name))
  }
}
function closeView() {
  const was = openView
  showView(null)
  if (was) views[was][1].focus()
}
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeView))
els.stage.addEventListener('keydown', (e) => e.key === 'Escape' && openView && closeView())

// ---- new session ----
$('new-session').onclick = async () => {
  if (openView === 'session') return closeView()
  workspaces = await api('/api/workspaces')
  const names = Object.keys(workspaces)
  if (!names.length) {
    say('CREATE A WORKSPACE FIRST', true)
    return openWorkspaces()
  }
  els.formSession.workspace.replaceChildren(...names.map((n) => new Option(`${n} (${workspaces[n].length})`, n)))
  const { skills } = await api('/api/skills')
  els.skillList.replaceChildren(
    ...(skills.length
      ? skills.map((s) =>
          h('label', { className: 'skill', title: s.description },
            h('input', { type: 'checkbox', name: 'skill', value: s.name, checked: s.enabled }),
            h('span', {}, h('b', { textContent: s.name }), h('span', { className: 'dim', textContent: s.description })),
          ),
        )
      : [h('p', { className: 'dim', textContent: 'NO SKILLS FOUND. ADD FOLDERS WITH A SKILL.md TO THE SKILLS DIR (SWARM_SKILLS).' })]),
  )
  showView('session')
  els.formSession.task.focus()
}

els.formSession.onsubmit = async (e) => {
  e.preventDefault()
  const f = els.formSession
  say('LAUNCHING...')
  try {
    const s = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        workspace: f.workspace.value,
        agent: f.agent.value,
        task: f.task.value,
        skills: [...els.skillList.querySelectorAll('input:checked')].map((i) => i.value),
      }),
    })
    closeView()
    f.reset()
    await refresh()
    select(s.id)
    say(`LAUNCHED ${s.task}`)
  } catch (err) {
    say(err.message, true)
  }
}

// ---- skills library: a full view over the stage for browsing and managing the shared collection ----
const lib = {
  view: $('skills-view'), open: $('open-skills'), list: $('skill-manage'), dir: $('skills-dir'),
  form: $('form-skill-import'), filter: $('skills-filter'), detail: $('skill-detail'),
}
let library = { dir: '', skills: [] }
let picked = null
const skillBodies = new Map() // name -> SKILL.md content, fetched once per open

async function setEnabled(name, on) {
  const s = library.skills.find((x) => x.name === name)
  s.enabled = on
  const sync = () => lib.view.querySelectorAll('input[data-skill]').forEach((i) => i.dataset.skill === name && (i.checked = s.enabled))
  sync()
  try {
    await api('/api/skills/enabled', { method: 'PUT', body: JSON.stringify({ names: library.skills.filter((x) => x.enabled).map((x) => x.name) }) })
  } catch (err) {
    s.enabled = !on
    sync()
    say(err.message, true)
  }
}

const tickbox = (s, props = {}) =>
  h('input', { type: 'checkbox', checked: s.enabled, onchange: (e) => setEnabled(s.name, e.target.checked), ...props })

function renderSkills(data) {
  library = data
  lib.dir.textContent = data.dir
  if (!data.skills.some((s) => s.name === picked)) picked = data.skills[0]?.name ?? null
  lib.list.replaceChildren(
    ...(data.skills.length
      ? data.skills.map((s) => {
          const tick = tickbox(s, { ariaLabel: `Seed ${s.name} into new sessions` })
          tick.dataset.skill = s.name
          const pick = h('button', { type: 'button', className: 'pick', onclick: () => pickSkill(s.name) },
            h('b', { textContent: s.name }), h('span', { textContent: s.description }))
          pick.setAttribute('aria-current', String(s.name === picked))
          return h('li', {}, tick, pick)
        })
      : [h('li', { className: 'dim pad', textContent: 'NO SKILLS YET. IMPORT SOME BELOW.' })]),
  )
  applyFilter()
  renderDetail()
}

function applyFilter() {
  const q = lib.filter.value.trim().toLowerCase()
  lib.list.querySelectorAll('li').forEach((li) => (li.hidden = !!q && !li.textContent.toLowerCase().includes(q)))
}
lib.filter.oninput = applyFilter

function pickSkill(name) {
  picked = name
  lib.list.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-current', String(b.querySelector('b').textContent === name)))
  renderDetail()
}

async function renderDetail() {
  const s = library.skills.find((x) => x.name === picked)
  if (!s) return lib.detail.replaceChildren(h('p', { className: 'dim', textContent: 'PICK A SKILL TO READ IT.' }))
  const tick = tickbox(s)
  tick.dataset.skill = s.name
  const body = h('pre', { textContent: skillBodies.get(s.name) ?? 'LOADING...' })
  lib.detail.replaceChildren(
    h('h3', { textContent: s.name }),
    h('div', { className: 'controls' },
      h('label', {}, tick, 'SEED INTO NEW SESSIONS'),
      h('button', {
        type: 'button', className: 'btn small danger', textContent: '[ DELETE ]',
        onclick: async () => {
          if (!confirm(`Delete skill "${s.name}" from the collection? This removes its folder and cannot be undone. Running sessions keep their copy.`)) return
          try {
            renderSkills(await api(`/api/skills/${encodeURIComponent(s.name)}`, { method: 'DELETE' }))
          } catch (err) {
            say(err.message, true)
          }
        },
      }),
    ),
    h('p', { className: 'desc', textContent: s.description }),
    body,
  )
  lib.detail.scrollTop = 0
  if (skillBodies.has(s.name)) return
  try {
    // The front matter is already shown above as the name and description.
    const { content } = await api(`/api/skills/${encodeURIComponent(s.name)}`)
    skillBodies.set(s.name, content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, ''))
    if (picked === s.name) body.textContent = skillBodies.get(s.name)
  } catch (err) {
    body.textContent = err.message
  }
}

lib.open.onclick = async () => {
  if (openView === 'skills') return closeView()
  try {
    skillBodies.clear()
    renderSkills(await api('/api/skills'))
    showView('skills')
    lib.filter.focus()
  } catch (err) {
    say(err.message, true)
  }
}

lib.form.onsubmit = async (e) => {
  e.preventDefault()
  try {
    renderSkills(await api('/api/skills/import', { method: 'POST', body: JSON.stringify({ path: lib.form.path.value }) }))
    lib.form.reset()
    say('SKILLS IMPORTED')
  } catch (err) {
    say(err.message, true)
  }
}

// ---- workspaces: the list on the left, the picked one (or a new one) editable on the right ----
const wsDelete = $('workspace-delete')
let wsPicked = null

function editWorkspace(name) {
  wsPicked = name
  const f = els.formWs
  f.name.value = name ?? ''
  f.repos.value = name ? workspaces[name].join('\n') : ''
  $('workspace-heading').textContent = name ?? 'NEW WORKSPACE'
  wsDelete.hidden = !name
  els.wsList.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-current', String(b.dataset.name === name)))
  f.name.focus()
}

async function openWorkspaces(pick = wsPicked) {
  workspaces = await api('/api/workspaces')
  const names = Object.keys(workspaces)
  els.wsList.replaceChildren(
    ...(names.length
      ? names.map((name) => {
          const pick = h('button', { type: 'button', className: 'pick ws', onclick: () => editWorkspace(name) },
            h('b', { textContent: name }), h('span', { className: 'repos', textContent: workspaces[name].join('\n') }))
          pick.dataset.name = name
          return h('li', {}, pick)
        })
      : [h('li', { className: 'dim pad', textContent: 'NO WORKSPACES YET. ADD ONE ON THE RIGHT.' })]),
  )
  showView('workspaces')
  editWorkspace(pick in workspaces ? pick : null)
}
$('open-workspaces').onclick = () => (openView === 'workspaces' ? closeView() : openWorkspaces())
$('workspace-new').onclick = () => editWorkspace(null)

wsDelete.onclick = async () => {
  if (!wsPicked || !confirm(`Delete workspace "${wsPicked}"? Its repos are not touched.`)) return
  try {
    await api(`/api/workspaces/${encodeURIComponent(wsPicked)}`, { method: 'DELETE' })
    openWorkspaces(null)
  } catch (err) {
    say(err.message, true)
  }
}

els.formWs.onsubmit = async (e) => {
  e.preventDefault()
  const f = els.formWs
  const name = f.name.value.trim()
  const repos = f.repos.value.split('\n').map((l) => l.trim()).filter(Boolean)
  try {
    await api(`/api/workspaces/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify({ repos }) })
    say('WORKSPACE SAVED')
    openWorkspaces(name)
  } catch (err) {
    say(err.message, true)
  }
}

refresh()
pollLane()
refreshUsage()
setInterval(refresh, 2000)
setInterval(pollLane, 2000)
setInterval(refreshUsage, 60_000)
