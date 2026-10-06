import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import { z } from 'zod'
import { Action, runAction } from './actions.ts'
import { changeMap } from './changes.ts'
import { startChatter } from './chatter.ts'
import { HOST, PORT, SKILLS_DIR } from './config.ts'
import { UserError } from './errors.ts'
import { askHouse, startHouseKeeper } from './housekeeper.ts'
import { post, since } from './lane.ts'
import { overview } from './overview.ts'
import { createSession, findSession, listSessions, removeSession, resumeSession, removeWorkspace, setWorkspace } from './sessions.ts'
import { catalog, importSkills, readSkill, removeSkill } from './skills.ts'
import { AgentId, loadEnabledSkills, loadWorkspaces, saveEnabledSkills } from './store.ts'
import { TERMINAL_HOST, terminals } from './terminals.ts'
import { getUsage } from './usage.ts'

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const app = Fastify({ logger: { level: 'warn' } })

// The terminal endpoint is remote code execution by design. Only accept requests addressed to
// loopback and, when a browser sends Origin, only from our own page: this blocks DNS rebinding
// and cross-site WebSocket hijacking from any other site the user has open.
const allowedHosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`])
const originHost = (origin: string) => URL.parse(origin)?.host // `Origin: null` (sandboxed frames, file://) parses to nothing
app.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin
  if (!allowedHosts.has(req.headers.host ?? '') || (origin && !allowedHosts.has(originHost(origin) ?? ''))) {
    return reply.code(403).send({ error: 'Forbidden host or origin' })
  }
})

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  if (err instanceof UserError) return reply.code(400).send({ error: err.message })
  if (err instanceof z.ZodError) return reply.code(400).send({ error: err.issues.map((i) => i.message).join('; ') })
  app.log.error(err)
  return reply.code(err.statusCode ?? 500).send({ error: err.message })
})

await app.register(websocket)
await app.register(fastifyStatic, { root: root('../public') })
await app.register(fastifyStatic, { root: root('../node_modules/@xterm'), prefix: '/vendor/', decorateReply: false })
await app.register(fastifyStatic, { root: root('../node_modules/mermaid/dist'), prefix: '/vendor-mermaid/', decorateReply: false })

// ---- workspaces ----
app.get('/api/workspaces', async () => loadWorkspaces())
app.put('/api/workspaces/:name', async (req) => {
  const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(req.params)
  const { repos } = z.object({ repos: z.array(z.string().trim().min(1)).min(1) }).parse(req.body)
  await setWorkspace(name, repos)
  return loadWorkspaces()
})
app.delete('/api/workspaces/:name', async (req) => {
  removeWorkspace(z.object({ name: z.string() }).parse(req.params).name)
  return loadWorkspaces()
})

// ---- skills: the shared collection, managed here and seeded into sessions at launch ----
app.get('/api/skills', async () => ({ dir: SKILLS_DIR, skills: catalog() }))
app.get('/api/skills/:name', async (req) => {
  const { name } = z.object({ name: z.string() }).parse(req.params)
  return { name, content: readSkill(SKILLS_DIR, name) }
})
// The saved ticks: what the next launch starts from. Names no longer in the collection are dropped.
app.put('/api/skills/enabled', async (req) => {
  const { names } = z.object({ names: z.array(z.string()) }).parse(req.body)
  const known = new Set(catalog().map((s) => s.name))
  saveEnabledSkills(names.filter((n) => known.has(n)))
  return { dir: SKILLS_DIR, skills: catalog() }
})
app.post('/api/skills/import', async (req) => {
  const { path } = z.object({ path: z.string().trim().min(1) }).parse(req.body)
  importSkills(SKILLS_DIR, path)
  return { dir: SKILLS_DIR, skills: catalog() }
})
app.delete('/api/skills/:name', async (req) => {
  const { name } = z.object({ name: z.string() }).parse(req.params)
  removeSkill(SKILLS_DIR, name)
  saveEnabledSkills(loadEnabledSkills().filter((n) => n !== name)) // a skill re-added later starts unticked
  return { dir: SKILLS_DIR, skills: catalog() }
})

// ---- sessions ----
// `skills` omitted means "the saved ticks"; a list replaces them for this and the next launch.
const CreateSession = z.object({
  workspace: z.string(),
  agent: AgentId,
  task: z.string().trim().min(1).max(80),
  skills: z.array(z.string()).optional(),
})
app.get('/api/sessions', async () => listSessions())
app.post('/api/sessions', async (req, reply) => reply.code(201).send(await createSession(CreateSession.parse(req.body))))
app.delete('/api/sessions/:id', async (req, reply) => {
  const { id } = z.object({ id: z.string() }).parse(req.params)
  const { cleanup } = z.object({ cleanup: z.stringbool().default(false) }).parse(req.query)
  await removeSession(id, cleanup)
  return reply.code(204).send()
})
app.post('/api/sessions/:id/resume', async (req, reply) => {
  const { id } = z.object({ id: z.string() }).parse(req.params)
  await resumeSession(id)
  return reply.code(204).send()
})

app.get('/api/sessions/:id/overview', async (req) => {
  const { id } = z.object({ id: z.string() }).parse(req.params)
  const session = findSession(id)
  if (!session) throw new UserError('No such session')
  return overview(session)
})
// What the session changed, as written by the change-map skill. Read-only: the agent produces it, the page draws it.
app.get('/api/sessions/:id/changes', async (req) => {
  const { id } = z.object({ id: z.string() }).parse(req.params)
  const session = findSession(id)
  if (!session) throw new UserError('No such session')
  return changeMap(session)
})
app.post('/api/sessions/:id/repos/:repo/actions', async (req) => {
  const { id, repo } = z.object({ id: z.string(), repo: z.string() }).parse(req.params)
  const session = findSession(id)
  if (!session) throw new UserError('No such session')
  return runAction(session, repo, Action.parse(req.body))
})

// ---- chat lane: one feed for the whole swarm, polled with a cursor ----
app.get('/api/lane', async (req) => {
  const { after } = z.object({ after: z.coerce.number().int().min(0).default(0) }).parse(req.query)
  return since(after)
})

// You talk to the house keeper here; every message you post is answered by it.
app.post('/api/lane', async (req, reply) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(500) }).parse(req.body)
  const message = post({ sessionId: 'you', task: 'YOU', agent: 'you', kind: 'user', text })
  askHouse(text)
  return reply.code(201).send(message)
})

// ---- plan usage: how much of each agent's plan (or monthly credits) is used ----
app.get('/api/usage', async () => getUsage())

// ---- live terminal: view and steer are the same stream ----
const WsMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('i'), d: z.string() }),
  z.object({ t: z.literal('r'), cols: z.number().int().min(10).max(500), rows: z.number().int().min(2).max(300) }),
])

app.get('/ws/sessions/:id', { websocket: true }, async (socket, req) => {
  const { id } = z.object({ id: z.string() }).parse(req.params)
  const session = findSession(id)
  if (!session || !(await terminals.alive(session.handle))) return socket.close(1008, 'session not running')

  // Attach at the browser's size: resizing right after the attach can race tmux's startup and leave it drawing
  // a smaller screen than the browser shows, until the next window resize.
  const { cols, rows } = z.object({ cols: z.coerce.number().int().min(10).max(500).default(120), rows: z.coerce.number().int().min(2).max(300).default(32) }).parse(req.query)
  const term = terminals.attach(session.handle, cols, rows)
  term.onData((d) => socket.send(d))
  term.onExit(() => socket.close())
  socket.on('message', (raw) => {
    let json: unknown
    try {
      json = JSON.parse(raw.toString())
    } catch {
      return // a throw here is uncaught and would take the whole server down
    }
    const parsed = WsMessage.safeParse(json)
    if (!parsed.success) return
    if (parsed.data.t === 'i') term.write(parsed.data.d)
    else term.resize(parsed.data.cols, parsed.data.rows)
  })
  // Closing the socket only detaches this viewer; the agent keeps running.
  socket.on('close', () => term.close())
})

await app.listen({ host: HOST, port: PORT })
console.log(`agent-swarm on http://${HOST}:${PORT} (terminals: ${TERMINAL_HOST})`)
startChatter()
startHouseKeeper()
