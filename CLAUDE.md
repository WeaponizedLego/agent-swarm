# CLAUDE.md

Monorepo-level guidance. This file is intentionally thin: it says **what lives
where**, **which skills govern which work**, and **how a feature moves from idea
to code to docs**. The architectural source of truth is
[`docs/architecture.html`](docs/architecture.html); per-package detail lives in
each package's own `CLAUDE.md` / `README.md`.

## Stack

- **Language:** TypeScript (strict) across the tree; Go and Python services planned.
- **Runtime:** Node 24. **Package manager: pnpm only** (never npm) — pnpm
  workspace, [`pnpm-workspace.yaml`](pnpm-workspace.yaml).
- **Frontend:** Nuxt 4 / Vue 3, Tailwind v4 + Nuxt UI, `@nuxtjs/seo`,
  `nuxt-security`, wrapped with Capacitor for Android/iOS.
- **App API:** Fastify + Zod — Zod is both request validation _and_ the OpenAPI source.
- **Data:** Supabase (Postgres); auth is a Supabase bearer JWT.
- **Testing:** Vitest in `backend/` and `frontend/`; Playwright in `e2e/`.

## Monorepo layout

- `frontend/` — Capacitor-wrapped **Nuxt 4** consumer app (pnpm package `@mealnir/consumer-frontend`).
- `backend/` — the **App API** (TypeScript / **Fastify**); the consumer app's backend (pnpm package name is still `mealnir_default_backend`, pre-dating the folder rename — that's what `--filter` commands below use).
- `admin/` — the **staff panel** (`@mealnir/admin`, admin.mealnir.dk): a client-only Nuxt 4 app, pure client of the App API's `/v1/admin/*` routes, gated server-side by staff capabilities (`backend/src/modules/staff/`). English only by design; see [`admin/CLAUDE.md`](admin/CLAUDE.md).
- `packages/theme` — the **shared Nuxt layer** (`@mealnir/theme`): design tokens, Nuxt UI overrides, fonts and the bearer-token `useApi` client. Both Nuxt apps `extends` it, so the panel and the consumer app cannot drift apart. Change a colour or font here, never in an app.
- `packages/*` — further shared packages as needed (e.g. types shared between frontend and App API).
- `e2e/` — Playwright smoke tests run against the deployed site after every merge to `master` (see [`e2e/README.md`](e2e/README.md)); not run in the local dev loop. **A change to a flow the suite covers (auth, recipe creation, shopping list) updates the matching spec in the same change** — trace every selector and assertion against the actual component markup, never against memory or assumption.
- `docs/` — architecture, business case, ontology, and the durable feature docs. `docs/architecture.html` is the source of truth.
- `claude-artifacts/` — gitignored scratch for the feature workflow below. **Never commit it.**

Planned but not yet in the tree: a **Go Dataset API** and a **Python data
pipeline** (see architecture.html). The old Nuxt full-stack **monolith** — one
app owning `server/api` + `server/services` + the database — has been
**fully retired**: `frontend/server/` no longer exists. Backend logic belongs
in the App API service, not in the Nuxt app; the Nuxt package is now a **pure
client** of the App API (see **Frontend** below).

## Commands (run from the repo root)

```bash
pnpm dev                                  # frontend dev server
pnpm -r build                             # build every package
pnpm -r test                              # test every package
pnpm --filter mealnir_default_backend dev # one package only (backend/, by pnpm package name)
pnpm format                               # Prettier across the repo
```

## How to work here

**`ponytail` is the default lens** (level: **full**): the laziest solution that
actually works. Question whether the task needs to exist (YAGNI), prefer the
shortest correct diff — but laziness runs _with_ the stack's grain:
**stdlib → framework idiom → dependency we already have → only then new code**.
The blessed way IS the lazy way here; never hand-roll a vanilla version of
something Nuxt, Nuxt UI, Fastify or Zod already ships.

## Skills in this project

