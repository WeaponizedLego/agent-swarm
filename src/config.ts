import { homedir } from 'node:os'
import { join } from 'node:path'

export const HOME = process.env.SWARM_HOME ?? join(homedir(), '.agent-swarm')
export const TASKS_DIR = join(HOME, 'tasks')
export const PORT = Number(process.env.PORT ?? 4317)
// Loopback only: this UI can run shell commands, so it is never exposed on the network.
export const HOST = '127.0.0.1'

// The subscription token is for Haiku calls only. Take it out of process.env before anything is
// spawned, or every agent session, agent-run command and repo script would inherit it.
export const HAIKU_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN || undefined
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
