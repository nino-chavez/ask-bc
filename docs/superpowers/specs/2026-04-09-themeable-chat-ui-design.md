# Themeable Chat UI Design

## Overview

Add three configurable visual themes to the Ask BC chat interface: BC-Native (polished current look), AI Assistant (modern spacious chat), and Merchant Dashboard (data-forward rich cards). Merchants can select their preferred theme; store admins can set defaults via Redis.

## Theme System Architecture

### File Structure

```
src/lib/themes/
  types.ts              — ThemeConfig, ThemeTokens, ThemeLayout, ThemeComponents
  bc-native.ts          — BC-native theme
  ai-assistant.ts       — AI assistant theme
  dashboard.ts          — Dashboard theme
  index.ts              — Registry, helpers, default export

src/components/chat/
  ThemeContext.tsx       — React context, provider, useTheme hook, persistence
  ThemeSelector.tsx      — Gear icon dropdown in chat header

  cards/
    OrderCard.tsx
    ProductCard.tsx
    CustomerCard.tsx
    GenericCard.tsx
    ToolResultRenderer.tsx
```

### ThemeConfig Interface

```typescript
interface ThemeTokens {
  colors: {
    primary: string;
    primaryHover: string;
    surface: string;
    surfaceRaised: string;
    background: string;
    text: { primary: string; secondary: string; muted: string };
    border: { default: string; subtle: string };
    accent: string;
    success: string;
    error: string;
    userBubble: { bg: string; text: string };
    assistantBubble: { bg: string; text: string };
    code: { bg: string; text: string };
  };
  typography: {
    fontFamily: string;
    fontSize: { xs: string; sm: string; base: string; lg: string; xl: string };
    fontWeight: { normal: number; medium: number; semibold: number };
    lineHeight: { tight: string; normal: string; relaxed: string };
  };
  spacing: {
    xs: string; sm: string; md: string; lg: string; xl: string;
  };
  radius: {
    sm: string; md: string; lg: string; full: string;
    userBubble: string;
    assistantBubble: string;
  };
  shadows: {
    sm: string; md: string; lg: string;
  };
  transitions: {
    fast: string; normal: string;
  };
}

interface ThemeLayout {
  contentMaxWidth: string;           // '100%' | '720px' | '900px'
  contentAlign: 'stretch' | 'center';
  sidebarWidth: string;              // '260px' | '48px'
  sidebarExpandable: boolean;        // false | true (icon rail)
  sidebarStyle: 'panel' | 'drawer' | 'rail';
  inputPosition: 'bottom';
  toolResultPosition: 'inline' | 'grid-below';
}

interface ThemeComponents {
  toolResultRenderer: React.ComponentType<{ toolName: string; output: unknown }>;
  loadingIndicator: React.ComponentType;
  emptyState?: React.ComponentType<{ onSend: (text: string) => void; prompts: string[] }>;
}

interface ThemeConfig {
  id: 'bc-native' | 'ai-assistant' | 'dashboard';
  name: string;
  description: string;
  tokens: ThemeTokens;
  layout: ThemeLayout;
  components: ThemeComponents;
}
```

### Theme Consumption

Components use the `useTheme()` hook:

```typescript
const { tokens, layout, components } = useTheme();

// Tokens for styling
style={{ color: tokens.colors.text.primary, borderRadius: tokens.radius.md }}

// Layout for structure
layout.contentMaxWidth
layout.toolResultPosition

// Components for rendering
const { toolResultRenderer: ToolResult } = components;
<ToolResult toolName="get_orders" output={data} />
```

## Theme Definitions

### BC-Native

**Identity:** Polished first-party BigCommerce feature. Current UI elevated.

- **Colors:** BigDesign palette unchanged — `#3C64F4` primary, `#f0f1f5` surfaces, `#313440` text
- **Typography:** System font stack from BigDesign, `0.875rem` body
- **Layout:** `contentMaxWidth: '100%'`, `sidebarWidth: '260px'`, `sidebarStyle: 'panel'`, `toolResultPosition: 'inline'`
- **Bubbles:** Blue user bubble (`#3C64F4`/white), gray assistant bubble (`#f0f1f5`/`#313440`), directional corner cuts
- **Tool results:** Collapsible list showing tool names + expanded output data
- **Loading:** Pulse dot animation (current)
- **Changes from current:** Better spacing consistency, improved tool output display (now that serialization preserves data)

### AI Assistant

**Identity:** Clean, spacious, modern. ChatGPT/Claude-inspired.

