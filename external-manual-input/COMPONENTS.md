# Component Documentation

> **Last Updated:** 2026-09-04. Stale entries (removed Monday.com integration, old timeline context) were replaced with the current navigation, roadmap, and timeline components below.

## Shared Components

### `<ToastProvider>` / `useToast()`
Toast notification system. Wraps the app and provides `addToast(type, message, duration?)`.

**Types:** `'success' | 'error' | 'info' | 'warning'`

```tsx
const { addToast } = useToast()
addToast('success', 'Saved!')
addToast('error', 'Something went wrong', 5000)
```

### `<Skeletons>`
Loading placeholders for perceived performance.

- `SkeletonLine` — single text line placeholder
- `SkeletonCircle` — avatar placeholder
- `SkeletonCard` — card placeholder
- `SkeletonTable` — table with rows/cols
- `SkeletonPeopleGrid` — people card grid

### `<SessionTimeout>`
Auto-logout after 1hr of inactivity. Warns 1 minute before.

### `<ErrorBoundary>`
Catches React errors per-route. Props: `name` (string for debugging).

### `<ProtectedRoute>`
Route guard. Redirects to `/login` if not authenticated.

## Hooks

### `useKeyboardShortcuts(combo, handler, deps?)`
Register global keyboard shortcuts. Automatically ignores INPUT/TEXTAREA/SELECT (except Escape).

```tsx
useKeyboardShortcuts('mod+s', () => save(), [save])
useKeyboardShortcuts('escape', () => closeModal(), [closeModal])
```

### `useCommonShortcuts({ onSave?, onEscape? })`
Convenience hook for Ctrl+S and Escape.

## Utilities

### `lib/auditLog.ts`
- `logAudit({ username, action, entity, details? })` — log an action
- `loadAuditLog()` — get all entries
- `clearAuditLog()` — clear history

### `lib/productsStore.ts`
- `loadProducts()` — get product list (falls back to defaults)
- `saveProducts(products)` — persist product list

### `lib/galleryApi.ts`
- `fetchGalleryImages()` — fetch all images from GCS via Netlify function
- Returns `GalleryImage[]` with `{ id, image_url, name, created_at }`
- Uses `/api/gallery` endpoint (redirects to `/.netlify/functions/gallery-images`)

## Contexts

### `AuthContext`
- `state` — `{ status, user?, token? }`
- `login(username, password)` — authenticate
- `logout()` — sign out

### `ToastContext`
- `toasts` — current toast list
- `addToast(type, message, duration?)` — show toast
- `removeToast(id)` — dismiss toast

> **Removed:** `TimelineProjectsContext` and the Monday.com integration were deleted (see CHANGELOG 1.4.0). The current timeline lives in `screens/Product/Timeline/` — see below.

## New Components

### `<Masonry />` (`components/Masonry.tsx`)
GSAP-powered masonry gallery layout used by Gallery Showcase.

**Props:**
```tsx
interface MasonryProps {
  items: { id: string; img: string; url: string; aspectRatio: number }[]
  ease?: string              // GSAP easing (default: 'power3.out')
  duration?: number          // Animation duration (default: 0.6)
  stagger?: number           // Stagger delay between items (default: 0.05)
  animateFrom?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'random'
  scaleOnHover?: boolean     // Shrink on hover (default: true)
  hoverScale?: number        // Hover scale factor (default: 0.95)
  blurToFocus?: boolean      // Blur-to-focus entrance (default: true)
  colorShiftOnHover?: boolean // Gradient overlay on hover
}
```

Heights are computed from `columnWidth * aspectRatio` for true image proportions.

### `<Sidebar />` (`components/Sidebar.tsx`)
Collapsible section navigation with per-user persisted state (`vela-sidebar-collapsed`, `vela-sidebar-sections`).
- **General** — Dashboard
- **Product** — Focus Board, Roadmap (`/products/roadmap`), Priority, Feature Request, All Products, Product Map
- **Team Hub** — Team Overview, People, Sprint, Team Timeline
- **Auxiliary** — Chart Code, Tools, Gallery, Documentation, Learning
- **Private** — Settings, Overtime, Finance, Vault, IT PM Secret (grant-gated)

### `<BottomNav />` (`components/BottomNav.tsx`)
Mobile bottom navigation bar. Only renders on touch devices (detected via `ontouchstart`, `maxTouchPoints`, and `pointer: coarse`). Won't show on desktop or when F12 dev tools is open.

Navigation: Dashboard | Products | Team | More (sidebar menu)

## Product Roadmap (`screens/Product/Roadmap/`)

### `<ProductRoadmapPage />`
Strategic initiatives per product. Three views: **Now / Next / Later** horizon board, **Monthly** grid, **Quarterly** grid. Data via `lib/productRoadmap.ts` → `/api/product-roadmap`.

### `<InitiativeModal />`
Create / edit form for a roadmap initiative. Key fields: title, theme, product, owner, horizon, status, confidence, progress — plus a custom **Start + Target/ETA** estimation range (date pickers with 2-week / 1-month presets). The legacy `target_quarter` is auto-derived from the target date. Remounted via `key` on every open so the form is always fresh.

### `<MonthlyGrid />` / `<QuarterlyGrid />`
Products-as-rows grids. Dated initiatives occupy exactly the months/quarters their range overlaps (two items can share one quarter); undated legacy items fall back to `target_quarter`. Cells sort by estimation start date.

### `roadmapConfig.ts`
Quarter/month key helpers plus date-range utilities: `parseLocalDay`, `itemDateRange`, `itemMonthKeys`, `itemQuarterKeys`, `itemDateLabel`, `itemDateSortKey`.

## Product Timeline (`screens/Product/Timeline/`)

### `<ProductTimelinePage />` / `<SwimLaneTimeline />`
Product- and team-lane Gantt with Day/Week/Month/Quarter/Year/Custom zoom, drag-to-move, edge resize, dependency connectors, and per-lane add. Blocks are created/edited via `<TimelineBlockModal />` with `<DateRangePicker />` (calendar range picker).

## Feature Requests (`screens/FeatureRequests/`)

### `<FeatureCard />`
Kanban card showing priority badge, version tag, product chips, assignee, and — when set — a sky-blue `start → target` estimation chip.

### `<NewRequestModal />` / `<RequestDetail />`
Both expose an **Estimation** section (Start + Target/ETA date inputs) backed by `feature_requests.start_date` / `target_date`. `RoadmapView.tsx` groups quarters by that range instead of `created_at`.
