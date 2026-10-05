## Best Practices

## Nuxt UI v4.4.0

- Define custom colors with all 11 shades (50-950) when extending the color palette to maintain dark/light mode consistency [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/design-system.md:L99-L102)

- Use semantic color names (primary, secondary, success, error, warning, info) instead of raw color values to enable theme switching and dark mode support [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/design-system.md:L120-L290)

- Configure component themes via `app.config.ts` (Nuxt) or `vite.config.ts` (Vue) rather than inline props to maintain consistency across the app [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/components.md:L214-L254)

- Customize the `@theme` CSS variables in your `main.css` instead of modifying component defaults — this approach is more maintainable and affects the entire design system [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/design-system.md:L10-L22)

- Use the `UTheme` component to apply scoped theme customizations to a subtree without affecting the rest of the application [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/components.md:L343-L363)

- Validate form inputs with Standard Schema-compatible libraries (Valibot, Zod, Regle, Yup, Joi) and provide type-safe form state via the `UForm` component rather than manually wiring validation [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/components/form.md:L10-L25)

- Override component slot styles using the `ui` prop (per-component) before adding custom classes — the `ui` prop merges intelligently and takes priority over global config [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/components.md:L365-L390)

- Wrap color mode toggles in `ClientOnly` to prevent hydration mismatches when switching between light and dark themes [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/integrations/color-mode/nuxt.md:L40-L54)

- Build data tables using the `UTable` component with `useVueTable` for sorting, filtering, pagination, and virtualization rather than implementing these features manually [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/components/table.md:L11-L14)

- When customizing focus styles globally, add rules **outside** `@layer` to take precedence over component defaults and tint focus outlines with semantic colors [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/css-variables.md:L918-L961)

- Use CSS variables (`--ui-*`) for dark/light mode adaptation rather than separate CSS rules or conditionals — they are applied automatically via the design system [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/css-variables.md:L215-L255)

- Inject color variables into the document head using `@unhead` in Vue SSR apps — Nuxt handles this automatically, but Vue requires manual setup [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/integrations/ssr.md:L14-L68)

- Resolve component references dynamically with `resolveComponent()` in render functions to avoid import issues and enable lazy-loaded component usage in data table cells [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/components/table.md:L23-L26)

- Use slot functions in global theme config when you need to replace classes entirely rather than merging them — only when the default classes don't fit your design [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/theme/components.md:L299-L313)

- Detect and apply the user's color scheme preference **before** app initialization by adding a detection script to the HTML `<head>` to prevent flash of unstyled content in SSR [source](./.skilld/../../../.skilld/references/@nuxt/ui@4.4.0/llms-docs/raw/docs/getting-started/integrations/ssr.md:L109-L172)