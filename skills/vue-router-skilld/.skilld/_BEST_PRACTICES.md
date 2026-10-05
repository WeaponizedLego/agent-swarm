## Best Practices

- Always use dynamic imports for route components to enable code splitting — improves initial bundle size and page load performance [source](./.skilld/docs/guide/advanced/lazy-loading.md#L39)

- Use `router.beforeResolve()` instead of `beforeEach()` for data fetching — it's called after all in-component guards and async route components are resolved, making it the ideal spot to fetch required data before navigation confirmation [source](./.skilld/docs/guide/advanced/navigation-guards.md#L91-L111)

- Prefer named routes over hardcoded path strings — provides automatic param encoding, prevents URL typos, and enables dynamic route matching without path ranking issues [source](./.skilld/docs/guide/essentials/named-routes.md#L32-L38)

- Avoid watching the entire `route` object; instead watch specific properties you expect to change — reduces overhead and prevents unnecessary re-renders triggered by unrelated route properties [source](./.skilld/docs/guide/advanced/composition-api.md#L33-L52)

- Check `to.name` in global `beforeEach` guards when redirecting to login — prevents infinite redirect loops when authentication checks are combined with redirects [source](./.skilld/docs/guide/advanced/navigation-guards.md#L39-L50)

- Use `isNavigationFailure()` with `NavigationFailureType` enum to differentiate between aborted, cancelled, and duplicated navigations — enables proper handling of various failure scenarios [source](./.skilld/docs/guide/advanced/navigation-failures.md#L49-L61)

- Decouple route components from the router using the `props` option — components relying on `$route` directly are tightly coupled and harder to test and reuse in other contexts [source](./.skilld/docs/guide/essentials/passing-props.md#L3-L8)

- Use route `meta` fields with dynamic `transition` names combined with `afterEach` hooks — enables per-route and relationship-based transitions (e.g., slide-left when going deeper, slide-right when going back) [source](./.skilld/docs/guide/advanced/transitions.md#L21-L71)

- Keep route component props functions stateless — the function is evaluated only on route changes, so computed values depending on component state won't update as expected; use a wrapper component if state-based props are needed [source](./.skilld/docs/guide/essentials/passing-props.md#L127)

- Return `savedPosition` in `scrollBehavior()` for back/forward button navigation to preserve scroll position like native page reloads [source](./.skilld/docs/guide/advanced/scroll-behavior.md#L58-L70)

- Create custom RouterLink components in medium to large applications instead of using the base component everywhere — enables consistent styling, external link handling, and custom behaviors across the app [source](./.skilld/docs/guide/advanced/extending-router-link.md#L1-L8)

- Await `router.isReady()` before mounting the app if using route transitions — Vue Router's asynchronous nature means transitions are applied even on initial navigation, and `isReady()` ensures proper timing [source](./.skilld/docs/guide/advanced/transitions.md#L87-L95)

- Use `inject()` within navigation guards (Vue 3.3+) to access global properties like Pinia stores — reduces need for explicit imports and enables using provided values in guard logic [source](./.skilld/docs/guide/advanced/navigation-guards.md#L139-L154)

- Add routes with `router.addRoute()` outside navigation guards and manually call `router.replace()` — adding routes inside guards can cause infinite redirects; return the location for redirection only when necessary inside guards [source](./.skilld/docs/guide/advanced/dynamic-routing.md#L39-L53)