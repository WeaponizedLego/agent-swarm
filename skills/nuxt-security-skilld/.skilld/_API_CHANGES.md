## API Changes

This section documents version-specific API changes in nuxt-security v2.5.1.

### Deprecated APIs

- DEPRECATED: `removeLoggers: RemoveOptions` — The object-based `RemoveOptions` configuration (via `unplugin-remove` plugin) is deprecated; use `removeLoggers: true` instead to use native Vite features which also remove `debugger` statements [source](./.skilld/docs/content/4.utils/2.remove-console-loggers.md#alternative-method---deprecated)

### Available Hooks

Nuxt Security provides two custom hooks for runtime and build-time security configuration:

- `nuxt-security:routeRules` — Nitro runtime hook invoked on server restart, allows dynamic modification of security options via async API (e.g., fetching from secrets manager) [source](./.skilld/docs/content/5.advanced/4.hooks.md#route-rules-hook)

- `nuxt-security:prerenderedHeaders` — Nuxt buildtime hook invoked during build, provides pre-calculated security headers for each static page (useful for CDN/static hosting header configuration) [source](./.skilld/docs/content/5.advanced/4.hooks.md#prerendered-headers-hook)

### Rate Limiter Features

- `ipHeader` parameter — Custom header name (string) for determining request IP address; overrides default `x-forwarded-for` header (e.g., `cf-connecting-ip` for Cloudflare) [source](./.skilld/docs/content/3.middleware/1.rate-limiter.md:L123-127)

- `whiteList` parameter — Array of IP addresses to exclude from rate limiting [source](./.skilld/docs/content/3.middleware/1.rate-limiter.md:L87-91)

- `driver` configuration — Flexible storage backend supporting LRU Cache (default) or any unstorage driver (e.g., Vercel KV); use camelCase driver names [source](./.skilld/docs/content/3.middleware/1.rate-limiter.md:L99-121)

### CORS Handler

- `useRegExp` parameter — Parse origin values into regular expressions; escape dots correctly in patterns as unescaped dots match any character [source](./.skilld/docs/content/3.middleware/4.cors-handler.md:L73-80)

### CSRF Protection

- `useCsrfFetch` composable — Wrapper around `useFetch` that automatically includes CSRF token in request headers; usage: `const { data, pending, error } = useCsrfFetch('/api/endpoint', options)` [source](./.skilld/docs/content/3.middleware/7.csrf.md:L43)

- `useCsrf` composable — Access CSRF token value directly; usage: `const { csrf } = useCsrf()` [source](./.skilld/docs/content/3.middleware/7.csrf.md:L46)

### Auto-Imported Utilities

- `defuReplaceArray` — Recursive merge utility for security rules (available only in `/server` folder); replaces array contents instead of merging like standard `defu` [source](./.skilld/docs/content/5.advanced/6.auto-imports.md)

### Core Configuration

ModuleOptions interface includes:

- `strict: boolean` — Enable stricter security defaults; requires manual whitelisting of resources (CSP) and features (Permissions Policy) [source](./.skilld/docs/content/1.getting-started/2.configuration.md:L16)

- `nonce: boolean` — Enable HTML nonce support in SSR mode for Strict CSP (default: `true`) [source](./.skilld/docs/content/1.getting-started/2.configuration.md:L27)

- `ssg: Ssg | false` — Static Site Generation support with CSP meta tags, script/style hashing; includes `meta`, `hashScripts`, `hashStyles`, `nitroHeaders`, `exportToPresets` options [source](./.skilld/docs/content/1.getting-started/2.configuration.md:L29)

- `sri: boolean` — Subresource Integrity support for asset verification (default: `true`) [source](./.skilld/docs/content/1.getting-started/2.configuration.md:L30)

**Also changed:** `basicAuth.message` parameter · `xssValidator.methods` default to `['GET', 'POST']` · CORS `maxAge` can be string or false · CSP supports `'trusted-types'` directive · Permissions Policy supports experimental features (battery, document-domain, gamepad, layout-animations, legacy-image-formats, oversized-images, unoptimized-images, unsized-media)