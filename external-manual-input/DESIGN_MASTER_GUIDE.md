# Vela Unified Design Master Guide

**Maintained by:** Product + Engineering  
**Version:** 2.0 (Unified)  
**Last Updated:** 2026-04-29  
**Theme:** Emerald Slate (Dark-Native)

This document is the single source of truth for Vela's design system. It combines our core design principles, the Emerald Slate color specification, and component patterns to ensure a consistent, premium user experience across the entire platform.

---

## 1. Design Principles

| Principle | Description |
|-----------|-------------|
| **Clarity over decoration** | Visual elements must serve a purpose. Accents (glows/gradients) should highlight content, not distract from it. |
| **Accessible at a glance** | Users should understand status and urgency in <2 seconds. Combine color, shape, and value. |
| **Consistent Density** | Standardize padding: compact for dashboards (`p-4`), breathable for details (`p-5`/`p-6`). |
| **Progressive Disclosure** | Surface summaries in cards; use modals or dedicated pages for deep dives. |
| **Emerald for Growth** | We moved away from "AI Purple" to Emerald to signal clarity, productivity, and forward motion. |

---

## 2. The 60:30:10 Design System

Vela follows a strict distribution rule to maintain visual hierarchy in our dark-native environment.

### 60% — Dominant (Backgrounds & Foundations)
**The Canvas:** Deep, quiet surfaces that let content breathe.
- **`--color-bg-deep` (`#09090b`)**: Page body, dashboard background.
- **`--color-bg-base` (`#0f1117`)**: Main layout area, modal backdrops.
- **`--color-bg-surface` (`#181b23`)**: Lower panels, collapsed sidebars.

### 30% — Secondary (Surfaces & Containers)
**The Elements:** Elevated cards and containers where action happens.
- **`--color-card` (`#1e2230`)**: Bento grid cards, form containers.
- **`--color-card-hover` (`#252a3a`)**: Subtle lift on interactive cards.
- **`--color-sidebar` (`#161922`)**: Sidebar background.
- **Glassmorphism**: `backdrop-filter: blur(12px)` with `border-white/5`.

### 10% — Accent (Emerald Primary)
**The Focus:** Primary actions, status indicators, and energetic highlights.
- **`--color-primary-500` (`#10B981`)**: Hero color for buttons, links, and active navigation.
- **`--color-primary-glow`**: `rgba(16, 185, 129, 0.35)` for focus rings and aurora effects.
- **Semantic Sync**: Emerald **IS** Success. This unifies our brand language.

---

## 3. Color Palette & Tokens

### Brand Accent — Emerald
| Token | Hex | Usage |
|-------|-----|-------|
| `primary-400` | `#34D399` | Hover text, secondary accents |
| `primary-500` | `#10B981` | **Hero color** — main CTAs, active nav |
| `primary-600` | `#059669` | Pressed states, active tab backgrounds |
| `primary-glow` | `rgba(16,185,129,0.35)` | Shadows, shimmer borders, aurora |

### Neutral Scale — Zinc
We use **Zinc** neutrals to avoid the "flat" feel of pure grays.
- **Text Primary**: `#F4F4F5` (Zinc-100)
- **Text Secondary**: `#A1A1AA` (Zinc-400)
- **Border Default**: `rgba(255,255,255,0.06)`

### Semantic Status
- **Success/Growth**: Emerald (`#10B981`)
- **Warning/Stretched**: Amber (`#F59E0B`)
- **Critical/Danger**: Red (`#EF4444`)
- **Info/Technical**: Cyan (`#06B6D4`)

---

## 4. Typography

- **Body & UI**: `DM Sans` — Clean, highly readable at small sizes.
- **Display & Headings**: `Outfit` — Bold, geometric for high impact.
- **Numbers**: Always use `tabular-nums` class to prevent layout shift during updates.

| Role | Specification |
|------|---------------|
| Page Title | `text-xl font-semibold zinc-100` |
| Card Title | `text-sm font-semibold zinc-100` |
| KPI Value | `text-2xl font-bold tabular-nums zinc-50` |
| KPI Label | `text-[11px] font-medium uppercase tracking-wider zinc-400` |

---

## 5. Surface & Component Patterns

### 5.1 The Standard Card
Every card should use glassmorphism and the standard border hierarchy.
```tsx
<div className="rounded-xl border border-white/5 bg-zinc-900/60 backdrop-blur-md 
                transition-all hover:shadow-lg hover:shadow-emerald-900/20">
  {/* Content goes here */}
</div>
```

### 5.2 Interactive Tiles (Bento Style)
- **Lift**: `hover:-translate-y-0.5`
- **Glow**: Subtle emerald shadow on hover.
- **Accent Bar**: 2px vertical bar on the left edge for high-priority items.

### 5.3 Glassmorphism Specification
| Element | Blur | Transparency |
|---------|------|--------------|
| Sidebar | 12px (md) | `zinc-900/50` |
| Header | 24px (xl) | `zinc-950/80` |
| Main Cards | 12px (md) | `zinc-900/60` |

---

## 6. Motion & AI-Native Effects

Vela uses "Living UI" elements to signal AI activity and state changes.

- **Aurora Glow**: A cycling radial gradient (`emerald` tones) with `filter: blur(20px)`. Used in PRD Generator and loading states.
- **Shimmer Border**: `conic-gradient` using emerald-to-teal transitions for active AI processing.
- **Entrance**: Use `animate-fade-in` (0.2s) for content and `animate-scale-in` for modals.

---

## 7. Do & Don't

| ✅ DO | ❌ DON'T |
|-------|----------|
| Use `zinc-*` for all neutrals. | Use `gray-*` or `slate-*`. |
| Declare both light and dark variants (`dark:`). | Leave a color with no dark counterpart. |
| Use `rounded-xl` for cards/containers. | Mix different radii in the same row. |
| Use `tabular-nums` for all metrics. | Let shifting digits cause layout "jitter". |
| Use `lucide-react` exclusively. | Import icons from Ant Design or FontAwesome. |

---

## Appendix: CSS Reference

Drop-in CSS variables for new components:
```css
:root {
  --color-primary: #10B981;
  --color-primary-glow: rgba(16, 185, 129, 0.35);
  --glass-border: rgba(255, 255, 255, 0.05);
  --text-main: #F4F4F5;
}
```
