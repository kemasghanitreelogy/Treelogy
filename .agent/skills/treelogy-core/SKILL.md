---
name: shopify-horizon-theme
description: >
  Complete workflow, code flow, and code style guide for the Shopify Horizon theme
  (github.com/Shopify/horizon). Use this skill whenever working on Horizon theme files,
  creating or editing Liquid sections/blocks/snippets, writing JavaScript custom elements,
  styling with CSS custom properties or container queries, customizing Horizon for a merchant,
  or building a theme derived from Horizon. Also trigger when the user mentions Horizon,
  Shopify theme blocks, nested blocks, content_for blocks, ThemeEvents, on:click declarative
  attributes, Shopify theme architecture 2025+, or any development task involving the /blocks
  directory. If the user asks about Dawn vs Horizon, upgrading from Dawn, or Shopify's latest
  theme patterns, consult this skill. Always use this skill before generating any Liquid, JS,
  or CSS for a Horizon-based project.
---

# Shopify Horizon Theme — Workflow, Code Flow & Code Style

## 1. What is Horizon?

Horizon is Shopify's flagship next-generation theme (Summer 2025 Editions). It replaces Dawn
as the reference implementation and is the first theme built entirely around **theme blocks** —
standalone, nestable Liquid components up to 8 levels deep.

### Core Principles (apply these to every decision)

- **Server-rendered first**: HTML rendered by Shopify via Liquid. Business logic, translations,
  money formatting — all server-side. Client JS is progressive enhancement only.
- **Web-native**: Modern browser APIs, no polyfills. Progressive enhancement for older browsers.
- **Lean by default**: Every feature must justify its existence. Say "no" until something earns
  a "yes." Code ships on quality.
- **Functional, not pixel-perfect**: Semantic markup ensures functionality across browsers
  without demanding identical rendering.

### Language Breakdown

