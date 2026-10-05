import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOME = process.env.SWARM_HOME ?? join(homedir(), '.agent-swarm')
export const TASKS_DIR = join(HOME, 'tasks')
// The shared skill collection: one folder per skill, each with a SKILL.md. Defaults to this repo's own skills/ folder.
export const SKILLS_DIR = process.env.SWARM_SKILLS ?? fileURLToPath(new URL('../skills', import.meta.url))
export const PORT = Number(process.env.PORT ?? 4317)
// Loopback only: this UI can run shell commands, so it is never exposed on the network.
export const HOST = '127.0.0.1'

// The subscription token is for Haiku calls only. Take it out of process.env before anything is
// spawned, or every agent session, agent-run command and repo script would inherit it.
export const HAIKU_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN || undefined
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
