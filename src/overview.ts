import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { git } from './run.ts'
import type { Session } from './store.ts'

export type Pm = 'pnpm' | 'npm' | 'yarn' | 'bun'

/** `packageManager` field wins (it is the repo's explicit choice), then whichever lockfile exists. */
export function detectPm(packageManager: string | undefined, has: (file: string) => boolean): Pm | null {
  const declared = packageManager?.split('@')[0]
  if (declared === 'pnpm' || declared === 'npm' || declared === 'yarn' || declared === 'bun') return declared
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  if (has('bun.lock') || has('bun.lockb')) return 'bun'
  if (has('package-lock.json')) return 'npm'
  return null
}

const Deps = z.record(z.string(), z.string()).optional()
const Pkg = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  packageManager: z.string().optional(),
  engines: Deps,
  scripts: Deps,
  dependencies: Deps,
  devDependencies: Deps,
})

export function readPackage(dir: string) {
  try {
    return Pkg.parse(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')))
  } catch {
    return null // no package.json, or one we cannot trust the shape of
  }
}

const installedVersion = (dir: string, dep: string) => {
  if (dep.includes('..')) return null // dep names come from the repo; never let one walk out of node_modules
  try {
    return z.object({ version: z.string() }).parse(JSON.parse(readFileSync(join(dir, 'node_modules', dep, 'package.json'), 'utf8'))).version
  } catch {
    return null
  }
}

// ponytail: only package.json is read in depth; other ecosystems are detected by manifest name, parse them when a Go or Python repo is actually in a workspace
const OTHER_MANIFESTS = ['pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'Gemfile', 'composer.json', 'pom.xml', 'build.gradle']
const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md', '.mcp.json', '.kiro', '.claude/settings.json']

const ls = (dir: string) => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
const gitOr = async (dir: string, fallback: string, ...args: string[]) => (await git(dir, ...args).catch(() => fallback)).trim()

async function repoOverview(r: Session['repos'][number]) {
  const dir = r.worktree
  const has = (f: string) => existsSync(join(dir, f))
  const pkg = readPackage(dir)
  const nodeModules = has('node_modules')
  const [branch, status, lastCommit] = await Promise.all([
    gitOr(dir, '?', 'rev-parse', '--abbrev-ref', 'HEAD'),
    gitOr(dir, '', 'status', '--porcelain'),
    gitOr(dir, '', 'log', '-1', '--format=%h %s'),
  ])
  const deps = pkg
    ? [
        ...Object.entries(pkg.dependencies ?? {}).map(([name, range]) => ({ name, range, dev: false })),
        ...Object.entries(pkg.devDependencies ?? {}).map(([name, range]) => ({ name, range, dev: true })),
      ].map((d) => ({ ...d, installed: installedVersion(dir, d.name) }))
    : []

  return {
    name: basename(r.repo),
    branch,
    dirty: status ? status.split('\n').length : 0,
    lastCommit,
    pm: detectPm(pkg?.packageManager, has),
    node: pkg && { name: pkg.name, version: pkg.version, engines: pkg.engines ?? {}, scripts: pkg.scripts ?? {}, deps, nodeModules },
    otherManifests: OTHER_MANIFESTS.filter(has),
    agentFiles: AGENT_FILES.filter(has),
    skills: [...new Set([...ls(join(dir, '.claude/skills')), ...ls(join(dir, '.agents/skills'))])].sort(),
  }
}

export const overview = (s: Session) => Promise.all(s.repos.map(repoOverview))
export type RepoOverview = Awaited<ReturnType<typeof repoOverview>>
