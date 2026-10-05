import { z } from 'zod'
import { ptyTerminals } from './pty-host.ts'
import { tmuxTerminals } from './tmux.ts'

/** Where agent terminals live. One interface, so sessions, the observer and the web terminal never care which. */
export type Attachment = {
  onData(cb: (d: string) => void): void
  onExit(cb: () => void): void
  write(d: string): void
  resize(cols: number, rows: number): void
  close(): void
}

export type Terminals = {
  start(name: string, cwd: string, argv: string[]): Promise<void>
  alive(name: string): Promise<boolean>
  kill(name: string): Promise<void>
  /** Seconds since the terminal last produced output, plus its visible screen and `lines` of scrollback. */
  peek(name: string, lines?: number): Promise<{ idleSecs: number; tail: string }>
  attach(name: string, cols: number, rows: number): Attachment
}

// tmux where it exists (macOS, Linux, WSL); the in-process ConPTY host on Windows. SWARM_HOST overrides either way.
export const TERMINAL_HOST = z
  .enum(['tmux', 'pty'])
  .parse(process.env.SWARM_HOST ?? (process.platform === 'win32' ? 'pty' : 'tmux'))

export const terminals: Terminals = TERMINAL_HOST === 'tmux' ? tmuxTerminals : ptyTerminals