Loaded from `.claude/skills/`. They route on trigger phrases, but are used
**proactively** — the moments below call for a skill even when the user doesn't
name one. **`backbone` and `schema-steward` are not optional:** for **any change
to server-side code in `backend/`** — and the future Go/Python services — they
engage automatically; you do not wait to be asked.

| Skill                     | Reach for it when                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`backbone`**            | Any server-side change. Backend house style: thin handler → service → repo; one shared Zod schema per input; every user-/visibility-scoped query enforced at the data layer; names that carry intent and comments that carry the reason.                                                                                                  |
| **`schema-steward`**      | Any new/changed table, column, index, enum, constraint, or store. Hard gate: work stops for a Schema Change Proposal ([`docs/skills/schema-steward/templates/PROPOSAL.md`](docs/skills/schema-steward/templates/PROPOSAL.md)) and explicit approval **before** a migration is written. Never add schema as a side effect of feature work. |
| **`ponytail`** (**full**) | Active by default (above). Satellites run **on demand**, not on every change: **`ponytail-review`** (diff over-engineering check), **`ponytail-audit`** (whole-repo bloat scan), **`ponytail-debt`** (ledger of deferred `ponytail:` shortcuts), **`ponytail-gain`** / **`ponytail-help`** (scoreboard / reference).                      |
| **`feature-chain`**       | The user describes a non-trivial feature to build — propose the chain before writing code. Never for bugfixes or one-liners.                                                                                                                                                                                                              |
| **`feature-docs`**        | The user says a feature is done ("wrap it up", "this is done"). Judges whether docs are warranted at all — "nothing worth keeping" is a valid outcome.                                                                                                                                                                                    |
| **`docs-as-static-html`** | Any standalone doc, runbook, or handoff page — and the rendering step of `feature-docs`. Output always lands in `docs/`.                                                                                                                                                                                                                  |

## Feature workflow

Non-trivial features go through the artifact chain before code:

```
claude-artifacts/<slug>/01-intent.md → 02-spec.md → 03-plan.md → code → feature-docs
```

- **`feature-chain`** drives it; the spec is the single user sign-off gate. A
  feature that touches the data model still stops at `schema-steward` — the
  chain plans it, the proposal approves it.
- Everything under `claude-artifacts/` is gitignored scratch — **never commit
  it**. It forces thinking before code and feeds the docs pass; the durable
  layer is `docs/`, written only by `feature-docs`, only when the feature
  warrants it.
- For docs produced by this chain, **markdown is the source of truth and the
  `.html` file is a render** — regenerate it, never hand-edit it. The
  pre-existing hand-authored pages (`architecture.html`, `business-case.html`,
  `roadmap.html`, `supabase-data-model.html`) are the exception: they have no
  markdown source and are edited directly.

## Precedence when guidance conflicts

Apply the first rule that settles it (mirrors
[architecture.html → Code Governance & Skills](docs/architecture.html)):

1. **An explicit instruction in the current request.** Always wins.
2. **The non-negotiables** below. Never simplified away.
3. **`schema-steward`** owns the data model.
4. **`backbone`** owns backend structure and readability; the frontend
   conventions below own Vue/Nuxt.
5. **The stack's own idiom** — stdlib → framework → a dependency we already have.
6. **`ponytail`** owns minimalism for everything left.

`backbone` and `ponytail` rarely actually conflict — the consistent house
pattern is usually also the shortest correct one; when they do, the tie goes to
whichever a reviewer reads faster.

## Non-negotiables

Never simplified away, regardless of ponytail level:

- **Owner/visibility scoping** on every user-scoped query, enforced at the data layer.
- **Input validation at trust boundaries** — one shared Zod schema per input.
- **Injection-safe (parameterised) queries.**
- **Error handling that prevents data loss** or corrupt state.
- **The client is never the security boundary** — the App API validates and
  authorises every request; the frontend validates for UX only. No secrets in
  client code.
