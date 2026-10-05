import * as pty from 'node-pty'
import { run } from './run.ts'
import type { Terminals } from './terminals.ts'

// macOS / Linux: agents live in tmux, so they survive a server restart and you can `tmux attach` from any terminal.
const tmux = (...args: string[]) => run('tmux', args)

export const tmuxTerminals: Terminals = {
  async start(name, cwd, argv) {
    await tmux('new-session', '-d', '-s', name, '-c', cwd, '-x', '200', '-y', '50', ...argv)
    // The web UI has its own chrome; tmux's status bar would just eat a row.
    await tmux('set-option', '-t', name, 'status', 'off')
    await tmux('set-option', '-t', name, 'mouse', 'on')
  },

  async alive(name) {
    try {
      await tmux('has-session', '-t', name)
      return true
    } catch {
      return false
    }
  },

  kill: (name) => tmux('kill-session', '-t', name).then(() => {}, () => {}),

  async peek(name, lines = 12) {
    const [activity, tail] = await Promise.all([
      tmux('display-message', '-p', '-t', name, '#{window_activity}'),
      tmux('capture-pane', '-p', '-t', name, '-S', `-${lines}`),
    ])
    return { idleSecs: Math.max(0, Date.now() / 1000 - Number(activity)), tail }
  },

  // A pty running `tmux attach`, so view and steer are the same stream. Closing it only detaches.
  attach(name, cols, rows) {
    const term = pty.spawn('tmux', ['attach', '-t', name], { name: 'xterm-256color', cols, rows, env: process.env as Record<string, string> })
    return {
      onData: (cb) => void term.onData(cb),
      onExit: (cb) => void term.onExit(() => cb()),
      write: (d) => term.write(d),
      resize: (c, r) => term.resize(c, r),
      close: () => term.kill(),
    }
  },
}
