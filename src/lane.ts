import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME } from './config.ts'

export type LaneMessage = {
  id: number
  ts: string
  sessionId: string
  task: string
  agent: string
  kind: 'status' | 'event' | 'system' | 'house' | 'user'
  text: string
}

const FILE = join(HOME, 'lane.jsonl')
const KEEP_IN_MEMORY = 500

// ponytail: append-only JSONL, only the last 500 held in memory; rotate the file or move to SQLite once it is large or needs search
function load(): LaneMessage[] {
  try {
    return readFileSync(FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-KEEP_IN_MEMORY)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as LaneMessage]
        } catch {
          return [] // one torn line must not hide the rest of the history
        }
      })
  } catch {
    return []
  }
}

let messages = load()
let nextId = (messages.at(-1)?.id ?? 0) + 1

export function post(m: Omit<LaneMessage, 'id' | 'ts'>) {
  const full: LaneMessage = { ...m, id: nextId++, ts: new Date().toISOString() }
  messages = [...messages, full].slice(-KEEP_IN_MEMORY)
  mkdirSync(HOME, { recursive: true })
  appendFileSync(FILE, `${JSON.stringify(full)}\n`)
  return full
}

export const since = (after: number) => messages.filter((m) => m.id > after)
