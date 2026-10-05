# agent-swarm

A local web dashboard for running Claude Code, Codex and Kiro side by side, each in its own git
worktrees across one or more repos, with a live terminal you can watch and steer, an overview per
repo, and a chat lane where a Haiku observer and a house keeper keep the swarm readable.

It runs on your machine only (bound to `127.0.0.1`).

## Requirements

| | macOS | Windows 11 |
|---|---|---|
| Node | 24 | 24 |
| pnpm | 10 | 10 |
| git | yes | [Git for Windows](https://git-scm.com/download/win) |
| tmux | yes (`brew install tmux`) | not needed |
| Agents | any of `claude`, `codex`, `kiro-cli` on PATH | same, installed natively for Windows |

Agents you have not installed are simply unavailable; the rest still work.

## Run

```bash
pnpm install
pnpm dev            # http://127.0.0.1:4317
```

For the chat lane, `claude` must be logged in, or put a long-lived token in `.env` (see `.env.example`;
mint one with `claude setup-token`). The token is only ever handed to the Haiku calls, never to agents
or repo scripts.

## How sessions run per OS

- **macOS / Linux / WSL:** each agent lives in a tmux session. Sessions survive a server restart and
  you can also `tmux attach -t swarm-<id>` from any terminal.
- **Windows 11:** there is no tmux, so the server hosts each agent's terminal itself (ConPTY). It works
  the same in the browser, but **sessions end when the server stops**; their worktrees and branches stay.

Override with `SWARM_HOST=tmux` or `SWARM_HOST=pty`.

## Check it works on your machine

```bash
pnpm smoke                 # real server, throwaway repos, every installed agent
pnpm smoke -- --haiku      # also wait for a live Haiku status line
pnpm smoke -- --pty        # force the Windows terminal host on macOS/Linux
pnpm test                  # unit tests
```

## Settings

| Variable | Default | |
|---|---|---|
| `PORT` | `4317` | |
| `SWARM_HOME` | `~/.agent-swarm` | sessions, workspaces, lane history, task worktrees |
| `SWARM_HOST` | `tmux`, or `pty` on Windows | where agent terminals live |
| `SWARM_CHATTER` | on | `off` disables the Haiku status observer |
| `SWARM_HOUSE` | on | `off` disables the house keeper |
| `CLAUDE_CODE_OAUTH_TOKEN` | unset | in `.env`; Haiku calls only |