| Language   | Share | Where                                              |
|-----------|-------|----------------------------------------------------|
| Liquid     | ~72%  | sections/, blocks/, snippets/, layout/, templates/  |
| JavaScript | ~23%  | assets/*.js — modular ES6+, custom elements         |
| CSS        | ~5%   | assets/*.css, {% stylesheet %} tags, inline styles  |

---

## 2. Repository Structure & Code Flow

```
horizon/
├── .cursor/rules/           # AI coding rules (Liquid, JS, CSS, a11y)
├── assets/                  # Static: CSS, JS, images, fonts
├── blocks/                  # ★ Theme blocks (nestable, reusable)
├── config/                  # Theme settings schema + stored values
├── layout/                  # Layout wrappers (theme.liquid)
├── locales/                 # i18n translation JSON files
├── sections/                # Full-width page components
├── snippets/                # Reusable Liquid fragments
└── templates/               # JSON page templates
```

### How a Page Renders (Code Flow)

Understanding the rendering pipeline is critical. Here's how a request flows:

```
1. Shopify receives request (e.g. /products/blue-shirt)
      ↓
2. templates/product.json
   — Maps page type to an ordered list of sections
   — Example: { "sections": { "main": { "type": "product-information" } } }
      ↓
3. layout/theme.liquid
   — Outer HTML shell (<html>, <head>, <body>)
   — Renders {{ content_for_layout }} which injects the template's sections
   — Loads global CSS variables via {% render 'theme-styles-variables' %}
   — Loads global JS (component.js, event.js, etc.)
      ↓
4. sections/product-information.liquid
   — Section Liquid renders HTML + uses {% content_for 'blocks' %}
   — This tag dynamically renders all theme blocks assigned to this section
      ↓
5. blocks/*.liquid
   — Each theme block renders its own markup
   — Blocks can nest child blocks via {% content_for 'blocks' %} in their own code
   — Settings come from block.settings (defined in {% schema %})
      ↓
6. snippets/*.liquid
   — Called from sections or blocks via {% render 'snippet-name', var: value %}
   — Pure code reuse — no schema, invisible to theme editor
      ↓
7. assets/*.js + assets/*.css
   — Loaded per-section/block (only what the page needs)
   — {% stylesheet %} and {% javascript %} tags compile into platform-managed bundles
   — Custom elements initialize and bind to DOM
```

### The Three Block Types

| Type            | Location               | Reusable?           | Nestable? | Editor visible? |
|----------------|------------------------|---------------------|-----------|----------------|
| Theme blocks    | `/blocks/*.liquid`     | Yes, across sections | Yes (8 deep) | Yes         |
| Section blocks  | Inline in section schema | No, that section only | No       | Yes            |
| App blocks      | Injected by apps       | Per app              | No        | Yes            |

**Critical**: Horizon uses theme blocks as first-class components. Sections accept them
via `{% content_for 'blocks' %}`. A section can accept theme blocks OR section blocks
— never both.

---

## 3. Liquid Code Style

### General Rules

```liquid
{% comment %} ✅ DO: Use {% liquid %} for multi-line logic (reduces whitespace) {% endcomment %}
{% liquid
  assign current_variant = product.selected_or_first_available_variant
  assign initial_quantity = current_variant.quantity_rule.min | default: 1

  if section.settings.enable_sticky_add_to_cart
    assign show_sticky = true
  endif
%}

{% comment %} ✅ DO: Whitespace control with hyphens for clean output {% endcomment %}
{%- if show_sticky -%}
  <div class="sticky-bar">...</div>
{%- endif -%}

{% comment %} ✅ DO: Use render, not include {% endcomment %}
{% render 'product-card', product: product, show_vendor: true %}

{% comment %} ❌ DON'T: Never invent filters, tags, or objects {% endcomment %}
{% comment %} ❌ DON'T: Never use {% include %} — it's deprecated {% endcomment %}
```

### Schema Style

Every section and block needs a `{% schema %}`. Follow these conventions:

```liquid
{% schema %}
{
  "name": "t:sections.hero.name",
  "tag": "section",
  "class": "hero-section",
  "settings": [
    {
      "type": "image_picker",
      "id": "image",
      "label": "t:sections.hero.settings.image.label"
    },
    {
      "type": "select",
      "id": "layout",
      "label": "t:sections.hero.settings.layout.label",
      "options": [
        { "value": "full", "label": "t:sections.hero.settings.layout.options.full" },
        { "value": "contained", "label": "t:sections.hero.settings.layout.options.contained" }
      ],
      "default": "contained"
    },
    {
      "type": "color_scheme",
      "id": "color_scheme",
      "label": "t:sections.all.color_scheme.label",
      "default": "scheme-1"
    }
  ],
  "blocks": [
    {
      "type": "@theme"
    }
  ],
  "presets": [
    {
      "name": "t:sections.hero.presets.name"
    }
  ]
}
{% endschema %}
```

**Schema rules**:
- Always use `t:` translation keys for user-facing labels, never raw strings
- `"type": "@theme"` accepts ALL theme blocks; restrict with specific type arrays
- Always provide `"default"` values — merchants should see usable content immediately
- Use `image_picker` not `url` for images (integrates with Shopify CDN)
- Use `color_scheme` not raw `color` for colors (theme-wide consistency)
- Use `range` with min/max for numeric values to prevent invalid input
- Use `select` for predefined options instead of free text

### Sections That Accept Theme Blocks

```liquid
{% comment %} The key pattern: capture content_for 'blocks' {% endcomment %}
{%- capture blocks_content -%}
  {% content_for 'blocks' %}
{%- endcapture -%}

{%- if blocks_content != blank -%}
  <div class="section__blocks">
    {{ blocks_content }}
  </div>
{%- endif -%}
```

### Snippet Conventions

```liquid
{% comment %}
  snippets/product-card.liquid

  Accepts:
  - product: {Product} Required. The product object.
  - show_vendor: {Boolean} Optional. Show vendor name. Default: false.
  - class: {String} Optional. Extra CSS classes.
{% endcomment %}

{%- liquid
  assign show_vendor = show_vendor | default: false
-%}

<div class="product-card {{ class }}">
  ...
</div>
```

- Document accepted parameters at the top of every snippet with LiquidDoc comments
- Use `| default:` for optional parameters
- Snippets are invisible to merchants — use them for logic reuse, not configurable UI

---

## 4. JavaScript Code Style

Horizon uses **vanilla ES6+ JavaScript** — no frameworks, no build step, no bundler.

### Custom Elements Pattern

This is Horizon's primary JS pattern. Every interactive component is a Web Component:

```javascript
// assets/sticky-header.js

// ✅ Horizon pattern: Custom element extending HTMLElement (or Component base class)
class StickyHeader extends HTMLElement {
  connectedCallback() {
    // Initialize when element enters the DOM
    this.header = this.querySelector('[ref="header"]');
    this.setupObserver();
  }

  disconnectedCallback() {
    // Clean up when element leaves the DOM
    this.observer?.disconnect();
  }

  setupObserver() {
    this.observer = new IntersectionObserver(
      ([entry]) => {
        this.toggleAttribute('stuck', !entry.isIntersecting);
      },
      { threshold: 0 }
    );
    this.observer.observe(this.querySelector('[ref="sentinel"]'));
  }
}

customElements.define('sticky-header', StickyHeader);
```

Corresponding Liquid:

```liquid
<sticky-header class="sticky-header">
  <div ref="sentinel"></div>
  <div ref="header" class="header__bar">
    ...
  </div>
</sticky-header>

{% javascript %}
  // This tag ensures the JS loads once even if multiple instances exist
  import 'sticky-header.js';
{% endjavascript %}
```

### The Component Base Class (component.js)

Horizon provides a `Component` base class that extends custom elements with:

- **`ref="name"` system**: Auto-binds child elements to `this.refs.name`
- **`on:event="component/method"` declarative handlers**: No manual event listeners

```html
<!-- Declarative event binding — Horizon's signature pattern -->
<button
  ref="closeButton"
  on:click="cart-drawer-component/close"
  class="button button-unstyled"
  aria-label="{{ 'actions.close_dialog' | t }}"
>
  <span class="svg-wrapper">
    {{- 'icon-close.svg' | inline_asset_content -}}
  </span>
</button>
```

Here `on:click="cart-drawer-component/close"` means: when clicked, call the `close()`
method on the ancestor `<cart-drawer-component>` custom element. No querySelector, no
addEventListener — clean and declarative.

### ThemeEvents (event.js)

Horizon uses an event-driven architecture via a `ThemeEvents` utility class. Components
communicate through custom DOM events:

```javascript
// Dispatching a theme event
ThemeEvents.dispatch('variant:selected', {
  detail: { variant: selectedVariant }
});

// Listening for a theme event
ThemeEvents.on('variant:selected', (event) => {
  this.updatePrice(event.detail.variant);
});

// Common theme events:
// - variant:selected
// - cart:updated
// - filter:update
// - zoom-media:selected
// - cart:item-added
```

All events extend the native `Event` interface. This pattern keeps JS modular and
decoupled — perfect for scaling customizations.

### JavaScript Rules

- **Script type**: Use `<script type="module">` for efficient browser loading
- **No frameworks**: Vanilla JS only (no React, Vue, jQuery)
- **No build step**: Files in /assets are served directly
- **Progressive enhancement**: Core functionality must work without JS
- **DOM binding**: Use `data-` attributes (e.g. `data-animate-in`, `data-variant-available`)
- **Animations**: Use `requestAnimationFrame` for scroll-tied effects
- **Lazy triggers**: Use `IntersectionObserver` for scroll-triggered animations and lazy loading
- **Performance measurement**: The codebase includes a JS class for measuring component
  performance (product form, cart drawer, cart discount)
- **{% javascript %} tag**: Use in sections/blocks — code appears once even if tag is
  included multiple times

---

## 5. CSS Code Style

### CSS Custom Properties (Design Tokens)

All visual values flow through CSS custom properties. Never hardcode colors, spacing, or fonts.

```css
/* ✅ Global tokens defined in snippets/theme-styles-variables.liquid */
:root {
  --color-foreground: {{ settings.colors_text.red }}, {{ settings.colors_text.green }}, {{ settings.colors_text.blue }};
  --color-background: {{ settings.colors_background.red }}, {{ settings.colors_background.green }}, {{ settings.colors_background.blue }};
  --font-body-family: {{ settings.type_body_font.family }}, {{ settings.type_body_font.fallback_families }};
  --font-heading-family: {{ settings.type_header_font.family }}, {{ settings.type_header_font.fallback_families }};
  --touch-target-size: 44px;
  /* ... hundreds of tokens ... */
}
```

### Container Queries

Horizon uses CSS `@container` rules to make components context-aware. This is a key
difference from Dawn — components adapt based on their container width, not the viewport:

```css
/* ✅ Horizon pattern: responsive layout tokens via container queries */
.product-card {
  container-type: inline-size;
}