- **Accessibility basics** wherever there's a UI: labels, focus order, contrast.
- **Every user-facing string translated into all three locales** (see
  **Translation** below).
- **Anything the user explicitly asked for in full** — build it, no re-arguing.
- **The tooling bans** in the last section. Ponytail's "use what's installed"
  never overrides them.

## The shortcut convention

A deliberate simplification with a known ceiling is marked inline so it gets
tracked instead of rotting silently:

```
// ponytail: <the limit>, <what triggers the upgrade>
// ponytail: in-memory cache, swap for Redis if we run >1 instance
```

Name the trigger — a shortcut with no upgrade path quietly becomes permanent.
These markers are read downstream: **`feature-docs`** harvests them into each
doc's Known Limitations section, and **`ponytail-debt`** builds its ledger from
them.

## What still earns a test

Non-trivial logic (a branch, a parser, a unit-conversion or auth path) leaves
one runnable check behind — the smallest thing that fails if the logic breaks.
Vitest in `backend/` and `frontend/` (`pnpm -r test`), Playwright in `e2e/` for
the flows that suite already covers. No elaborate fixtures unless asked; trivial
one-liners need no test.

## Frontend (`frontend`)

**Nuxt 4 / Vue 3** consumer app — Tailwind v4 + **Nuxt UI**, `@nuxtjs/seo`,
`nuxt-security`. **Capacitor is installed and in active use** (`android/`
Gradle project, `capacitor.config.ts`, `cap:sync`/`cap:android`/`cap:ios`
scripts) — see `CAPACITOR_PLAN.md` / `RUNNING_ANDROID.md`. Tests: Vitest. Dev:
`pnpm dev` (from root) or `pnpm --filter @mealnir/consumer-frontend dev`.

**The app is a pure client of the App API.** It holds _no_ backend or data
logic. Everything user-facing fetches from the App API (`backend/`) over HTTP,
authenticated with the **Supabase bearer JWT** (`Authorization: Bearer <jwt>`) —
a native/Capacitor build can't rely on same-origin cookies, so the token, not a
session cookie, is the contract.

- **There is no more `server/api`, `server/services`, `server/database`.** The
  legacy monolith has been fully removed — `frontend/server/` is empty. All
  server-side or data logic lives in the App API (`backend/`, under `backbone` +
  `schema-steward`). The old `nuxt-auth-utils` cookie sessions and Drizzle
  schema are gone with it.
- **Data layer:** Nuxt's `useFetch` / `$fetch` against the App API base URL
  (from `runtimeConfig`), attaching the bearer token — don't hand-roll an HTTP
  client. Share request/response types via `packages/*` rather than re-typing
  the API shape here.

### Frontend conventions

- Follow **Nuxt 4 directory conventions**: `app/pages` (file-based routing),
  `app/components`, `app/composables` (client logic, e.g. recipe scaling),
  `app/layouts`, `app/middleware` (route guards), `app/utils`.
- Reach for a **Nuxt UI** component + Tailwind tokens before writing custom UI,
  custom CSS, or adding a UI dependency.
- **Mobile-first:** respect safe-area insets and tap-target sizes (Capacitor is
  the target). Accessibility basics — labels, focus order, contrast — are not
  optional.
- Public/marketing routes use `@nuxtjs/seo`; the authenticated app is
  client-rendered.
- **Copy style is a hard requirement** — no em dashes, no "not just X but Y", no
  LLM filler vocabulary. Full rules in
  [`frontend/CLAUDE.md`](frontend/CLAUDE.md) under **Copy style**; they apply to
  help content, locale JSON and component strings alike.
- **Every user-facing string is translated into all three locales** — see
  **Translation** below. This is not a follow-up task.

**Skills here:** `ponytail` (**full**) applies — Vue/Nuxt idiom and Nuxt UI
before custom code or new deps. `backbone` and `schema-steward` are backend
skills; they don't govern Vue/UI, but they _do_ own all data work — which is
exactly why data work lives in the App API, not in this package.

