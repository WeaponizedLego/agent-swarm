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
  term: $('term'), overview: $('overview'), tabs: $('tabs'), placeholder: $('placeholder'), status: $('status'),
  dlgSession: $('dlg-session'), formSession: $('form-session'), skillList: $('skill-list'),
  dlgWs: $('dlg-workspaces'), formWs: $('form-workspace'), wsList: $('workspace-list'),
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
function setTab(next) {
  tab = next
  const isTerm = next === 'term'
  $('tab-term').setAttribute('aria-selected', String(isTerm))
  $('tab-overview').setAttribute('aria-selected', String(!isTerm))
  els.term.hidden = !isTerm
  els.overview.hidden = isTerm
  if (isTerm) requestAnimationFrame(() => (fit.fit(), term.focus()))
  else loadOverview()
}
$('tab-term').onclick = () => setTab('term')
$('tab-overview').onclick = () => setTab('overview')
// Arrow keys move between tabs, as the tab pattern expects.
els.tabs.onkeydown = (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const next = tab === 'term' ? 'overview' : 'term'
  setTab(next)
  $(`tab-${next}`).focus()
}

// ---- sessions ----
function select(id) {
  selected = id
  els.placeholder.hidden = true
  attach(id)
  if (tab === 'overview') loadOverview()
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

function renderLane() {
  const shown = onlySelected ? lane.filter(inFilter) : lane
  els.laneEmpty.hidden = shown.length > 0
  const atBottom = els.laneList.scrollHeight - els.laneList.scrollTop - els.laneList.clientHeight < 40
  let prev = null
  els.laneList.replaceChildren(
    ...shown.map((m) => {
      const sameAsPrev = prev && author(prev) === author(m) && new Date(m.ts) - new Date(prev.ts) < 5 * 60_000
      prev = m
      const alert = m.text.startsWith('needs you:') || m.text.startsWith('heads up:') || m.kind === 'system'
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
  if (atBottom) els.laneList.scrollTop = els.laneList.scrollHeight
}

async function pollLane() {
  try {
    const fresh = await api(`/api/lane?after=${laneAfter}`)
    if (fresh.length) {
      if (fresh.some((m) => m.kind === 'house') && els.status.textContent.startsWith('ASKING')) say('READY')
      lane = [...lane, ...fresh].slice(-500)
      laneAfter = fresh.at(-1).id
      renderLane()
    }
  } catch {
    /* the sessions poll already surfaces connection errors */
  }
}

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

// ---- new session dialog ----
$('new-session').onclick = async () => {
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
  els.dlgSession.showModal()
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
    els.dlgSession.close()
    f.reset()
    await refresh()
    select(s.id)
    say(`LAUNCHED ${s.task}`)
  } catch (err) {
    say(err.message, true)
  }
}

// ---- skills dialog: manage the shared collection without a session ----
const skillsDlg = { dlg: $('dlg-skills'), list: $('skill-manage'), dir: $('skills-dir'), form: $('form-skill-import') }

function renderSkills({ dir, skills }) {
  skillsDlg.dir.textContent = dir
  const ticked = () => [...skillsDlg.list.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value)
  skillsDlg.list.replaceChildren(
    ...(skills.length
      ? skills.map((s) => {
          const body = h('pre', { className: 'skill-body', hidden: true })
          const view = h('button', {
            type: 'button', className: 'btn small', textContent: '[ VIEW ]',
            onclick: async () => {
              if (body.hidden && !body.textContent) body.textContent = (await api(`/api/skills/${encodeURIComponent(s.name)}`)).content
              body.hidden = !body.hidden
            },
          })
          const del = h('button', {
            type: 'button', className: 'btn small danger', textContent: '[ DELETE ]',
            onclick: async () => {
              if (!confirm(`Delete skill "${s.name}" from the collection? This removes its folder and cannot be undone. Running sessions keep their copy.`)) return
              try {
                renderSkills(await api(`/api/skills/${encodeURIComponent(s.name)}`, { method: 'DELETE' }))
              } catch (err) {
                say(err.message, true)
              }
            },
          })
          const tick = h('input', {
            type: 'checkbox', value: s.name, checked: s.enabled,
            onchange: async () => {
              try {
                await api('/api/skills/enabled', { method: 'PUT', body: JSON.stringify({ names: ticked() }) })
              } catch (err) {
                tick.checked = !tick.checked
                say(err.message, true)
              }
            },
          })
          return h('li', {},
            h('label', { className: 'skill' }, tick, h('span', {}, h('b', { textContent: s.name }), h('span', { className: 'dim', textContent: s.description }))),
            h('div', { className: 'actions' }, view, del),
            body,
          )
        })
      : [h('li', { className: 'dim', textContent: 'NO SKILLS YET. IMPORT SOME BELOW.' })]),
  )
}

$('open-skills').onclick = async () => {
  try {
    renderSkills(await api('/api/skills'))
    if (!skillsDlg.dlg.open) skillsDlg.dlg.showModal()
  } catch (err) {
    say(err.message, true)
  }
}

skillsDlg.form.onsubmit = async (e) => {
  e.preventDefault()
  try {
    renderSkills(await api('/api/skills/import', { method: 'POST', body: JSON.stringify({ path: skillsDlg.form.path.value }) }))
    skillsDlg.form.reset()
    say('SKILLS IMPORTED')
  } catch (err) {
    say(err.message, true)
  }
}

// ---- workspaces dialog ----
async function openWorkspaces() {
  workspaces = await api('/api/workspaces')
  els.wsList.replaceChildren(
    ...Object.entries(workspaces).map(([name, repos]) => {
      const del = h('button', {
        type: 'button',
        className: 'btn danger',
        textContent: '[ DELETE ]',
        onclick: async () => {
          await api(`/api/workspaces/${encodeURIComponent(name)}`, { method: 'DELETE' })
          openWorkspaces()
        },
      })
      return h('li', {}, h('div', {}, h('strong', { textContent: name }), h('div', { className: 'repos', textContent: repos.join('\n') })), del)
    }),
  )
  if (!els.dlgWs.open) els.dlgWs.showModal()
}
$('open-workspaces').onclick = openWorkspaces

els.formWs.onsubmit = async (e) => {
  e.preventDefault()
  const f = els.formWs
  const repos = f.repos.value.split('\n').map((l) => l.trim()).filter(Boolean)
  try {
    await api(`/api/workspaces/${encodeURIComponent(f.name.value.trim())}`, { method: 'PUT', body: JSON.stringify({ repos }) })
    f.reset()
    say('WORKSPACE SAVED')
    openWorkspaces()
  } catch (err) {
    say(err.message, true)
  }
}

document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()))

refresh()
pollLane()
refreshUsage()
setInterval(refresh, 2000)
setInterval(pollLane, 2000)
setInterval(refreshUsage, 60_000)
