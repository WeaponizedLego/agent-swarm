## Best Practices

- Start with default configuration and gradually increase security with `strict: true` — nuxt-security ships with sensible defaults that won't break your app (A+ Mozilla Observatory score) and provides a methodical path to stricter security without trial-and-error [source](./.skilld/docs/content/5.advanced/7.improve-security.md#improve-gradually-with-strict-mode)

- Use `useScript()` to load external scripts for CSP compatibility — it's isomorphic, loads under `'strict-dynamic'`, and doesn't insert inline event handlers, ensuring scripts work with strict Content Security Policy without additional whitelisting headaches [source](./.skilld/docs/content/5.advanced/3.strict-csp.md#the-usescript-composable)

- Always use the `security` property in `routeRules`, not the standard `headers` property — the module-specific `security` object takes precedence and is required for nuxt-security options to apply per-route [source](./.skilld/docs/content/1.getting-started/3.usage.md#per-route-configuration)

- Use runtime hooks with `nuxt-security:routeRules` for dynamic security configuration — lets you fetch rules from external secret managers or adapt settings at startup without rebuilding, essential for multi-tenant deployments [source](./.skilld/docs/content/5.advanced/4.hooks.md#route-rules-hook)

- Use `defuReplaceArray` instead of `defu` when merging CSP directives in hooks — it replaces array content instead of concatenating, preventing accidental duplication of security values [source](./.skilld/docs/content/5.advanced/6.auto-imports.md#replacing-array-content)

- Only return necessary fields from APIs via `useFetch` with `pick` — prevents data leaks of emails, credit cards, or other PII by restricting response payloads at the client level [source](./.skilld/docs/content/5.advanced/1.good-practices.md#only-return-what-is-necessary)

- Use `useState` with unique keys instead of global refs for SSR safety — prevents cross-request state pollution where user data leaks between requests, a critical issue in Nuxt SSR applications [source](./.skilld/docs/content/5.advanced/1.good-practices.md#handling-state-with-care-in-nuxt-ssr)

- Apply `'strict-dynamic'` and `'nonce-{{nonce}}'` to `script-src` for Strict CSP — `strict-dynamic` allows child scripts injected by the pre-authorized root script, solving Nuxt hydration problems without excessive whitelisting [source](./.skilld/docs/content/5.advanced/3.strict-csp.md#strict-dynamic-csp-level-3)

- Configure rate limiting with an infrastructure-layer solution for production, not the built-in middleware — the built-in LRU cache is suitable only for simple apps; production apps need Cloudflare DDoS, fail2ban, or reverse proxy rate limiting [source](./.skilld/docs/content/3.middleware/1.rate-limiter.md)

- Use `useCsrfFetch` composable instead of manual token handling — it automatically adds CSRF tokens to request headers and works seamlessly with form submissions without boilerplate [source](./.skilld/docs/content/3.middleware/7.csrf.md#using-with-trpc-nuxt)

- Enable `preload: true` for HSTS in strict mode to submit to Chrome HSTS preload list — requires 1-year `maxAge`, ensures your site is preloaded in browsers before first visit, preventing any HTTP communication [source](./.skilld/docs/content/5.advanced/7.improve-security.md#enforcing-a-stricter-hsts-policy)

- Handle per-route CSP changes with hard reload via `reloadNuxtApp()` or external links — client-side navigation doesn't re-request CSP headers from the server, so policy changes only apply after a full page reload [source](./.skilld/docs/content/5.advanced/3.strict-csp.md#per-route-csp)

- Whitelist external resources by domain or integrity hash, never by inline event handlers alone — if using `useHead` (vs `useScript`), the `onload` handler requires `'unsafe-hashes'` and a specific SHA256 hash of the event handler code [source](./.skilld/docs/content/5.advanced/3.strict-csp.md#the-usehead-composable)

- Configure Cloudflare by disabling Post-Build Optimizations and loading JS Detection via `useHead` — Cloudflare's code injection breaks CSP nonces, requiring you to disable auto-processing and manually add their challenge script [source](./.skilld/docs/content/5.advanced/2.faq.md#cloudflare)