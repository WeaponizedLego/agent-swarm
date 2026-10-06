---
name: change-map
description: >
  Explain what a session changed so a person can take it in at a glance instead of reading a wall of diff.
  Git supplies the facts, you write the story (cards by intent with before/after, a Mermaid map of the
  parts that moved, "look here first" hotspots, a check-it list), and the agent-swarm dashboard draws
  it in the session's CHANGES tab with a file mosaic and the raw diff underneath. A check flags any
  changed file the story leaves out, so nothing hides. Use when the user asks "what did you change",
  "what changed", "show me the changes", "recap the session", "visualise the diff", "change map",
  "walk me through this", or "/change-map". Also offer it (one line, don't run it unasked) after
  finishing a change that touched more than about 5 files or 200 lines.
---

# change-map

Reading a large diff line by line is the slow way to learn what happened. This skill turns the
session's changes into a map the user reads in the agent-swarm dashboard: open the session, press
**CHANGES**.

Division of labour: **git supplies the facts, you supply the meaning, the dashboard draws it.**
You write `story.json` and nothing else; no HTML, no styling.

The dashboard reads the files and diff **live from git** every time the tab loads, so those are never
out of date. Your story is checked against the `facts.json` snapshot you collected before writing
it: when the code has changed since, the tab shows which files moved on and offers **UPDATE THE
STORY**. So always run `collect` right before writing or updating the story, never reuse an old
snapshot.

## 1. Collect

Run the script that sits next to this file. Anywhere inside a swarm session works: it finds the task
dir and covers every repo worktree in it, and writes to `.change-map/` there, where the dashboard
looks.

```bash
node <this skill's folder>/scripts/change-map.mjs collect
```

In a swarm session the skill folder is `.claude/skills/change-map` (Claude Code) or
`.agents/skills/change-map` (Codex). Requires only Node and git.

It prints, per repo, the base it compared against, then one line per changed file:
status, `+added -deleted`, and declarations it spotted (`+new`, `-removed`, `~changed`).
Untracked files count as added. It writes `facts.json` to the output folder it names.

**The base** is "this session": where the `swarm/*` branch was created, else the fork point from
main, else `HEAD` (uncommitted work only). If the user means something else ("since yesterday",
"just the last commit"), rerun with `--base <ref>`.

## 2. Understand

The summary is a map, not the understanding. Before writing a word of story:

- Read the real diff for every file that matters (`git -C <repo> diff <base> -- <path>`; the
  summary prints the exact command). Biggest churn and public surfaces first.
- Use what you know from the session about *why* each change was made. If you did not make the
  change and the reason isn't in the code or commits, say the reason is unknown. Never invent one.
- Group by **intent, not by file**. One card is one thing a person would say out loud:
  "alerts now pop on the desktop", not "edited app.js".

## 3. Write `story.json`

Next to `facts.json`. Shape (the dashboard rejects a file that does not fit it, and says why):

```json
{
  "title": "Short headline of the whole session",
  "tldr": "One or two plain sentences: what is different for someone using or maintaining this.",
  "changes": [
    {
      "kind": "feature",
      "title": "Desktop alerts when a session needs you",
      "what": "What now happens, in plain words. `inline code` is allowed.",
      "why": "The reason, or leave it out if unknown.",
      "before": "Optional one-liner of the old behaviour",
      "after": "Optional one-liner of the new behaviour",
      "risk": "low | medium | high",
      "files": ["public/app.js"]
    }
  ],
  "diagrams": [
    { "title": "Opening the New session form", "caption": "Optional one line", "mermaid": "flowchart LR\n  a[Button]:::ctx --> b[showView]:::added" }
  ],
  "hotspots": [{ "file": "src/store.ts", "line": 10, "why": "What a reviewer should check here and why" }],
  "verify": ["A concrete step a person can do to see it working"]
}
```

**`kind`** picks the card's tag and colour: `feature` `[+] NEW`, `fix` `[!] FIX`, `refactor`
`[~] REFACTOR`, `removal` `[-] REMOVED`, `test`, `config`, `deps`, `docs`, `style`, `security`,
`perf`, `chore`.

**`files`** use the paths exactly as `collect` printed them (repo-prefixed when there are several
repos). **Every changed file belongs to at least one card.** Sweep small leftovers into one `chore`
card rather than dropping them. `check` (step 4) enforces this both ways; it is the map's
guarantee that nothing hides.

**Cards:** 3 to 8 for a normal session. Fewer if it was small; one card is fine. Lead with what
matters most to the reader, not the order you did things in.

**Diagrams** are the main visual aid; get them right rather than many.
- One diagram of the parts involved and how they connect. Mark each node with its status class:
  `:::added`, `:::changed`, `:::removed`, and `:::ctx` for unchanged neighbours that give context
  (the dashboard colours them and adds a legend; only `flowchart`/`graph` get the classes).
- Label edges with what flows along them (a call, an event, a route).
- At most about 15 nodes. Name nodes by role ("session form", "lane poll"), not file paths.
- The dashboard panel is about 800px wide and draws diagrams at full size, scrolling sideways
  rather than shrinking them. So use `flowchart TB` for more than about 6 nodes, keep labels short,
  and use `subgraph`s to group, rather than one long left-to-right chain.
- Add a second diagram only when it shows something the first can't: a `sequenceDiagram` for a
  changed runtime flow, or a before/after pair when the structure itself was rerouted.
- Skip diagrams entirely for a change with no structure to show (copy edits, a config bump).

**Hotspots** are where a careful reviewer should spend their first five minutes, most important
first: trust boundaries, data that could be lost or corrupted, changed public contracts, behaviour
that flipped, deleted tests, anything you were unsure about. Two to five. None is fine if none exist.

**Verify** steps are things a person can actually do, with the expected result. Say plainly what
you did not run or test.

## 4. Check and hand over

```bash
node <this skill's folder>/scripts/change-map.mjs check
```

It lists changed files no card explains and story files that did not change, and exits non-zero
until both lists are empty. Fix `story.json` and run it again. The dashboard shows the same check
as a red panel, so a map with gaps is visible to the user too.

Then tell the user in chat: the map is in the session's **CHANGES** tab (it refreshes itself), plus the TL;DR and the top hotspot, so they get the gist without switching tabs.

The user can also press a button in that tab that types a request into your terminal: **ASK THE
AGENT FOR THE STORY** when there is none, **UPDATE THE STORY** when the code moved on after it was
written. For an update, run `collect` again, read the diffs of the files that changed since, and
rewrite only the cards, diagrams, hotspots and checks they affect; keep what is still true. The tab
picks the new story up on its own within about 20 seconds.

## Boundaries

- Describes changes; does not review them for correctness and does not edit code. Use a review
  skill for that.
- Writes nothing into any worktree and commits nothing. Outside a swarm session the files go in the
  repo's git dir (`.git/change-map/`), where no dashboard reads them; say so if that is the case.
- The declaration list is a regex heuristic: good for orientation, not proof. Check the diff before
  claiming a symbol was added or removed.
