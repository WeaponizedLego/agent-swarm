import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { agentArgv, resolveBin } from './agents.ts'
import { SKILLS_DIR, TASKS_DIR } from './config.ts'
import { UserError } from './errors.ts'
import { git } from './run.ts'
import { catalog, seedSkills } from './skills.ts'
import { classify, type AgentState } from './state.ts'
import { loadSessions, loadWorkspaces, saveEnabledSkills, saveSessions, saveWorkspaces, type AgentId, type Session } from './store.ts'
import { terminals } from './terminals.ts'

// Windows can hold a just-killed agent's files open for a moment; retry instead of failing the cleanup.
const removeDir = (dir: string) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

// ---- workspaces: a named set of repos an agent can work across ----

export async function setWorkspace(name: string, repoPaths: string[]) {
  const toplevels: string[] = []
  for (const raw of repoPaths) {
    const p = /^~[\\/]/.test(raw) ? join(homedir(), raw.slice(2)) : raw
    if (!isAbsolute(p)) throw new UserError(`Repo path must be absolute: ${raw}`)
    try {
      toplevels.push((await git(resolve(p), 'rev-parse', '--show-toplevel')).trim())
    } catch {
      throw new UserError(`Not a git repository: ${raw}`)
    }
  }
  const names = toplevels.map((t) => basename(t))
  if (new Set(names).size !== names.length) throw new UserError('Two repos share a folder name; worktrees would collide')
  saveWorkspaces({ ...loadWorkspaces(), [name]: toplevels })
}

export function removeWorkspace(name: string) {
  const { [name]: _gone, ...rest } = loadWorkspaces()
  saveWorkspaces(rest)
}

// ---- sessions ----

export async function createSession(input: { workspace: string; agent: AgentId; task: string; skills?: string[] }) {
  const repos = loadWorkspaces()[input.workspace]
  if (!repos?.length) throw new UserError(`Unknown or empty workspace: ${input.workspace}`)
  const slug = slugify(input.task)
  if (!slug) throw new UserError('Task name needs letters or digits')

  const id = randomUUID().slice(0, 8)
  const branch = `swarm/${slug}-${id}`
  const dir = join(TASKS_DIR, `${slug}-${id}`)
  const created: Session['repos'] = []

  try {
    for (const repo of repos) {
      const worktree = join(dir, basename(repo))
      mkdirSync(dir, { recursive: true })
      await git(repo, 'worktree', 'add', '-b', branch, worktree)
      created.push({ repo, worktree, branch })
    }
    // Skills must be on disk before the agent starts: the CLIs read them at launch. No list means the saved ticks.
    const skills = [...new Set(input.skills ?? catalog().filter((s) => s.enabled).map((s) => s.name))]
    seedSkills(SKILLS_DIR, dir, input.agent, skills)
    if (input.skills) saveEnabledSkills(skills)
    const handle = `swarm-${id}`
    await terminals.start(handle, dir, resolveBin(agentArgv(input.agent)))
    const session: Session = {
      id, task: input.task, workspace: input.workspace, agent: input.agent,
      dir, handle, createdAt: new Date().toISOString(), skills, repos: created,
    }
    saveSessions([...loadSessions(), session])
    return session
  } catch (err) {
    // A half-created task would leave branches and worktrees nobody tracks: undo what was made.
    for (const r of created) await git(r.repo, 'worktree', 'remove', '--force', r.worktree).catch(() => {})
    for (const r of created) await git(r.repo, 'branch', '-D', r.branch).catch(() => {})
    removeDir(dir)
    throw err
  }
}

export async function listSessions() {
  return Promise.all(
    loadSessions().map(async (s) => {
      let state: AgentState = 'exited'
      let idleSecs = 0
      if (await terminals.alive(s.handle)) {
        const seen = await terminals.peek(s.handle)
        idleSecs = seen.idleSecs
        state = classify(seen.tail, idleSecs)
      }
      return { ...s, state, idleSecs }
    }),
  )
}

export const findSession = (id: string) => loadSessions().find((s) => s.id === id)

/**
 * Stops the agent and forgets the session. Worktrees are kept (they hold the agent's work)
 * unless `cleanup` is set, and even then a worktree with uncommitted changes is refused, never forced.
 */
export async function removeSession(id: string, cleanup: boolean) {
  const s = findSession(id)
  if (!s) throw new UserError('No such session')
  if (cleanup) {
    const dirty: string[] = []
    for (const r of s.repos) if ((await git(r.worktree, 'status', '--porcelain')).trim()) dirty.push(basename(r.repo))
    if (dirty.length) throw new UserError(`Uncommitted changes in ${dirty.join(', ')}; commit or discard them first`)
  }
  await terminals.kill(s.handle)
  if (cleanup) {
    for (const r of s.repos) {
      await git(r.repo, 'worktree', 'remove', r.worktree)
      // `-d` (not `-D`) refuses a branch with unmerged commits, so only empty branches disappear.
      await git(r.repo, 'branch', '-d', r.branch).catch(() => {})
    }
    removeDir(s.dir)
  }
  saveSessions(loadSessions().filter((x) => x.id !== id))
}