- **Colors:** Near-white background (`#fafafa`), no colored bubbles. User: subtle `1px` border. Assistant: no background. Accent: muted blue-gray (`#6B7280`)
- **Typography:** System sans-serif, `0.9375rem` body, line-height `1.7`
- **Layout:** `contentMaxWidth: '720px'`, `contentAlign: 'center'`, `sidebarStyle: 'drawer'` (slide-over, no persistent sidebar), `toolResultPosition: 'inline'`
- **Bubbles:** No background on assistant messages. User messages: subtle border pill, right-aligned
- **Tool results:** Minimal disclosure — "Searched N sources" text, expandable
- **Loading:** Three-dot typing indicator

### Dashboard

**Identity:** Data-forward intelligent command center for merchants.

- **Colors:** Slightly darker surface (`#f5f6f8`), elevated white cards with `box-shadow`, deeper blue accent (`#2B4FD4`)
- **Typography:** Compact — `0.8125rem` body, tabular numbers for data
- **Layout:** `contentMaxWidth: '900px'`, `sidebarWidth: '48px'`, `sidebarStyle: 'rail'` (icon rail, expands on hover), `toolResultPosition: 'grid-below'`
- **Bubbles:** No bubble styling on assistant. User: compact right-aligned block
- **Rich cards:**
  - **OrderCard** — Status badge (color-coded), order total, date, customer name, item count
  - **ProductCard** — Thumbnail image (from tool data), name, price, inventory badge, visibility
  - **CustomerCard** — Name, email, order count, total spent
  - **GenericCard** — Key-value pairs for other tools
- **Loading:** Skeleton card placeholders

## Rich Card Data Flow

1. AI calls tool → tool returns JSON with full data
2. `MessageBubble` receives tool part with `output` field (preserved by updated serialization)
3. Passes `{ toolName, output }` to theme's `toolResultRenderer`
4. Renderer dispatches: `get_orders` → `OrderCard`, `get_products` → `ProductCard`, etc.
5. Cards are presentation-only — no additional API calls
6. Missing cards fall back to `GenericCard`

### Tool-to-Card Mapping

| Tool Name | Dashboard Card | Other Themes |
|-----------|---------------|--------------|
| `get_orders` | `OrderCard` | `GenericCard` |
| `get_products` | `ProductCard` | `GenericCard` |
| `get_customers` | `CustomerCard` | `GenericCard` |
| All others | `GenericCard` | `GenericCard` |

Product thumbnails work because `get_products` returns `images[]` with URLs. No extra fetching needed.

## Theme Selection & Persistence

### API Route

`GET/PUT /stores/[storeHash]/api/theme`

- **GET:** Returns `{ theme: 'bc-native' | 'ai-assistant' | 'dashboard' }` from Redis. Default: `'bc-native'`.
- **PUT:** Body `{ theme: string }`. Validates against known theme IDs. Saves to Redis key `store:{storeHash}:theme`.
- Protected by `authorize()` like all store-scoped routes.

### Client-side Flow

1. `ThemeContext` provider mounts
2. Fetch store default from `GET /api/theme`
3. Check IndexedDB for merchant override (key: `theme-preference`)
4. Merchant override wins if present
5. On theme change via selector: save to IndexedDB, update context immediately

### ThemeSelector Component

- Gear icon in the chat header (right side, before "New Chat" button)
- Dropdown with three options: theme name + one-line description
- Active theme indicated with a check mark
- Selection triggers immediate context update (no reload)

## Modified Existing Components

### ChatPage.tsx
- Wrap content with `ThemeProvider`
- Read `layout.sidebarStyle` to render panel / drawer / rail
- Pass layout config to sidebar rendering logic

### ChatPanel.tsx
- Read tokens for empty state styling
- Theme-specific empty state component if provided

### ChatInput.tsx
- All colors/borders from tokens
- Radius from tokens

### MessageList.tsx
- Theme's `loadingIndicator` component
- Background color from tokens

### MessageBubble.tsx
- Bubble colors/radius from tokens
- Delegate tool output rendering to `components.toolResultRenderer`
- Follow-up button styling from tokens

### ChatMarkdown.tsx
- Code block colors from tokens
- Heading/text colors from tokens
- Table border colors from tokens

## Error Handling

- Redis theme fetch fails → default to `bc-native`
- Theme component map missing a card → `GenericCard`
- Tool output missing/malformed → text summary fallback
- Theme switch is instant via context — no page reload