### Translation (hard requirement)

The app ships in **English, Danish and Spanish** (`en` / `da` / `es`,
[`frontend/i18n/locales/`](frontend/i18n/locales)). **A user-facing string is not
done until it exists in all three.**

- **No hardcoded copy in components.** Every visible string — including
  `aria-label`s, placeholders, button text, empty states, toasts and error
  messages — goes through `$t()` / `t()`.
- **Add the key to `en.json`, `da.json` and `es.json` in the same change** as the
  component that uses it. English-only is a bug, not a TODO: the routing
  strategy is `prefix_except_default`, so `/da` and `/es` silently fall back to
  English and the page just looks half-finished.
- **Translate the meaning, not the words.** These are the same `da`/`es` copy
  standards the landing page was held to — idiomatic over literal, matching the
  house vocabulary already in the locale files (Danish `spisekammer`, Spanish
  `despensa`, etc.). Spanish targets **es-ES**.
- **Emphasis inside a sentence uses `<I18nT>` slots**, never a string split into
  fragments — each language decides its own word order, and a sentence glued
  together from pieces can't be reordered. See
  [`frontend/app/pages/about.vue`](frontend/app/pages/about.vue) or
  [`frontend/app/components/landing/Hero.vue`](frontend/app/components/landing/Hero.vue).
- **Where a translation needed a judgment call** (idiom, register, a pun that
  doesn't carry), log it in
  [`frontend/i18n/TRANSLATION_REVIEW.md`](frontend/i18n/TRANSLATION_REVIEW.md)
  so a native speaker can review it. The `da`/`es` copy is an AI first draft and
  is treated as such.

**The exceptions:** the legal pages (`/privacy`, `/terms`) are deliberately
**English-only** — English governs, and a translated copy that disagrees with it
is a liability. They stay unprefixed and every locale links to the same one. The
**staff panel (`admin/`)** is English-only too: an internal tool for a handful of
staff, with no i18n module at all (the copy-style rules still apply there).

## The API contract is the boundary

[`backend/openapi.json`](backend/openapi.json)
is the single contract between the App API and the frontend. It is **generated
from the App API's Zod route schemas — never hand-edited.**

- The **App API** regenerates it with
  `pnpm --filter mealnir_default_backend spec:generate` after a route schema
  changes, and serves the same spec interactively at **`/docs`** (Swagger UI,
  dev only) — no Postman needed.
- The **frontend** consumes it with
  `pnpm --filter @mealnir/consumer-frontend type:sync`, which regenerates
  `frontend/app/types/api.ts`.
- `openapi.json` and `api.ts` are committed **together, in the same change** as
  the code that altered the contract.
- The frontend must never call an endpoint that isn't in the current
  `openapi.json`.

The Zod schema is the one source — it validates the request _and_ defines the
spec, so there's no second definition to keep in sync. Change the schema, run
`spec:generate`, and both the contract and the frontend types follow.

## Working inside a package

Each package carries its own `CLAUDE.md` and/or `README.md` with its stack and
conventions — read it before changing code there (e.g.
[`backend/CLAUDE.md`](backend/CLAUDE.md)).

## GitHub (`gh` CLI)

- **Allowed freely:** reading issues (`gh issue view` / `gh issue list`) to
  pull work into a session.
- **Allowed with explicit consent first:** creating or updating issues. Ask,
  wait for a yes, then act.
- **Never:** committing or pushing to GitHub. The `gh` CLI is for looking at
  issues only — no PRs, no releases, no repo mutations.

## Tooling bans (hard)

- **pnpm only.** Never `npm install`, `npm run`, or `package-lock.json`.
  Ponytail's "use what's installed" never overrides this.
- **Supply-chain policy:** a dependency version must be published ≥7 days
  (`minimumReleaseAge`, [`pnpm-workspace.yaml`](pnpm-workspace.yaml)) before it
  enters a build. Don't bypass without a deliberate, named exclusion.
