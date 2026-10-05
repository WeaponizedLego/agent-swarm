---
name: feature-chain
description: Drive the intent → spec → plan artifact chain before building a non-trivial feature. Creates a disposable, gitignored working folder (claude-artifacts/<slug>/) holding 01-intent.md, 02-spec.md, and 03-plan.md, written in that order with one user sign-off gate at the spec. The chain forces structured thinking before code and gives the session durable context while building; it is scratch paper, not documentation — the surviving docs are distilled later by the feature-docs skill. Use when the user says "start a feature", "new feature", "feature chain", "/feature-chain", "intent spec plan", "let's plan this feature properly", or describes a multi-step feature they want built with a plan first. Do NOT trigger for bugfixes, one-line changes, or when the user clearly just wants code written immediately.
---

# feature-chain

Before code is written, the reasoning gets written down. An agent-built feature's
"why" otherwise lives only in a context window that stops existing; the chain
captures it in three short files that stay available for the whole build and feed
the docs pass at the end.

The chain files are **disposable by design**: gitignored, never committed, thrown
away or left to rot once the feature ships. The durable version is produced by
`feature-docs`, which distills the chain into `docs/` — deliberately, by deciding
what is worth keeping.

## The chain

| File | Question it answers | Length |
|---|---|---|
| `01-intent.md` | What is the idea and why now? | ≤ half a page |
| `02-spec.md` | What must it do — and deliberately not do? | ≤ one page |
| `03-plan.md` | How does it get built? | ≤ one page |

Written strictly in order. Each file is thinking, not prose — bullets over
paragraphs, and shorter is better.

## Handoff contract (shared with feature-docs)

`01-intent.md` opens with this frontmatter. `feature-docs` locates and reads these
fields verbatim — renaming a field here silently breaks the handoff there:

```yaml
---
feature: <slug>            # equals the folder name
branch: <git branch>       # branch the feature is built on
repo: <repo name>
created: <YYYY-MM-DD>
status: draft              # draft | building | shipped
---
```

## Steps

### 1. Resolve the slug and create the folder

- If the request or branch name carries a ticket ID (e.g. `OOO-1421`), the slug is
  `<TICKET-ID>-<kebab-name>`. Otherwise `<YYYY-MM-DD>-<kebab-name>`.
- Create `claude-artifacts/<slug>/` at the repo root.
- Check the repo's `.gitignore` for a `claude-artifacts/` entry; append one if
  missing. This is the only change this skill ever makes to tracked files.

### 2. Write `01-intent.md` (status: draft)

The idea in the user's own terms: the problem, who it's for, why now, and what
"done" looks like. If the request is too thin to state an intent, ask the one or
two questions that matter — don't interrogate.

### 3. Write `02-spec.md` — the one sign-off gate

- **Must do** — concrete, testable requirements.
- **Non-goals** — what this feature deliberately does not do, each with a one-line
  reason. Absence has no syntax in code; this section is where it gets one.
- **Minimal scope check** — the smallest version that still satisfies the intent
  (ponytail's first rung: if a part doesn't need to exist, it moves to non-goals).
  If the ponytail skill is active, it applies here at full strength.
- **Open questions** — anything unresolved that could change the plan.

Present the spec summary to the user and get agreement before proceeding. This is
the only gate in the chain; everything else flows without stopping.

### 4. Write `03-plan.md`, set status: building

- An ordered checklist of implementation steps.
- The files expected to change.
- Risks and unknowns.
- The final checklist item is always, verbatim:
  `- [ ] Distil to /docs — run feature-docs`

The plan is visibly unfinished until the docs pass happens — that is deliberate.

### 5. Build

Follow the plan, checking items off as they complete. If reality diverges from the
plan, update `03-plan.md` — it's cheap, and a plan that stops matching the build is
worse than no plan. If ponytail is active, it governs the code being written; the
chain governs the process. They do not conflict.

## Hard rules

- **Never commit anything under `claude-artifacts/`.** The chain is scratch.
- **Never skip the spec gate.** Going straight from intent to plan defeats the
  skill's purpose.
- One feature per folder. Never reuse or extend a shipped folder — new work gets a
  new slug.
- Keep every file within its length budget. A chain longer than the code it
  produces is over-engineering by another name.
- This skill writes only inside `claude-artifacts/` plus the single `.gitignore`
  line in step 1.

## What this skill is NOT

- **Not documentation.** Nothing in the chain is meant to be read after the feature
  ships; that's `feature-docs`' job.
- **Not for small changes.** A bugfix or a one-liner does not get a chain.
- **Not a ticket system.** The chain records thinking for one build, not project
  state.
