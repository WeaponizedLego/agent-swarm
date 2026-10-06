import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { UserError } from './errors.ts'
import type { Session } from './store.ts'

// The dashboard reads git through the skill's own collector, so the live view and the agent's snapshot agree on
// paths, bases and stats. This is the repo's copy, never the session's: that one is agent-writable.
// ponytail: imported from the repo's skills/ folder, so deleting change-map there breaks the tab; move the collector into src/ if that bites.
const COLLECTOR = new URL('../skills/change-map/scripts/change-map.mjs', import.meta.url).href
type Collect = (repos: string[]) => unknown
let collectFacts: Promise<Collect> | null = null
async function collectLive(repos: string[]) {
  collectFacts ??= import(COLLECTOR).then((m: { collectFacts: Collect }) => m.collectFacts)
  try {
    // ponytail: synchronous git calls block the server while they run (well under a second on normal diffs); make them async if a huge repo stalls terminals.
    return Facts.parse((await collectFacts)(repos))
  } catch (err) {
    collectFacts = null // a missing collector should not stay cached as a failure
    throw new UserError(`Could not read the changes: ${(err as Error).message}`)
  }
}

// The change-map skill writes these into the task dir: facts.json from git, story.json from the agent.
// Both are agent-written, so they are parsed, never trusted, and the page only ever sets them as text.
const Names = z.array(z.string()).default([])
const File = z.object({
  path: z.string(),
  from: z.string().optional(),
  status: z.string(),
  add: z.number(),
  del: z.number(),
  binary: z.boolean().optional(),
  untracked: z.boolean().optional(),
  symbols: z.object({ added: Names, removed: Names, changed: Names }).default({ added: [], removed: [], changed: [] }),
  patch: z.array(z.string()).default([]),
  truncated: z.boolean().optional(),
})
const Facts = z.object({
  generatedAt: z.string(),
  repos: z.array(
    z.object({
      name: z.string(),
      branch: z.string(),
      base: z.string(),
      how: z.string(),
      commits: z.array(z.object({ sha: z.string(), subject: z.string() })).default([]),
      files: z.array(File),
    }),
  ),
})
const Story = z.object({
  title: z.string().default(''),
  tldr: z.string().default(''),
  changes: z
    .array(
      z.object({
        kind: z.string().default('chore'),
        title: z.string(),
        what: z.string().optional(),
        why: z.string().optional(),
        before: z.string().optional(),
        after: z.string().optional(),
        risk: z.enum(['low', 'medium', 'high']).optional(),
        files: Names,
      }),
    )
    .default([]),
  diagrams: z.array(z.object({ title: z.string(), caption: z.string().optional(), mermaid: z.string() })).default([]),
  hotspots: z.array(z.object({ file: z.string(), line: z.number().optional(), why: z.string() })).default([]),
  verify: Names,
})
export type Facts = z.infer<typeof Facts>
export type Story = z.infer<typeof Story>

const read = <T,>(schema: z.ZodType<T>, file: string) => {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null // not written yet
  }
  const parsed = schema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error(`${file} is malformed: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  return parsed.data
}

/** Each changed file under the name the story uses for it: repo-prefixed only when the task spans several repos. */
export const fileKey = (facts: Facts, repo: string, path: string) => (facts.repos.length > 1 ? `${repo}/${path}` : path)

/** Changed files no card explains, and files the story names that did not change. Both mean the story cannot be trusted as-is. */
export function coverage(facts: Facts, story: Story) {
  const keys = facts.repos.flatMap((r) => r.files.map((f) => fileKey(facts, r.name, f.path)))
  const carded = new Set(story.changes.flatMap((c) => c.files))
  const named = new Set([...carded, ...story.hotspots.map((h) => h.file)])
  return { unexplained: keys.filter((k) => !carded.has(k)), phantom: [...named].filter((n) => !keys.includes(n)) }
}

/** Files whose stats differ between the snapshot the story was written from and now, including files that came or went. */
export function changedSince(then: Facts, now: Facts) {
  const stat = (facts: Facts) =>
    new Map(facts.repos.flatMap((r) => r.files.map((f) => [fileKey(facts, r.name, f.path), `${f.status} ${f.add} ${f.del}`] as const)))
  const a = stat(then), b = stat(now)
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k))
}

/**
 * Live facts from git every time, so the file list and diff are never stale; the story is the agent's, written
 * against its own snapshot. When the two snapshots differ, the story is out of date and `stale` says where.
 */
export async function changeMap(s: Session) {
  const dir = join(s.dir, '.change-map')
  const facts = await collectLive(s.repos.map((r) => r.worktree))
  const snapshot = read(Facts, join(dir, 'facts.json'))
  const story = read(Story, join(dir, 'story.json'))
  const since = story && snapshot ? changedSince(snapshot, facts) : []
  return {
    facts,
    story,
    coverage: story ? coverage(facts, story) : null,
    stale: since.length && snapshot ? { at: snapshot.generatedAt, files: since } : null,
  }
}
