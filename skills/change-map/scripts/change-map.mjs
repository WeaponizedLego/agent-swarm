#!/usr/bin/env node
// change-map: git collects the facts, the agent writes the story, the agent-swarm dashboard draws both (CHANGES tab).
//   node change-map.mjs collect [--base <ref>] [--out <dir>]   writes facts.json, prints a compact summary
//   node change-map.mjs check [--out <dir>]                     every changed file explained by story.json?
// Covers every worktree of a swarm task, wherever in it you run it. No dependencies.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (n) => {
  const i = rest.indexOf(`--${n}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const git = (cwd, ...a) =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...a], {
    cwd, encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'],
  }).trimEnd()
const tryGit = (...a) => {
  try {
    return git(...a)
  } catch {
    return ''
  }
}

// A swarm task dir is not a repo but holds one worktree per repo on a swarm/* branch. Started inside one of
// those worktrees, step up to the task dir, so every repo is covered and the dashboard finds the output.
const here = process.cwd()
const hereTop = tryGit(here, 'rev-parse', '--show-toplevel')
const inSwarm = hereTop && tryGit(hereTop, 'symbolic-ref', '--short', 'HEAD').startsWith('swarm/')
const cwd = inSwarm ? dirname(hereTop) : here
const top = inSwarm ? '' : hereTop
// Outside the swarm the output goes in the repo's git dir, so it never shows up as a change itself.
const OUT = flag('out')
  ? resolve(flag('out'))
  : top
    ? join(git(top, 'rev-parse', '--absolute-git-dir'), 'change-map')
    : join(cwd, '.change-map')
const PATCH_CAP = 400 // lines of diff kept per file for the drill-down

// ---------- collect ----------

/** Where "this session" starts: the swarm branch's creation point, else the fork from main, else HEAD. */
function baseOf(repo) {
  const explicit = flag('base')
  if (explicit) return { base: git(repo, 'rev-parse', explicit), how: `--base ${explicit}` }
  const branch = tryGit(repo, 'symbolic-ref', '--short', 'HEAD')
  if (branch.startsWith('swarm/')) {
    const created = tryGit(repo, 'reflog', 'show', '--format=%H', `refs/heads/${branch}`).split('\n').pop()
    if (created) return { base: created, how: `where ${branch} was created` }
  }
  const main = ['origin/HEAD', 'main', 'master'].find((r) => tryGit(repo, 'rev-parse', '--verify', '-q', r))
  if (main && branch && !['main', 'master'].includes(branch)) {
    const fork = tryGit(repo, 'merge-base', 'HEAD', main)
    if (fork) return { base: fork, how: `fork point from ${main}` }
  }
  return { base: git(repo, 'rev-parse', 'HEAD'), how: 'HEAD, so uncommitted changes only' }
}

// ponytail: regex, not a parser; catches declarations (arrow consts only at top level) in JS/TS/Python/Go/Rust. Swap for tree-sitter if it misleads.
const DECL =
  /^\s*(?:export\s+)?(?:default\s+)?(?:pub(?:\([\w:]+\))?\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|def|func|fn|struct|trait)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function\b|[A-Za-z_$][\w$]*\s*=>)/
const declName = (s) => {
  const m = DECL.exec(s)
  return m && (m[1] ?? m[2])
}

/** Declarations added, removed, or changed in place (via git's own hunk-header function context). */
function symbols(patch) {
  const plus = new Set(), minus = new Set(), touched = new Set()
  for (const l of patch) {
    const hunk = /^@@[^@]*@@\s*(.*)$/.exec(l)
    const name = hunk ? declName(hunk[1]) : /^[+-]/.test(l) ? declName(l.slice(1)) : null
    if (!name) continue
    if (hunk) touched.add(name)
    else (l[0] === '+' ? plus : minus).add(name)
  }
  const added = [...plus].filter((n) => !minus.has(n))
  const removed = [...minus].filter((n) => !plus.has(n))
  const changed = [...new Set([...touched, ...[...plus].filter((n) => minus.has(n))])].filter(
    (n) => !added.includes(n) && !removed.includes(n),
  )
  return { added, removed, changed }
}

function collectRepo(repo) {
  const { base, how } = baseOf(repo)
  const files = new Map()

  const ns = tryGit(repo, 'diff', '-M', '--name-status', '-z', base).split('\0').filter(Boolean)
  for (let i = 0; i < ns.length; ) {
    const s = ns[i++]
    if (s[0] === 'R' || s[0] === 'C') {
      const from = ns[i++], to = ns[i++]
      files.set(to, { path: to, from, status: 'R' })
    } else files.set(ns[i], { path: ns[i++], status: s[0] })
  }

  const nm = tryGit(repo, 'diff', '-M', '--numstat', '-z', base).split('\0')
  for (let i = 0; i < nm.length; i++) {
    if (!nm[i]) continue
    const [a, d, p] = nm[i].split('\t')
    const key = p || ((i += 2), nm[i]) // a rename puts old\0new after an empty path
    const f = files.get(key)
    if (f) Object.assign(f, { add: a === '-' ? 0 : +a, del: d === '-' ? 0 : +d, binary: a === '-' })
  }

  const raw = tryGit(repo, 'diff', '-M', '-U3', base)
  for (const chunk of ('\n' + raw).split('\ndiff --git ').slice(1)) {
    const lines = chunk.split('\n')
    const p = (/^\+\+\+ b\/(.*)$/m.exec(chunk) ?? /^rename to (.*)$/m.exec(chunk) ?? /^--- a\/(.*)$/m.exec(chunk))?.[1]
    const f = files.get(p)
    if (!f) continue
    const body = lines.slice(Math.max(0, lines.findIndex((l) => l.startsWith('@@'))))
    f.symbols = symbols(body)
    f.patch = body.slice(0, PATCH_CAP)
    f.truncated = body.length > PATCH_CAP
  }

  // Untracked files are new work too; git diff never sees them.
  for (const p of tryGit(repo, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean)) {
    const abs = join(repo, p)
    const big = statSync(abs).size > 1 << 20
    const text = big ? '' : readFileSync(abs, 'utf8')
    const binary = big || text.includes('\0')
    const body = binary ? [] : text.replace(/\n$/, '').split('\n').map((l) => '+' + l)
    files.set(p, {
      path: p, status: 'A', untracked: true, add: body.length, del: 0, binary,
      symbols: symbols(body), patch: body.slice(0, PATCH_CAP), truncated: body.length > PATCH_CAP,
    })
  }

  const commits = tryGit(repo, 'log', '--format=%h%x09%s', `${base}..HEAD`)
    .split('\n').filter(Boolean).map((l) => {
      const [sha, ...s] = l.split('\t')
      return { sha, subject: s.join('\t') }
    })

  return {
    name: basename(repo), path: repo, branch: tryGit(repo, 'symbolic-ref', '--short', 'HEAD') || '(detached)',
    base, how, commits,
    files: [...files.values()].map((f) => ({ add: 0, del: 0, symbols: { added: [], removed: [], changed: [] }, patch: [], ...f })),
  }
}

function collect() {
  const repos = top
    ? [top]
    : readdirSync(cwd, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(cwd, e.name, '.git')))
        .map((e) => join(cwd, e.name))
  if (!repos.length) throw new Error('No git repo here or in any folder directly inside it')
  const facts = { generatedAt: new Date().toISOString(), repos: repos.map(collectRepo) }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 1))

  const multi = facts.repos.length > 1
  for (const r of facts.repos) {
    console.log(`\n${r.name}  ${r.branch}  base ${r.base.slice(0, 8)} (${r.how})  ${r.commits.length} commit(s)`)
    console.log(`  diff one file: git -C ${r.path} diff ${r.base.slice(0, 12)} -- <path>`)
    for (const f of r.files) {
      const s = f.symbols
      const sym = [...s.added.map((n) => '+' + n), ...s.removed.map((n) => '-' + n), ...s.changed.map((n) => '~' + n)]
      const name = (multi ? `${r.name}/` : '') + f.path + (f.from ? ` (from ${f.from})` : '')
      console.log(`  ${f.status} ${name}  +${f.add} -${f.del}${f.binary ? ' binary' : ''}${f.untracked ? ' untracked' : ''}  ${sym.slice(0, 12).join(' ')}`)
    }
  }
  console.log(`\nfacts: ${join(OUT, 'facts.json')}\nnext:  write ${join(OUT, 'story.json')}, then run check`)
}

// ---------- check ----------

/** The story must explain every changed file and name no file that did not change; the dashboard shows the same check. */
function check() {
  const facts = JSON.parse(readFileSync(join(OUT, 'facts.json'), 'utf8'))
  const storyPath = join(OUT, 'story.json')
  if (!existsSync(storyPath)) throw new Error(`Write ${storyPath} first (see SKILL.md for its shape)`)
  const story = JSON.parse(readFileSync(storyPath, 'utf8'))
  const multi = facts.repos.length > 1
  const keys = facts.repos.flatMap((r) => r.files.map((f) => (multi ? `${r.name}/` : '') + f.path))
  const named = new Set([...(story.changes ?? []).flatMap((c) => c.files ?? []), ...(story.hotspots ?? []).map((h) => h.file)])
  const carded = new Set((story.changes ?? []).flatMap((c) => c.files ?? []))
  const unexplained = keys.filter((k) => !carded.has(k))
  const phantom = [...named].filter((n) => !keys.includes(n))
  if (unexplained.length) console.log(`not in any card: ${unexplained.join(', ')}`)
  if (phantom.length) console.log(`named but not changed: ${phantom.join(', ')}`)
  if (unexplained.length || phantom.length) process.exit(1)
  console.log(`ok: ${keys.length} file(s), all explained. The dashboard's CHANGES tab shows it.`)
}

try {
  if (cmd === 'collect') collect()
  else if (cmd === 'check') check()
  else throw new Error('usage: change-map.mjs collect [--base <ref>] [--out <dir>] | check [--out <dir>]')
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
