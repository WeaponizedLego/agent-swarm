import headless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'
import * as pty from 'node-pty'
import { launchArgv } from './agents.ts'
import type { Attachment, Terminals } from './terminals.ts'

const { Terminal } = headless
const { SerializeAddon } = serialize

/**
 * Windows (no tmux): the server owns each agent's terminal directly, through ConPTY. A headless xterm
 * mirrors every screen so the dashboard can read it (status lines) and re-attach a browser (replay).
 * ponytail: sessions live in this process, so a server restart ends them; move them into a small
 * detached daemon if losing sessions on restart becomes a real problem
 */

type Live = {
  proc: pty.IPty
  screen: InstanceType<typeof Terminal>
  serializer: InstanceType<typeof SerializeAddon>
  lastOutput: number
  data: Set<(d: string) => void>
  exit: Set<() => void>
}

const live = new Map<string, Live>()
const COLS = 200
const ROWS = 50

/**
 * Replies a terminal sends back when a program queries it: cursor position, device attributes, colours,
 * mode reports. The headless screen answers these (as tmux does), so the same replies coming from an
 * attached browser's xterm are dropped; otherwise the agent gets each answer twice, the second as stray input.
 */
const TERMINAL_REPLY = /\x1b\[\??\d+;\d+R|\x1b\[[?>][\d;]*c|\x1b\]\d+;[^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[\??[\d;]*\$y/g
export const stripTerminalReplies = (input: string) => input.replace(TERMINAL_REPLY, '')

export const ptyTerminals: Terminals = {
  async start(name, cwd, argv) {
    const [file, ...args] = launchArgv(argv)
    // COLORTERM tells agents the browser's xterm can show 24-bit colour; without it Claude Code falls back to 256.
    const env = { ...process.env, COLORTERM: 'truecolor' } as Record<string, string>
    const proc = pty.spawn(file!, args, { name: 'xterm-256color', cols: COLS, rows: ROWS, cwd, env })
    const screen = new Terminal({ cols: COLS, rows: ROWS, scrollback: 1000, allowProposedApi: true })
    const serializer = new SerializeAddon()
    screen.loadAddon(serializer)
    const s: Live = { proc, screen, serializer, lastOutput: Date.now(), data: new Set(), exit: new Set() }
    proc.onData((d) => {
      s.lastOutput = Date.now()
      screen.write(d)
      for (const cb of s.data) cb(d)
    })
    // Answer the program's terminal queries even when no browser is attached: codex, for one,
    // asks for the cursor position at startup and exits when nobody replies.
    screen.onData((reply) => proc.write(reply))
    proc.onExit(() => {
      live.delete(name)
      for (const cb of s.exit) cb()
      screen.dispose()
    })
    live.set(name, s)
  },

  alive: async (name) => live.has(name),

  async kill(name) {
    const s = live.get(name)
    if (!s) return
    live.delete(name)
    s.proc.kill()
  },

  async peek(name, lines = 12) {
    const s = live.get(name)
    if (!s) throw new Error(`session ${name} is not running`)
    // Same shape as tmux's `capture-pane -S -<lines>`: the visible screen plus `lines` of scrollback.
    const buf = s.screen.buffer.active
    const out: string[] = []
    for (let i = Math.max(0, buf.length - s.screen.rows - lines); i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '')
    return { idleSecs: (Date.now() - s.lastOutput) / 1000, tail: out.join('\n') }
  },

  attach(name, cols, rows): Attachment {
    const s = live.get(name)
    if (!s) throw new Error(`session ${name} is not running`)
    let dataCb: ((d: string) => void) | undefined
    let exitCb: (() => void) | undefined
    const onData = (d: string) => dataCb?.(d)
    const onExit = () => exitCb?.()
    s.data.add(onData)
    s.exit.add(onExit)
    return {
      onData(cb) {
        dataCb = cb
        cb(s.serializer.serialize()) // replay the current screen, as `tmux attach` would
      },
      onExit: (cb) => void (exitCb = cb),
      write(d) {
        const input = stripTerminalReplies(d)
        if (input) s.proc.write(input)
      },
      resize(c, r) {
        // One real terminal, possibly several viewers: the most recent resize wins.
        s.proc.resize(c, r)
        s.screen.resize(c, r)
      },
      close() {
        s.data.delete(onData)
        s.exit.delete(onExit)
      },
    }
  },
}
