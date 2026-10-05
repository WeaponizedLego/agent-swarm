import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { HOME } from './config.ts'

export const AgentId = z.enum(['claude', 'codex', 'kiro'])
export type AgentId = z.infer<typeof AgentId>

const Session = z.object({
  id: z.string(),
  task: z.string(),
  workspace: z.string(),
  agent: AgentId,
  dir: z.string(),
  handle: z.string(), // the session's name in tmux, or in the in-process terminal host on Windows
  createdAt: z.string(),
  skills: z.array(z.string()).default([]), // seeded into the task dir at launch
  repos: z.array(z.object({ repo: z.string(), worktree: z.string(), branch: z.string() })),
})
export type Session = z.infer<typeof Session>

// workspace name -> absolute repo paths
const Workspaces = z.record(z.string(), z.array(z.string()))
export type Workspaces = z.infer<typeof Workspaces>

// ponytail: JSON files in ~/.agent-swarm, swap for SQLite once memory indexing or session history needs queries
function load<T>(file: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    return schema.parse(JSON.parse(readFileSync(join(HOME, file), 'utf8')))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw err
  }
}

// Write-then-rename so a crash mid-write cannot leave a half-written (corrupt) file.
function save(file: string, data: unknown) {
  mkdirSync(HOME, { recursive: true })
  const target = join(HOME, file)
  writeFileSync(`${target}.tmp`, JSON.stringify(data, null, 2))
  renameSync(`${target}.tmp`, target)
}

// The skills ticked at the last launch: the next launch starts from the same ticks.
export const loadEnabledSkills = () => load('skills.json', z.array(z.string()), [])
export const saveEnabledSkills = (names: string[]) => save('skills.json', names)
export const loadSessions = () => load('sessions.json', z.array(Session), [])
export const saveSessions = (s: Session[]) => save('sessions.json', s)
export const loadWorkspaces = () => load('workspaces.json', Workspaces, {})
export const saveWorkspaces = (w: Workspaces) => save('workspaces.json', w)
