---
# Ask BC — multi-theme chat UI for BigCommerce merchants.
#
# Ask BC's theme system is structurally close to google-labs/design.md:
# each theme is a TS object literal under src/lib/themes/ satisfying
# ThemeConfig (see src/lib/themes/types.ts). This DESIGN.md documents
# the contract + block-component vocabulary, with `bc-native` as the
# canonical token set in frontmatter. Alternate themes (`ai-assistant`,
# `dashboard`) swap these tokens; see the `themes` block for deltas.
schemaVersion: 1
name: Ask BC
tagline: AI store assistant for BigCommerce merchants
defaultTheme: bc-native

# ---------------------------------------------------------------------------
# Canonical token set — bc-native theme (the in-admin default).
# ---------------------------------------------------------------------------
colors:
  primary:        "#3C64F4"
  primaryHover:   "#2B4FD4"
  accent:         "#3C64F4"
  success:        "#16a34a"
  error:          "#dc2626"
  surface:        "#f0f1f5"
  surfaceRaised:  "#ffffff"
  background:     "#ffffff"
  text:
    primary:    "#313440"
    secondary:  "#525566"
    muted:      "#8b8fa3"
  border:
    default: "#d9dce9"
    subtle:  "#e8e9ef"
  userBubble:
    bg:   "{colors.primary}"
    text: "#ffffff"
  assistantBubble:
    bg:   "{colors.surface}"
    text: "{colors.text.primary}"
  code:
    bg:   "#1e1e2e"
    text: "#cdd6f4"

typography:
  fontFamily: inherit                # the BC admin font is inherited
  fontSize:
    xs:   "0.6875rem"
    sm:   "0.75rem"
    base: "0.875rem"
    lg:   "1rem"
    xl:   "1.25rem"
  fontWeight: { normal: 400, medium: 500, semibold: 600 }
  lineHeight: { tight: "1.25", normal: "1.5", relaxed: "1.625" }

spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"

radius:
  sm:   "4px"
  md:   "6px"
  lg:   "8px"
  full: "999px"
  userBubble:      "1rem 1rem 0.25rem 1rem"    # asymmetric pill, tail-toward-user
  assistantBubble: "1rem 1rem 1rem 0.25rem"    # asymmetric pill, tail-toward-assistant

shadows: { sm: none, md: none, lg: none }      # flat in BC admin context
transitions: { fast: "0.15s", normal: "0.2s" }

layout:
  contentMaxWidth:    "100%"
  contentAlign:       stretch
  sidebarWidth:       "260px"
  sidebarExpandable:  false
  sidebarStyle:       panel
  toolResultPosition: inline

# ---------------------------------------------------------------------------
# Theme variants — only deltas from bc-native.
# Runtime source: src/lib/themes/<id>.ts
# ---------------------------------------------------------------------------
themes:
  ai-assistant:
    description: "Modern, spacious chat inspired by leading AI interfaces"
    colors:
      primary:        "#6B7280"
      primaryHover:   "#4B5563"
      accent:         "#6B7280"
      surface:        "#fafafa"
      background:     "#fafafa"
      userBubble:     { bg: transparent, text: "#111827", border: "#E5E7EB" }
      assistantBubble: { bg: transparent, text: "#111827" }
    typography:
      fontFamily: "system-ui, -apple-system, sans-serif"
      fontSize:   { xs: "0.75rem", sm: "0.8125rem", base: "0.9375rem", lg: "1.0625rem", xl: "1.25rem" }
      lineHeight: { tight: "1.4", normal: "1.7", relaxed: "1.8" }
    spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" }
    radius:  { userBubble: "1.25rem", assistantBubble: "0" }
    layout:
      contentMaxWidth: "720px"
      contentAlign:    center
      sidebarWidth:    "300px"
      sidebarStyle:    drawer
  dashboard:
    description: "Data-forward command center with rich cards"
    # see src/lib/themes/dashboard.ts for full delta

# ---------------------------------------------------------------------------
# Block components — the 7 inline UI primitives that render tool results
# inside the chat surface. Every block MUST resolve its colors/spacing/
# radius/typography from the active theme tokens above. Raw hex / rem /
# px in a block component is a linting violation.
# ---------------------------------------------------------------------------
blocks:
  KPICard:
    role: "Single-metric card with value + delta + label"
    tokens: [primary, text.primary, text.muted, surfaceRaised, border.default]
    tabularNumerals: true
  DataTable:
    role: "Rows of structured BC data (orders, products, customers)"
    tokens: [text.primary, text.muted, border.subtle, surfaceRaised]
    tabularNumerals: true
  ProductCard:
    role: "Single product: image, name, SKU, price, stock"
    tokens: [text.primary, text.secondary, surfaceRaised, border.default, success, error]
  OrderTimeline:
    role: "Vertical timeline of order status transitions"
    tokens: [primary, success, text.muted, border.subtle]
  InventoryBar:
    role: "Horizontal bar chart of stock levels by product"
    tokens: [primary, warning, error, text.muted, surface]
  SparklineChart:
    role: "Inline trend line for 7-/30-day metrics"
    tokens: [primary, text.muted, surfaceRaised]
  ErrorCard:
    role: "Failure/permission-denied block for write-tool errors"
    tokens: [error, text.primary, text.secondary, border.default, surfaceRaised]
