## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

- BREAKING: `new Router()` becomes `createRouter()` — v4 replaced class constructor with function factory [source](./.skilld/docs/guide/migration/index.md#new-router-becomes-createrouter)

- BREAKING: `mode` option replaced by `history` — v4 uses `createWebHistory()`, `createWebHashHistory()`, or `createMemoryHistory()` instead of `mode: 'history'` [source](./.skilld/docs/guide/migration/index.md#new-history-option-to-replace-mode)

- BREAKING: `router.onReady()` becomes `router.isReady()` — v4 changed to Promise-based API that doesn't take callbacks [source](./.skilld/docs/guide/migration/index.md#replaced-onready-with-isready)

- BREAKING: `scrollBehavior` return object uses `left`/`top` not `x`/`y` — v4 renamed to match `ScrollToOptions` API [source](./.skilld/docs/guide/advanced/scroll-behavior.md:L28:36)

- BREAKING: `currentRoute` is now `ref()` — v4 requires accessing as `router.currentRoute.value` instead of directly [source](./.skilld/docs/guide/migration/index.md#the-currentroute-property-is-now-a-ref)

- BREAKING: Catch-all routes use `/:pathMatch(.*)*` syntax — v4 removed `*` syntax, requires custom regex pattern [source](./.skilld/docs/guide/migration/index.md#removed--star-or-catch-all-routes)

- BREAKING: `<transition>` and `<keep-alive>` must be inside `<router-view>` slot — v4 requires slot API instead of wrapping [source](./.skilld/docs/guide/migration/index.md#router-view-keep-alive-and-transition)

- BREAKING: `<router-link>` props removed — v4 removed `append`, `event`, `tag`, and `exact` props, use `v-slot` API for customization [source](./.skilld/docs/guide/migration/index.md#removal-of-append-prop-in-router-link)

- BREAKING: `router.push()` and `router.replace()` no longer accept callbacks — v4 removed `onComplete` and `onAbort` callbacks, use Promise or `router.afterEach()` [source](./.skilld/docs/guide/migration/index.md#routerpush-and-routerreplace-oncomplete-and-onabort-callbacks)

- BREAKING: Route active matching based on route records — v4 changed active link matching to use route records instead of path/query/hash properties [source](./.skilld/docs/guide/migration/index.md#routes-option-is-required-in-options)

- NEW: `router.hasRoute()` — check if a route exists by name [source](./.skilld/docs/guide/advanced/dynamic-routing.md:L116)

- NEW: `router.getRoutes()` — get array of all route records [source](./.skilld/docs/guide/advanced/dynamic-routing.md:L117)

- NEW: `router.addRoute()` returns removal function — v4 allows cleanup with `const removeRoute = router.addRoute(...); removeRoute()` [source](./.skilld/docs/guide/advanced/dynamic-routing.md:L72:77)

- NEW: `Typed Routes` with `RouteNamedMap` — v4.4.0+ enables full TypeScript support via `TypesConfig` interface [source](./.skilld/docs/guide/advanced/typed-routes.md:L1)

- NEW: `router.afterEach()` receives `failure` argument — v4 provides third parameter to detect navigation failures [source](./.skilld/docs/guide/advanced/navigation-failures.md:L69:76)

- NEW: Navigation guards support `inject()` — Vue 3.3+ allows dependency injection in guards like `router.beforeEach()` [source](./.skilld/docs/guide/advanced/navigation-guards.md:L139:154)

- NEW: `onBeforeRouteLeave()` and `onBeforeRouteUpdate()` — v4 Composition API guards for component lifecycle [source](./.skilld/docs/guide/advanced/composition-api.md:L58:85)

- NEW: `useLink()` composable — v4 exposes RouterLink internals for custom link components [source](./.skilld/docs/guide/advanced/composition-api.md:L89:124)

- BREAKING: `base` option moved — v4 passes `base` as first argument to history function: `createWebHistory('/base/')` not `{ base: '/base/' }` [source](./.skilld/docs/guide/migration/index.md#moved-the-base-option)

- BREAKING: `router.resolve()` and `router.match()` merged — v4 unified into single `router.resolve()` method with different signature [source](./.skilld/docs/guide/migration/index.md#removal-of-routermatch-and-changes-to-routerresolve)

**Also changed:** `router.removeRoute()` by name · `router.getMatchedComponents()` removed · `fallback` option removed · navigation guards in mixins not supported · `parent` property removed from route locations · named children routes no longer append slash · `$route` properties encoding now consistent · type renames: `RouteConfig` → `RouteRecordRaw`, `Location` → `RouteLocation`, `Route` → `RouteLocationNormalized` · `useRoute()` and `useRouter()` composables for Composition API · routes option now required · non-existent named routes throw error · missing required params throw error