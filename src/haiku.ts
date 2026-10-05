import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HAIKU_TOKEN } from './config.ts'
import { runCapture } from './run.ts'

/**
 * System prompts go to claude as a file, not an argument: on Windows an npm-installed `claude` is a
 * `.cmd` shim run through cmd.exe, which cannot carry a multi-line argument intact.
 */
const promptFiles = new Map<string, string>()
function promptFile(system: string) {
  let file = promptFiles.get(system)
  if (!file) {
    const dir = join(tmpdir(), 'agent-swarm')
    mkdirSync(dir, { recursive: true })
    file = join(dir, `${createHash('sha1').update(system).digest('hex').slice(0, 12)}.txt`)
    writeFileSync(file, system)
    promptFiles.set(system, file)
  }
  return file
}

// Observers and the house keeper share this cap so a busy swarm cannot spawn a pile of claude processes.
const MAX_PARALLEL = 3
let active = 0
const waiting: Array<() => void> = []

async function acquire() {
  if (active < MAX_PARALLEL) {
    active++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve)) // the slot is handed over, so `active` stays as is
}
function release() {
  const next = waiting.shift()
  if (next) next()
  else active--
}

/**
 * One-shot Haiku call with no tools, no session history and no skills, run from a neutral dir so no
 * project CLAUDE.md is loaded. Auth is CLAUDE_CODE_OAUTH_TOKEN from .env, or your normal login.
 * Callers pass untrusted text (terminal output) only as data, and Haiku has no tool to act on it.
 */
export async function askHaiku(system: string, prompt: string): Promise<string> {
  await acquire()
  try {
    const res = await runCapture(
      'claude',
      ['-p', '--model', 'haiku', '--tools', '', '--no-session-persistence', '--disable-slash-commands', '--system-prompt-file', promptFile(system)],
      // Only this child gets the token (see config.ts); without one, claude uses your normal login.
      { cwd: tmpdir(), input: prompt, timeoutMs: 60_000, env: HAIKU_TOKEN ? { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: HAIKU_TOKEN } : process.env },
    )
    if (res.code !== 0) throw new Error((res.stderr || res.stdout || `claude exited ${res.code}`).trim().slice(0, 200))
    return res.stdout
  } finally {
    release()
  }
}

const strip = (l: string) => l.trim().replace(/^[-*>\s`"']+|[`"'\s]+$/g, '')

/** Haiku's reply -> one clean line, or null for "nothing to say". */
export function parseLine(raw: string): string | null {
  const line = raw.split('\n').map(strip).find(Boolean)
  if (!line || /^skip\.?$/i.test(line)) return null
  return line.slice(0, 140)
}

/** Haiku's reply -> a few clean lines, bounded so a runaway answer cannot flood the lane. */
export function cleanBlock(raw: string, maxLines = 6, maxChars = 700): string {
  return raw.split('\n').map(strip).filter(Boolean).slice(0, maxLines).join('\n').slice(0, maxChars)
}
