// End-to-end smoke test, plain Node so it runs the same on macOS, Linux and Windows 11.
//   pnpm smoke             tmux on macOS/Linux, the in-process ConPTY host on Windows
//   pnpm smoke -- --pty    force the in-process host (the Windows code path) on any OS
//   pnpm smoke -- --haiku  also wait for a live Haiku status line in the chat lane (spends a little usage)
// It builds throwaway git repos in a temp dir, starts the real server on a free port, and drives it over
// HTTP and WebSocket like the browser does. Agents that are not installed are skipped, not failed.
import { execFileSync, spawn } from 'node:child_process'
import { accessSync, constants, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

const flags = new Set(process.argv.slice(2))
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const skip = (name, why) => console.log(`SKIP  ${name}  (${why})`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })

function onPath(bin) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD').split(';') : ['']
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const ext of exts) {
      try {
        accessSync(join(dir, bin + ext), process.platform === 'win32' ? constants.F_OK : constants.X_OK)
        return true
      } catch {}
    }
  }
  return false
}

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

// ---- fixtures: two repos, one a Node project with a cross-platform script ----
const root = mkdtempSync(join(tmpdir(), 'swarm-smoke-'))
const repoA = join(root, 'repo-a')
const repoB = join(root, 'repo-b')
for (const [dir, file, body] of [
  [repoA, 'package.json', JSON.stringify({ name: 'smoke-app', version: '1.0.0', packageManager: 'pnpm@10.33.0', scripts: { hello: 'node -e "console.log(\'smoke-ok\')"' } }, null, 2)],
  [repoB, 'README.md', '# repo-b\n'],
]) {
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  writeFileSync(join(dir, file), body)
  git(dir, 'add', '-A')
  git(dir, '-c', 'user.name=smoke', '-c', 'user.email=smoke@example.com', 'commit', '-q', '-m', 'init')
}

// ---- server ----
const port = await freePort()
const B = `http://127.0.0.1:${port}`
const env = {
  ...process.env,
  PORT: String(port),
  SWARM_HOME: join(root, 'home'),
  ...(flags.has('--pty') ? { SWARM_HOST: 'pty' } : {}),
  ...(flags.has('--haiku') ? {} : { SWARM_CHATTER: 'off', SWARM_HOUSE: 'off' }),
}
const server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
server.stdout.on('data', (d) => (log += d))
server.stderr.on('data', (d) => (log += d))
for (let i = 0; i < 60 && !log.includes('agent-swarm on'); i++) await sleep(250)
check('server starts', log.includes('agent-swarm on'), log.match(/terminals: \w+/)?.[0] ?? log.slice(0, 300))

const api = async (path, method = 'GET', body, headers = {}) => {
  const res = await fetch(B + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body && JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, json }
}

try {
  check('foreign origin is refused', (await api('/api/sessions', 'GET', undefined, { origin: 'http://evil.example' })).status === 403)
  const ws = await api('/api/workspaces/smoke', 'PUT', { repos: [repoA, repoB] })
  check('workspace with two repos saves', ws.status === 200, ws.json?.error)

  for (const [agent, bin] of [['claude', 'claude'], ['codex', 'codex'], ['kiro', 'kiro-cli']]) {
    if (!onPath(bin)) {
      skip(`${agent}: full session`, `${bin} not on PATH`)
      continue
    }
    const created = await api('/api/sessions', 'POST', { workspace: 'smoke', agent, task: `smoke ${agent}` })
    check(`${agent}: session starts`, created.status === 201, created.json?.error)
    if (created.status !== 201) continue
    const s = created.json
    await sleep(4000)

    const listed = (await api('/api/sessions')).json.find((x) => x.id === s.id)
    check(`${agent}: agent is running`, listed && listed.state !== 'exited', listed?.state)
    check(`${agent}: worktree in each repo`, s.repos.length === 2 && git(repoA, 'worktree', 'list').includes(s.repos[0].branch))

    // The browser's path: attach, receive the screen, send a resize.
    const bytes = await new Promise((resolve) => {
      let got = 0
      const sock = new WebSocket(`ws://127.0.0.1:${port}/ws/sessions/${s.id}`)
      sock.onopen = () => sock.send(JSON.stringify({ t: 'r', cols: 100, rows: 30 }))
      sock.onmessage = (e) => (got += String(e.data).length)
      sock.onerror = () => resolve(got)
      setTimeout(() => (sock.close(), resolve(got)), 3000)
    })
    check(`${agent}: live terminal streams the screen`, bytes > 0, `${bytes} bytes`)

    const ov = await api(`/api/sessions/${s.id}/overview`)
    const a = ov.json?.find((r) => r.name === 'repo-a')
    check(`${agent}: overview reads both repos`, ov.json?.length === 2 && a?.pm === 'pnpm' && 'hello' in (a?.node?.scripts ?? {}))

    if (onPath('pnpm')) {
      const run = await api(`/api/sessions/${s.id}/repos/repo-a/actions`, 'POST', { kind: 'script', script: 'hello' })
      check(`${agent}: repo script runs`, run.json?.code === 0 && run.json?.output?.includes('smoke-ok'), run.json?.error ?? `exit ${run.json?.code}`)
    } else skip(`${agent}: repo script runs`, 'pnpm not on PATH')

    if (flags.has('--haiku')) {
      let line
      for (let i = 0; i < 45 && !line; i++) {
        line = (await api('/api/lane')).json.find((m) => m.sessionId === s.id && (m.kind === 'status' || m.kind === 'system'))
        if (!line) await sleep(2000)
      }
      check(`${agent}: chat lane gets a status line`, line?.kind === 'status', line ? line.text : 'nothing within 90s')
    }

    const removed = await api(`/api/sessions/${s.id}?cleanup=true`, 'DELETE')
    check(`${agent}: stop + cleanup`, removed.status === 204, removed.json?.error)
    check(`${agent}: no branches or worktrees left`, !git(repoA, 'branch', '--list', 'swarm/*').trim() && !git(repoB, 'branch', '--list', 'swarm/*').trim())
  }
} finally {
  server.kill()
  await sleep(500)
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `, ${failed.length} FAILED` : ''}`)
process.exit(failed.length ? 1 : 0)