---

# Ask BC Design System

## Overview

Ask BC is an AI-powered store assistant for BigCommerce merchants. It runs inside the BC admin panel (as an app extension) and as a standalone `/admin`-adjacent interface. The UI is **chat + generative block components**: the assistant streams responses, and tool calls render as structured UI blocks inline in the conversation.

The design system has two jobs:

1. **Theme contract.** Ask BC ships three themes — `bc-native` (matches BC admin chrome), `ai-assistant` (modern AI-style spacious chat), `dashboard` (data-forward command center). Each is a `ThemeConfig` TS object at `src/lib/themes/<id>.ts` conforming to the shape in `src/lib/themes/types.ts`.
2. **Block-component token contract.** The 7 inline block components (KPICard, DataTable, ProductCard, OrderTimeline, InventoryBar, SparklineChart, ErrorCard) render correctly in all three themes *only* because they consume theme tokens, not raw values.

## Themes

### bc-native (default)

The canonical theme, matching BigCommerce admin chrome. Flat surfaces (no shadows), 0.875rem base body, asymmetric chat-bubble radii with tails toward the speaker. Sidebar is a fixed 260px panel.

### ai-assistant

The AI-first variant: larger type (0.9375rem base), looser leading (1.7 normal, 1.8 relaxed), transparent bubbles with border-only separation. Centered 720px content column, 300px drawer sidebar. Modeled on Claude.ai / ChatGPT reading comfort.

### dashboard

Data-forward. See `src/lib/themes/dashboard.ts` for the full delta — this theme shifts tool results from inline to a grid layout below the conversation and swaps the default tool-result renderer to `DashboardToolResult`.

## Block Component Contract

Block components live in `src/components/chat/cards/` and `src/components/chat/loading/`. Every block **must** satisfy the following:

- **Token-only styling.** Every color, font-size, spacing, radius value must resolve from the active theme via the theming hook. No raw hex, no raw rem/px.
- **Declared token dependencies.** Each block declares the tokens it consumes in its JSDoc (mirrored in the `blocks` frontmatter above). A reviewer can read the declaration to know what breaks if a theme omits a token.
- **Tabular numerals for numeric data.** `KPICard`, `DataTable`, `OrderTimeline`, `InventoryBar`, `SparklineChart` all display numeric BC data — they must use `font-variant-numeric: tabular-nums`.
- **Accessible under every theme.** Text contrast must pass WCAG AA against *every* theme's surface color, not just the default.

## Chat Surface

Two bubble types, asymmetric radii:

- **User bubble** (`{colors.userBubble.*}`) — filled, tail toward the user (bottom-right corner unrounded).
- **Assistant bubble** (`{colors.assistantBubble.*}`) — either filled surface (`bc-native`), transparent-with-border (`ai-assistant`), or transparent (`dashboard`). Tail toward the assistant (bottom-left corner unrounded).

`{radius.userBubble}` and `{radius.assistantBubble}` control the asymmetric corner radii; they are intentional visual language and must not be collapsed to `{radius.md}`.

## Code Rendering

Code blocks always use `{colors.code.bg}` / `{colors.code.text}` — a deliberately dark fill even on light themes. Syntax highlighting tints overlay this base; they never replace it.

## Write-Operation Pattern

Ask BC has 7 write tools (create coupons, update inventory, toggle visibility, etc.). All writes use a **two-turn confirmation** before mutation. The confirmation card is an `ErrorCard`-shaped block (same tokens) tinted with `{colors.primary}` rather than `{colors.error}` — the visual weight signals "this is consequential" while staying on-brand.

## Context-Aware Panels

When Ask BC is opened from an Orders or Products page (as an App Extension), the sidebar renders contextual actions specific to the current record. The panel inherits the active theme without overrides.

## Do's and Don'ts

**Do**
- Resolve every style from the theming hook. Raw values in block components are a linting violation.
- Declare token dependencies in block JSDoc + frontmatter `blocks` map.
- Use tabular numerals on every numeric block.
- Test new blocks against all three themes before PR.

**Don't**
- Introduce a fourth theme without extending `ThemeId` in `src/lib/themes/types.ts` and updating the `themes:` block in this file.
- Hardcode bubble radii — the asymmetric shape is intentional and theme-driven.
- Use the `{colors.error}` palette for confirmation prompts. Red is reserved for actual failures; primary is for consequential-but-normal writes.
- Use the `{colors.success}` palette for ranking/direction indicators — it's reserved for operation success only.

---

*Derived from `src/lib/themes/types.ts` (runtime contract) and `src/lib/themes/{bc-native,ai-assistant,dashboard}.ts` (theme instances). Treat DESIGN.md as the canonical design-system doc; treat the TS files as the runtime source of truth. Keep both in sync — block components depend on both.*
