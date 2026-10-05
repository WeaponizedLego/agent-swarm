import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { UserError } from './errors.ts'
import { detectPm, readPackage, type Pm } from './overview.ts'
import { runCapture } from './run.ts'
import type { Session } from './store.ts'

export const Action = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['install', 'outdated', 'audit']) }),
  z.object({ kind: z.literal('script'), script: z.string().min(1).max(100) }),
])
export type Action = z.infer<typeof Action>

/**
 * The only commands the browser can trigger. Fixed verbs plus scripts that exist in the repo's own
 * package.json: never a free-form string, and always an argv array (no shell).
 * ponytail: yarn berry's `audit` differs from classic and is not special-cased; add it if a berry repo shows up
 */
export function actionArgv(pm: Pm, action: Action, scripts: Record<string, string>): string[] {
  if (action.kind === 'script') {
    if (!Object.hasOwn(scripts, action.script)) throw new UserError(`No script "${action.script}" in package.json`)
    return [pm, 'run', action.script]
  }
  return [pm, action.kind]
}

const running = new Set<string>()
const TIMEOUT_MS = 10 * 60_000

export async function runAction(session: Session, repoName: string, action: Action) {
  const repo = session.repos.find((r) => basename(r.repo) === repoName)
  if (!repo) throw new UserError(`No repo "${repoName}" in this session`)
  const pkg = readPackage(repo.worktree)
  const pm = detectPm(pkg?.packageManager, (f) => existsSync(join(repo.worktree, f)))
  if (!pkg || !pm) throw new UserError('Not a Node repo: no package.json or package manager detected')

  const key = `${session.id}/${repoName}`
  if (running.has(key)) throw new UserError('Another action is still running in this repo')
  running.add(key)
  try {
    const [cmd, ...args] = actionArgv(pm, action, pkg.scripts ?? {})
    const res = await runCapture(cmd!, args, { cwd: repo.worktree, timeoutMs: TIMEOUT_MS })
    const output = `${res.stdout}${res.stderr ? `\n${res.stderr}` : ''}`.trim()
    return {
      command: [cmd, ...args].join(' '),
      code: res.code,
      timedOut: res.timedOut,
      output: output.slice(-20_000),
    }
  } finally {
    running.delete(key)
  }
}
