## API Changes

This section documents version-specific API changes — prioritize recent major/minor releases.

### Breaking Changes (v3 → v4)

- BREAKING: `ButtonGroup` component renamed to `FieldGroup` [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#renamed-buttongroup)

- BREAKING: `PageMarquee` component renamed to `Marquee` [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#renamed-pagemarquee)

- BREAKING: `PageAccordion` component removed — use `Accordion` with `unmount-on-hide="false"` instead [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#removed-pageaccordion)

- BREAKING: Model modifiers for `Input`, `InputNumber`, `Textarea` — `nullify` renamed to `nullable`, converts empty/blank values to `null` [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#renamed-model-modifiers)

- NEW: `optional` modifier added to `Input`, `InputNumber`, `Textarea` — converts empty/blank values to `undefined` instead of `null` [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#renamed-model-modifiers)

- BREAKING: `Form` component schema transformations — now only applied to `@submit` data, no longer mutate the form's state [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#changes-to-form-component)

- BREAKING: `Form` nested forms — must be enabled explicitly using `nested` prop and must provide a `name` prop [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#changes-to-form-component)

- DEPRECATED: Content utilities `findPageBreadcrumb` and `findPageHeadline` removed from `@nuxt/ui` — import from `@nuxt/content/utils` instead [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#removed-deprecated-utilities)

### AI SDK v5 Integration Changes

- BREAKING: `useChat` composable replaced with `Chat` class from `@ai-sdk/vue` [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#ai-sdk-v5-migration-optional)

- BREAKING: Message structure — messages now use `parts` array instead of `content` string, format: `{ type: 'text', text: '...' }` [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#ai-sdk-v5-migration-optional)

- BREAKING: Chat API — `reload()` renamed to `chat.regenerate()`, state accessed via `chat.messages` and `chat.status` instead of separate composable returns [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#ai-sdk-v5-migration-optional)

- NEW: `getTextFromMessage()` utility — extracts text from AI SDK v5 message parts for rendering [source](./.skilld/docs/content/docs/1.getting-started/3.migration/1.v4.md#ai-sdk-v5-migration-optional)

**Also changed:** Unified `@nuxt/ui` and `@nuxt/ui-pro` into single library · v4 requires Nuxt 4 · Tailwind CSS v4 migration · Reka UI as underlying component library