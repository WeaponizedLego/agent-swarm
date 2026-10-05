import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { SKILLS_DIR } from './config.ts'
import { UserError } from './errors.ts'
import { loadEnabledSkills } from './store.ts'
import type { AgentId } from './store.ts'

// Where each CLI looks for project skills, relative to the task dir it starts in.
// ponytail: only the claude path is verified; check codex and kiro before relying on them.
const SKILL_DIR: Record<AgentId, string> = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  kiro: '.kiro/skills',
}

// ponytail: not a YAML parser, just enough for `description:` as a plain, quoted or folded (`>`) scalar; swap for a YAML lib if skills start using anchors or flow styles
export function parseDescription(md: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md)?.[1] ?? ''
  const raw = /^description:[ \t]*(.*(?:\r?\n[ \t]+.*)*)/m.exec(front)?.[1]
  if (!raw) return ''
  return raw
    .replace(/^[>|][+-]?/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^(["'])(.*)\1$/, '$2')
}

/** Every folder in the library that holds a SKILL.md. The folder name is the skill's id. */
export function listSkills(library: string) {
  let entries
  try {
    entries = readdirSync(library, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && existsSync(join(library, e.name, 'SKILL.md')))
    .map((e) => ({ name: e.name, description: parseDescription(readFileSync(join(library, e.name, 'SKILL.md'), 'utf8')) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Copies skills into the task dir (outside every repo, so no worktree gets dirtied). A copy, not a symlink:
 * Windows symlinks need privileges, and a running session should not change when the library does.
 * Names are checked against the library listing, so a request can never point the copy at another path.
 */
export function seedSkills(library: string, dir: string, agent: AgentId, names: string[]) {
  assertKnown(library, names)
  for (const name of names) cpSync(join(library, name), join(dir, SKILL_DIR[agent], name), { recursive: true })
}

function assertKnown(library: string, names: string[]) {
  const known = new Set(listSkills(library).map((s) => s.name))
  const unknown = names.filter((n) => !known.has(n))
  if (unknown.length) throw new UserError(`Unknown skill: ${unknown.join(', ')}`)
}

export function readSkill(library: string, name: string) {
  assertKnown(library, [name])
  return readFileSync(join(library, name, 'SKILL.md'), 'utf8')
}

/** Permanently deletes a skill folder from the library. Sessions already seeded keep their copy. */
export function removeSkill(library: string, name: string) {
  assertKnown(library, [name])
  // Windows can hold a just-read file open for a moment; retry instead of failing.
  rmSync(join(library, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

/**
 * Copies one skill folder, or every skill folder inside a folder, into the library. Never overwrites:
 * a name already in the collection is an error, so an import cannot silently replace an edited skill.
 */
export function importSkills(library: string, raw: string) {
  const src = /^~[\\/]/.test(raw) ? join(homedir(), raw.slice(2)) : raw
  if (!isAbsolute(src)) throw new UserError(`Path must be absolute: ${raw}`)
  const dirs = existsSync(join(src, 'SKILL.md')) ? [src] : listSkills(src).map((s) => join(src, s.name))
  if (!dirs.length) throw new UserError('No SKILL.md found there, or in any folder inside it')
  const have = new Set(listSkills(library).map((s) => s.name))
  const clash = dirs.map((d) => basename(d)).filter((n) => have.has(n))
  if (clash.length) throw new UserError(`Already in the collection: ${clash.join(', ')}`)
  for (const d of dirs) cpSync(d, join(library, basename(d)), { recursive: true, filter: (p) => basename(p) !== '.git' })
  return dirs.map((d) => basename(d))
}

/** The library with each skill's saved on/off state; skills deleted from disk drop out of the saved set. */
export function catalog() {
  const on = new Set(loadEnabledSkills())
  return listSkills(SKILLS_DIR).map((s) => ({ ...s, enabled: on.has(s.name) }))
}