@container (min-width: 400px) {
  .product-card__layout {
    --card-padding: var(--spacing-lg);
    grid-template-columns: 1fr 1fr;
  }
}

@container (min-width: 700px) {
  .product-card__layout {
    --card-padding: var(--spacing-xl);
  }
}
```

This means a component's styling changes based on where it's placed (narrow sidebar
vs full-width section) — not just the screen size.

### Scoped Styles (Per Block/Section)

Horizon scopes CSS to individual instances using the block ID:

```liquid
{% liquid
  assign block_id = block.id
%}

{% style %}
  #Block-{{ block_id }} {
    --custom-spacing: {{ block.settings.spacing }}px;
    --custom-color: {{ block.settings.text_color }};
  }
{% endstyle %}

<div id="Block-{{ block_id }}" class="my-block">
  ...
</div>
```

This pattern scopes styles per-instance without Shadow DOM.

### CSS Rules

- **Never hardcode colors**: Always use color schemes (`color-{{ settings.color_scheme }}`)
- **Global variables**: Defined in `snippets/theme-styles-variables.liquid` under `:root`
- **Scoped variables**: Defined within components, can reference global tokens
- **Specificity**: Keep as low as possible. Target max `0 2 0`, absolute max `0 4 0`
- **{% stylesheet %} tag**: Preferred for CSS in sections/blocks — scoped, appears once
- **{% style %} tag**: For per-instance inline styles using block.id scoping
- **No utility frameworks**: No Tailwind, Bootstrap, etc. — custom properties only
- **BEM-ish naming**: `section-name__element`, `section-name__element--modifier`
- **Color schemes**: Applied via `color-{{ settings.color_scheme }}` class pattern
- **Container queries over media queries**: Components should respond to their container
- **CSS variables for single-property settings**:
  ```liquid
  <div style="--gap: {{ block.settings.gap }}px">
  ```
- **CSS classes for multi-property settings**:
  ```liquid
  <div class="collection {{ block.settings.layout }}">
  ```

---

## 6. Development Workflow

### Setup

```bash
# 1. Clone
git clone https://github.com/Shopify/horizon.git
cd horizon

