# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Astro dev server at localhost:4321
npm run start-dev    # Generate TS types from Umbraco Swagger, then start dev server
npm run build        # Build production site to ./dist/
npm run preview      # Preview production build locally
npm run updateTypes  # Regenerate src/types/ from live Umbraco Swagger schema
```

> `start-dev` requires the Umbraco backend to be running at the URL in `.env.development`, as it hits the Swagger endpoint to generate types first.

## Architecture Overview

This is a **headless CMS** setup: Umbraco 16+ serves as the content backend via its Content Delivery API; Astro consumes that API and renders the frontend.

### Content flow

1. **Umbraco CMS** (`Umbraco/AstroSandbox/`) defines content types via uSync config files (`uSync/v17/ContentTypes/*.config`)
2. **Type generation** (`scripts/gen-types.mjs`) hits Umbraco's Swagger endpoint and writes TypeScript interfaces into `src/types/` — run `npm run updateTypes` whenever content types change
3. **Route generation** (`src/pages/[...path].astro`) calls `fetchContent()` with a list of content type aliases, gets every published item, and returns them as static paths — each item's `route.path` becomes a URL
4. **Template resolution** picks the right `.astro` file based on the content type alias

### Dynamic template resolution (key pattern)

`TemplateLoop.astro` and `BlocklistLoop.astro` use `import.meta.glob` to load templates lazily, then select the right one at runtime by converting a camelCase content type alias to PascalCase:

- Content type `standardPage` → loads `src/Templates/pages/StandardPage.astro`
- Block type `bodyTextBlock` → loads `src/Templates/modules/BodyTextBlock.astro`

**Adding a new content type**: create `src/Templates/pages/MyNewType.astro` with a `model` prop typed to the generated `MyNewTypeContentResponseModel`. The routing and template lookup happen automatically.

**Adding a new block module**: create `src/Templates/modules/MyBlock.astro` with `{ model }` props, destructure `model.content` and `model.settings`.

### Core library (`src/lib/`)

| File | Purpose |
|------|---------|
| `Umbraco.Config.js` | Reads env vars; single source of truth for API config |
| `Umbraco.Query.js` | `fetchItem(path)` for single items, `fetchContent(filters, takeAll)` for listings; handles auth headers and pagination |
| `Umbraco.Media.js` | HMAC-signs image URLs (required by Umbraco); `wysiwygImageLoader` rewrites `<img>` tags in rich text to add `srcset` |

### Components (`src/lib/components/`)

- **`UmbracoImage.astro`** — Generates a responsive `<img>` with a 14-stop srcset; accepts `image`, `width`, `crop` (alias), and `sizes` props
- **`UmbracoLink.astro`** — Renders Umbraco link fields (internal/external/media); handles the link model shape from the API
- **`Wysiwyg.astro`** — Processes rich text HTML from Umbraco; runs `wysiwygImageLoader` to inject responsive images

### Render/SSR mode

Controlled by the `PRERENDER` env var:

- `PRERENDER=true` → full static generation; `getStaticPaths()` pre-fetches all content at build time
- `PRERENDER=false` (default in dev) → SSR via `@astrojs/node`; each request fetches fresh content from Umbraco

### Environment variables

Both `.env.development` and `.env.production` are required. Key variables:

```
UMBRACO_DOMAIN             # Backend URL (e.g. https://localhost:44379)
PUBLIC_MEDIA_DOMAIN        # Media asset domain
UMBRACO_HMAC_SECRET_KEY    # Hex-encoded secret for image URL signing
UMBRACO_API_KEY            # Optional API key header
UMBRACO_SITE_ID            # Optional Start-Item header (multi-site root)
PRERENDER                  # true | false
NODE_TLS_REJECT_UNAUTHORIZED=0  # Required in dev (self-signed cert)
```

### Path alias

`@/` maps to `src/` — use it for all internal imports.

### Umbraco backend

The .NET project lives in `Umbraco/AstroSandbox/`. Content type schema is managed by uSync — editing `.config` files under `uSync/v17/ContentTypes/` and syncing in the Umbraco back-office is how the schema is kept in source control. You rarely need to touch the .NET side when working on the Astro frontend.
