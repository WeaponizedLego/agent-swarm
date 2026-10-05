---
name: feature-docs
description: Wrap up a finished feature by deciding whether it deserves documentation and, if so, distilling its feature-chain artifacts (intent/spec/plan) plus any `ponytail:` shortcut markers in the diff into a permanent doc — docs/<slug>.md as markdown source of truth, rendered to a static HTML page via the docs-as-static-html skill. Saying "nothing worth keeping here" is a first-class outcome. Use when the user says a feature is done: "wrap up the feature", "this is done", "feature is finished", "distil to docs", "docs pass", or "/feature-docs". Do NOT trigger for writing docs from scratch on request (use docs-as-static-html directly) or while a feature is still being built.
---

# feature-docs

The last step of the feature chain. `feature-chain` produced disposable thinking
files; this skill decides what survives. It reads the chain, judges whether the
feature warrants a doc at all, and if yes, distills the essentials into `docs/` —
markdown as the source of truth, with a terminal-retro HTML render on top.

Deliverables: `docs/<slug>.md` and its render `docs/<slug>.html` (or a page added
to an existing multi-page set). This skill does not modify source code, run tests,
or commit anything.

## Handoff contract (shared with feature-chain)

The chain folder is found via the frontmatter of `claude-artifacts/*/01-intent.md`:

```yaml
feature: <slug>
branch: <git branch>
status: draft | building | shipped
```

These field names are read verbatim — if `feature-chain` renames one, this skill
breaks silently. Keep them in sync.

## Steps

### 1. Locate the chain

- Read the current branch: `git branch --show-current`.
- Scan `claude-artifacts/*/01-intent.md` for a frontmatter `branch:` matching it.
- No match → fall back to the most recently modified folder with
  `status: building`. Still ambiguous → ask the user which feature is being
  wrapped up; do not guess.
- No chain at all → this feature was built without one. Say so and offer to distil
  from the diff alone (steps 3–5, with the git log standing in for intent).

### 2. Judge: does this feature warrant a doc?

Write a doc only if the feature introduces something a teammate — or a future
agent session — would otherwise have to re-derive: a new concept, an architectural
decision, operational knowledge, a non-obvious constraint.

Routine changes (a CRUD endpoint shaped like every other, a dependency bump, a
straightforward extension of a documented pattern) do **not** get a doc. In that
case: tell the user "nothing worth keeping here" with a one-line reason, set
`status: shipped` in `01-intent.md`, and stop. A `docs/` folder people trust beats
a full one they ignore — this outcome is success, not failure.

### 3. Harvest the diff

```bash
default=$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')
git diff "$default"...HEAD --name-only
```

Grep the changed files for `ponytail:` markers. Each one is a deliberate shortcut
with a named ceiling and upgrade trigger — exactly the "known limitations" content
the code alone can't carry. Collect them with file:line references.

### 4. Distil `docs/<slug>.md`

Write for a reader six months out who has only the code. Sections, all short:

- **What & why** — from `01-intent.md`. The problem and why it was worth solving.
- **Key decisions** — from `02-spec.md`, especially the non-goals: what was
  deliberately not built, and why. Rejected alternatives are the highest-value
  content here; they're what the next person will otherwise re-litigate.
- **How it works** — a few paragraphs at most, pointing into the code by path
  rather than duplicating it.
- **Known limitations** — the harvested `ponytail:` markers, each with its upgrade
  trigger.

The doc must be substantially shorter than the chain. Distillation means deciding
what to drop, not reformatting.

### 5. Render via docs-as-static-html

Invoke the `docs-as-static-html` skill on the markdown content:

- **Feature docs are single-page.** Override that skill's multi-page default — one
  feature, one page.
- If `docs/` already holds a multi-page set with a nav-grid index: add a card for
  this page to the index, then rebuild the cross-page search index and re-embed it
  into **every** page of the set (that skill's step 3b embeds the full index in
  each page — skipping this leaves the new page invisible to search from the old
  ones).
- Keep `docs/<slug>.md` next to the render. Markdown is the source of truth; the
  HTML is a view and is regenerated from it, never hand-edited.

### 6. Close out

- Set `status: shipped` in the chain's `01-intent.md`.
- Check off the plan's final item (`Distil to /docs`).
- Offer — do not auto-write — a condensed version for the PR description if a PR
  is open.

## Hard rules

- Never delete the chain folder; cleanup is the user's call.
- Never edit the generated `.html` directly — change the `.md` and re-render.
- Never pad a doc to justify its existence. If step 2 says no, the answer is no.
- Do not re-review or re-grade the code; that is critical-review's territory.

## What this skill is NOT

- **Not a general doc generator.** It documents one just-finished feature from its
  chain; for arbitrary docs requests, use `docs-as-static-html` directly.
- **Not a changelog.** Git history already records what changed and when.
- **Not automatic.** It runs when the user says the feature is done, and its first
  real act is judging whether to write anything at all.