# 2. Install Shopify CLI
# https://shopify.dev/docs/storefronts/themes/tools/cli

# 3. Start local dev server
shopify theme dev --store your-store.myshopify.com

# 4. Lint
shopify theme check

# 5. Push to store
shopify theme push
```

### Git Branch Strategy (for customizations)

```
upstream/main              ← Shopify's official Horizon (read-only reference)
custom/main                ← Your production branch with all customizations
feature/custom-*           ← Short-lived feature branches
```

```bash
# Add upstream
git remote add upstream https://github.com/Shopify/horizon.git

# Pull vendor updates
git fetch upstream
git pull upstream main
```

### Upgrade-Safe Customization Workflow

**Never edit vendor files directly.** Follow this structure:

```
# Custom files — clearly namespaced
sections/custom.header.liquid          # Your version
sections/custom.product-gallery.liquid
snippets/custom.globals.liquid         # Global asset loader
assets/custom.css                      # All CSS overrides
assets/custom.js                       # All JS additions

# Documentation
docs/changes.md                        # Log of all custom files
docs/templates-map.md                  # JSON template → section mapping
docs/hotspots.md                       # Any unavoidable vendor edits
```

**Single injection hook in layout/theme.liquid:**

```liquid
{%- comment -%} CUSTOM EDIT START - See docs/changes.md {%- endcomment -%}
{% render 'custom.globals' %}
{%- comment -%} CUSTOM EDIT END {%- endcomment -%}
```

**In snippets/custom.globals.liquid:**

```liquid
{{ 'custom.css' | asset_url | stylesheet_tag }}
<script src="{{ 'custom.js' | asset_url }}" defer></script>
```

**Redirect JSON templates to your custom sections** instead of modifying vendor sections.
Edit `templates/product.json` to point at `custom.main-product` instead of `main-product`.

### Adding a New Custom Block

1. Create `blocks/custom.your-block.liquid` (prefix with `custom.`)
2. Add markup + `{% schema %}`
3. It auto-appears in any section that accepts `"type": "@theme"`

### Adding a New Custom Section

1. Create `sections/custom.your-section.liquid`
2. Add markup + `{% schema %}` with `"presets"` array
3. Add to JSON template or merchants can add via theme editor

---

## 7. Animation System

Horizon has a built-in animation framework. Know these patterns:

| Pattern | Implementation |
|---------|---------------|
| Scroll entrance | `data-animate-in` attribute + IntersectionObserver |
| Scroll parallax | `requestAnimationFrame` loop |
| Page transitions | View Transitions API (`document.startViewTransition`) |
| Sticky product bar | `<sticky-add-to-cart>` custom element |
| Media gallery | `<horizon-media>` with IntersectionObserver |

**Configurable per-block** via schema settings (animation speed, enable/disable).

**Rule**: Disable animations via section settings or alternate layout classes — never
by editing core animated behavior JS.

---

## 8. Performance Patterns

Horizon is performance-first. Follow these patterns:

- **Modular asset loading**: `{% stylesheet %}` and `{% javascript %}` tags tell Shopify
  which assets each section/block needs. Platform only loads what's on the page.
- **Critical CSS**: Separated into `critical.css` for above-the-fold content
- **Responsive images**: Always use `{{ image | image_url: width: 800 }}` — never
  hardcode image URLs. Shopify auto-generates responsive srcsets.
- **Lazy loading**: All off-screen images/media lazy-loaded via `loading="lazy"`
- **Font preloading**: Critical fonts preloaded in `<head>` with `rel="preload"`
- **Script modules**: `<script type="module">` for non-blocking JS
- **Custom ResizeObserver wrapper**: Triggers only on actual resize events (not initial
  invocation) to improve rendering efficiency
- **OverflowList custom element**: Moves header items into overflow slot when space is
  limited — minimizes layout shifts
- **Structured data**: Built-in JSON-LD for products, breadcrumbs, reviews, articles

---

## 9. Accessibility Requirements

- Semantic HTML: `<nav>`, `<main>`, `<article>`, `<aside>`, `<header>`, `<footer>`
- ARIA labels on all custom interactive elements
- `role` attributes where semantic elements aren't sufficient
- Keyboard navigation for every interactive element
- Visible focus indicators
- Screen reader text via `visually-hidden` class
- `aria-label` on icon-only buttons
- Proper focus trapping in modals/drawers
- `aria-expanded`, `aria-controls` on disclosure widgets

---

## 10. Common Pitfalls to Avoid

| ❌ Don't | ✅ Do |
|----------|------|
| Edit vendor files directly | Create `custom.*` prefixed files |
| Use `{% include %}` | Use `{% render %}` |
| Hardcode color values | Use `color_scheme` settings |
| Add jQuery or frameworks | Use vanilla JS + custom elements |
| Create `<div>` soup | Use semantic HTML elements |
| Override core animation JS | Toggle animations via section settings |
| Use media queries for components | Use container queries |
| Inline large CSS blocks | Use `{% stylesheet %}` or `{% style %}` |
| Put business logic in JS | Keep it in Liquid (server-side) |
| Create deeply coupled JS | Use ThemeEvents for inter-component communication |
| Hardcode text strings | Use `{{ 'key' \| t }}` translation filter |
| Use `settings_data.json` for config | Use `{% schema %}` settings with proper types |
| Guess at Liquid filters/objects | Only use documented Shopify Liquid APIs |

---

## 11. File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Vendor section | `sections/{name}.liquid` | `sections/product-information.liquid` |
| Custom section | `sections/custom.{name}.liquid` | `sections/custom.hero-banner.liquid` |
| Vendor block | `blocks/{name}.liquid` | `blocks/button.liquid` |
| Internal block | `blocks/_{name}.liquid` | `blocks/_card.liquid` (underscore = internal) |
| Custom block | `blocks/custom.{name}.liquid` | `blocks/custom.testimonial.liquid` |
| Snippet | `snippets/{name}.liquid` | `snippets/product-card.liquid` |
| Custom snippet | `snippets/custom.{name}.liquid` | `snippets/custom.globals.liquid` |
| CSS asset | `assets/{name}.css` | `assets/app.css` |
| JS asset | `assets/{name}.js` | `assets/sticky-header.js` |
| Custom assets | `assets/custom.{css\|js}` | `assets/custom.css` |

---

## 12. Key Reference Links

- Theme blocks quickstart: https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/quick-start
- Block schema docs: https://shopify.dev/docs/storefronts/themes/architecture/blocks
- Theme architecture: https://shopify.dev/docs/storefronts/themes/architecture
- Shopify CLI: https://shopify.dev/docs/storefronts/themes/tools/cli
- Theme Check: https://shopify.dev/docs/storefronts/themes/tools/theme-check
- AI-generated blocks guide: https://shopify.dev/docs/storefronts/themes/architecture/blocks/ai-generated-theme-blocks
- Liquid reference: https://shopify.dev/docs/api/liquid
- Cart API (AJAX): https://shopify.dev/docs/api/ajax/reference/cart
