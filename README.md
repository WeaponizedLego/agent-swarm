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

## Plan usage

The header shows how much of your Claude plan is used (the 5-hour and 7-day windows, plus monthly credits if
usage-based billing is on). Hover a bar for what is left and when it resets. It reads the login Claude Code
already keeps in `~/.claude/.credentials.json` and asks Anthropic's (undocumented) usage endpoint, at most once a
minute. The token is never logged or sent to the browser. If you are signed out or the login has expired, run
`claude` once. On macOS the login lives in the keychain, so there is no usage display there yet. Codex and Kiro
are not covered yet.

## Skills

The skill collection is a folder of skills, one subfolder each with a `SKILL.md` (this repo's `skills/` by default, or
point `SWARM_SKILLS` elsewhere). **Skills** in the header manages it without a session: tick the skills that new
sessions get by default, view a `SKILL.md`, delete a skill, or import one skill (or a folder of skills, such as
`~/.claude/skills`) from a path. Import never overwrites a skill that is already there. To edit a skill, edit its
folder in the collection with your editor.

**New session** shows the same checkboxes. The ones you tick are copied into the session's task folder
(`.claude/skills` for Claude Code) before the agent starts, so only those skills are loaded. Your ticks are
remembered for the next launch (`~/.agent-swarm/skills.json`). It is a copy, so editing or deleting a skill later does
not change a running session. Folders without a `SKILL.md` are not listed.

**Changes** in a session shows what its agent changed, written by the `change-map` skill: cards by intent, a diagram
of the parts that moved, where the edits landed, and the raw diff. Tick `change-map` at launch, then ask the agent for
a map (the tab has a button for it).

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
| `SWARM_SKILLS` | this repo's `skills/` | the shared skill collection, see below |
| `SWARM_HOST` | `tmux`, or `pty` on Windows | where agent terminals live |
| `SWARM_CHATTER` | on | `off` disables the Haiku status observer |
| `SWARM_HOUSE` | on | `off` disables the house keeper |
| `CLAUDE_CODE_OAUTH_TOKEN` | unset | in `.env`; Haiku calls only |
