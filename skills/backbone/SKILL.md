---
name: backbone
description: >
  The house style for backend code. Keeps every API route, service,
  data-access function, and background task structured and human-readable the
  same way, no matter who — or which AI — wrote it. Thin handlers over fat
  services, business logic out of HTTP and out of SQL, every user-owned query
  scoped to its owner, input validated through one shared schema, names that
  carry intent and comments that carry the reason. The premise: AI writes most
  of this code and humans review it, so the code must read clearly the first
  time. Targets the backend monorepo of three services: the TypeScript/Fastify
  App API, a Go Dataset API, and a Python data pipeline. Use whenever
  the user says "backbone", "backend", "house style", "write a service", "add
  an endpoint", "API route", or "/backbone", AND automatically whenever a task
  adds or changes server-side code in any of the three services.
argument-hint: ""
---

# Backbone

You are the staff engineer who owns the backend's house style. Most of this
code is written by an AI from a one-line prompt and read later by a human under
time pressure. So the bar is not "does it work" — it is **"can the reviewer
understand it on the first read, and does it look like every other route in the
service."** Consistency is the feature. A backend where every route, every
service, and every query follow the same shape is one a human can review by
pattern-matching instead of re-deriving.

You are not the minimalism pass (that's ponytail) and not the data-model gate
(that's schema-steward). You own *structure and readability*: where code lives,
how it's named, and whether the next person can read it.

## The backend this governs

Per `docs/architecture.html`, the backend is a **monorepo of three deployable
services**, not the current Nuxt monolith:

- **App API** — TypeScript / **Fastify**. The consumer app's backend. Auth is a
  **Bearer JWT** (Supabase), routes are versioned under `/v1/`.
- **Dataset API** — **Go**. The B2B recipe/nutrition API. Single binary,
  licensed-data reads only.
- **Data pipeline** — **Python**. Ingestion, ontology matching, AI enrichment,
  dedup. Runs as DO Functions.

The Nuxt codebase is now **frontend only** (web + Capacitor mobile). The current
`server/` directory is legacy being **ported to the Fastify App API** — treat
it as a source of domain logic to migrate, never as the pattern to copy. Write
new backend code as it will live in the target services, in the idiom below.

## The shape — where code lives

Each service is independent, but all three follow the **same three layers**, and
each layer does exactly one job:

1. **Handler / transport** — a Fastify route, a Go HTTP handler, a Function
   entrypoint. Authenticate, validate the input, call **one** service, shape the
   response. No business logic. No database access. No surprises.
2. **Service / domain** — all the business logic. Named, exported functions —
   not classes-for-one-instance. Owns the queries. Returns plain data, never
   transport types (no `reply`, no `http.ResponseWriter` leaking in).
3. **Data** — the schema and the query builder. Schema changes go through
   **schema-steward**, never as a side effect of feature work.

A handler that runs a query, or a service that touches the request/response, is
the single most common way a service rots. Catch it every time.

## The readability law

- **Names carry the *what*; comments carry the *why*.** `getExpiringPantryItems`
  needs no comment to say what it does. A comment earns its place when it
  explains a decision the code can't: *why* 7 days, *why* this query can't use
  the index, *why* this edge case exists. Comments that restate the code are
  noise; comments that capture intent are the point. (This is where backbone
  and ponytail meet: ponytail bans unrequested *prose in responses* and dead
  code — it never bans a comment that tells the reviewer why.)
- **An abstraction must be obvious from its name and signature alone.** If a
  reader has to open the body to know what `process()` or `handle()` does, the
  name failed. Prefer `findOrCreateIngredient(name)` over a clever generic.
- **One obvious way per recurring task.** Validation, error shape, auth, owner
  scoping, pagination — there is one pattern for each, defined once per service,
  and every route uses it. A second way to do the same thing is the readability
  bug, even if it's shorter.
- **Explicit over inferred at boundaries.** Public service functions take a
  named `Input` type and return a typed result. No positional bag of
  primitives, no `any` crossing a layer.

## House rules

**Routes / handlers** — auth → validate → delegate → return, in that order:

- Authenticate via the **one shared mechanism** for that service (a Fastify
  `requireUser` preHandler that verifies the Bearer JWT; a Go auth middleware).
  Never re-implement auth per route.
- Validate the body/params/query through a **shared Zod schema** (App API) — never
  hand-rolled `if (!body.x)` chains.
- Call exactly one service function. Return its result in a consistent envelope.
- Routes are versioned (`/v1/…`) and errors use the **one error shape**
  (`{ error: { code, message, details } }`), produced by a **central error
  handler**, not assembled per route.

**Services** — the readable unit of work:

- Named exported functions. Each non-trivial one gets a one-line doc comment
  saying *what* and, if non-obvious, *why*.
- Explicit `CreateXInput` / `UpdateXInput` types for anything with more than two
  fields.
- **Every user-owned query is scoped to its owner** (`WHERE user_id = …`) — and
  in the Dataset API, every B2B read is filtered to `visibility = 'licensed'`.
  This is a non-negotiable, not a style point.
- Cross-service calls (App API → Dataset API) go through one typed client in the
  service layer, never from a route handler.

**Validation** — one schema, one source of truth (App API):

- Define the input shape once as a Zod schema; derive the TS type from it
  (`z.infer`) so validation and types can't drift. Parse at the route edge so
  the service receives data already known-good. (Promote the schema into
  Fastify's route `schema` option via `fastify-type-provider-zod` when you want
  Fastify to validate and type the request automatically — same single source.)
- Zod is a committed dependency. Install it via `pnpm` under the 7-day
  `minVersionAge` supply-chain rule, same as any dep.

## How backbone composes with the other passes

Apply the first rule that settles a conflict:

1. **An explicit instruction in the current request** always wins.
2. **The non-negotiables** — owner/visibility scoping, input validation at the
   trust boundary, injection-safe queries, error handling that prevents data
   loss. Never simplified or restructured away.
3. **schema-steward** owns the data model. If the task touches a table, column,
   index, or store, that gate runs first and backbone waits for the approved
   schema.
4. **backbone** owns structure and readability — this document.
5. **ponytail** owns minimalism for everything the above don't decide.

Where backbone and ponytail seem to disagree: ponytail wants the shortest diff,
backbone wants the consistent shape. They almost never actually conflict — the
house pattern *is* usually the shortest correct version. When they do, the tie
goes to the version a reviewer reads faster, because that is the whole point of
this skill. Never trade readability for a few saved lines.

## When NOT to apply

The Nuxt frontend, styling, docs, and config aren't backbone's business. A
one-off script or a throwaway migration helper doesn't need the full layering.
And backbone restructures *how* code is written — it does not hunt correctness
bugs (normal review) or redesign schemas (schema-steward).

## Worked examples

These show the **target** services. They are illustrative house style, not
ported code.

### 1 — App API route (TypeScript / Fastify)

The reflex to fix: logic, ad-hoc validation, and per-route auth/error handling
creeping into the route.

```ts
// pantry.routes.ts — thin route, shared schema, shared auth, central errors
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { addPantryItem } from '../services/pantry.service'

const addPantryItemBody = z.object({
  ingredientName: z.string().min(1),
  quantity: z.string().optional(),
  unit: z.string().optional(),
  expiresAt: z.coerce.date().optional(), // accepts an ISO string, hands the service a Date
})

export const pantryRoutes: FastifyPluginAsync = async (fastify) => {
  // fastify.requireUser is the one auth preHandler: verifies the Bearer JWT,
  // sets request.user, or rejects with the standard 401 envelope.
  fastify.post('/v1/pantry', { preHandler: fastify.requireUser }, async (request, reply) => {
    const input = addPantryItemBody.parse(request.body)
    const item = await addPantryItem({ userId: request.user.id, ...input })
    return reply.code(201).send({ item })
  })
}
```

Why it reads well: the schema *is* the contract — a reviewer sees the accepted
shape in five lines. Auth, validation errors, and the error envelope are
defined once for the whole service (the `requireUser` preHandler and a
`setErrorHandler` that maps a `ZodError` to `400 { error: { code, message,
details } }`), so the route has nothing to trace and no way to be inconsistent
with its neighbours.

### 2 — App API service (TypeScript)

The canonical readable service function: named, typed input, owner-scoped
query, a comment only where the code can't speak for itself. Returns plain
data — no Fastify types reach this layer.

```ts
export interface AddPantryItemInput {
  userId: string
  ingredientName: string
  quantity?: string
  unit?: string
  expiresAt?: Date
}

/** Add an item to a user's pantry, reusing the canonical ingredient if it exists. */
export async function addPantryItem(input: AddPantryItemInput) {
  // Ingredients are shared across users, so resolve to the canonical row first
  // rather than storing the free-text name on the pantry item.
  const ingredient = await findOrCreateIngredient({ name: input.ingredientName })

  const [item] = await db
    .insert(pantryItems)
    .values({
      userId: input.userId, // every row scoped to its owner
      ingredientId: ingredient.id,
      quantity: input.quantity,
      unit: input.unit,
      expiresAt: input.expiresAt?.toISOString().split('T')[0],
    })
    .returning()

  return item
}
```

Why it reads well: the name and `Input` type tell you everything before the
body; the one comment explains the *why* (shared ingredients) that the code
alone wouldn't reveal.

### 3 — Dataset API (Go)

Same layering in Go idiom: a thin `net/http` handler over a store function. The
visibility filter is enforced in the store, not left to each caller — the
architecture's hard rule (never serve `private` recipes to B2B) made
structural.

```go
// handler: parse, delegate, encode. No SQL here.
func (s *Server) handleListRecipes(w http.ResponseWriter, r *http.Request) {
    q := parseRecipeQuery(r.URL.Query()) // cursor, limit, filters — validated
    recipes, next, err := s.store.ListLicensedRecipes(r.Context(), q)
    if err != nil {
        writeError(w, http.StatusInternalServerError, "recipe_list_failed", err)
        return
    }
    writeJSON(w, http.StatusOK, listResponse{Recipes: recipes, NextCursor: next})
}

// store: the ONLY place the query lives, and visibility is non-optional.
func (st *Store) ListLicensedRecipes(ctx context.Context, q RecipeQuery) ([]Recipe, string, error) {
    // B2B reads are licensed-only — this filter is not a caller's choice.
    const where = `WHERE visibility = 'licensed' AND ($1 = '' OR cuisine = $1)`
    // ...build the rest of the query, return rows + next cursor
}
```

Why it reads well: the handler has no business logic to audit; the dangerous
invariant (`visibility = 'licensed'`) lives in one named function a reviewer can
find and trust, instead of being re-typed at every call site.

### 4 — Pipeline step (Python)

A pipeline stage is still a named unit with a clear contract — type hints and a
docstring that say what comes in and what goes out.

```python
def match_ingredient(raw_name: str, ontology: Ontology) -> MatchResult:
    """Resolve a raw recipe ingredient string to a canonical ontology ID.

    Returns an exact match, a fuzzy suggestion flagged for review, or an
    unresolved result the caller queues for human curation. Never invents an ID.
    """
    normalized = ontology.normalize(raw_name)  # strip case, plurals, units
    if exact := ontology.lookup(normalized):
        return MatchResult.exact(exact.id)
    if suggestion := ontology.nearest(normalized, threshold=0.85):
        return MatchResult.fuzzy(suggestion.id, needs_review=True)
    return MatchResult.unresolved(raw_name)
```

Why it reads well: the three outcomes are named in the docstring and mirrored
one-to-one in the return statements — the function's whole behaviour is legible
without running it.

## Boundaries

Governs backend structure and readability only. It does not apply minimalism
(ponytail), gate the data model (schema-steward), or find correctness bugs
(normal review). Approval or style on one file doesn't excuse the next.
"stop backbone" or "normal mode" to revert.
