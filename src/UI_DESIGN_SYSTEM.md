# Vanara Central — UI Design System

## Phase 1 status

The shared visual foundation is installed. This phase intentionally does not redesign screens and does not modify backend, API, data, routing, or business logic.

## Product personalities

### Operations

Mobile-first LINE LIFF interface for resort staff. Priorities: clarity, speed, large touch targets, low cognitive load, English and Thai support.

### Guest

A native-app-style resort companion. Priorities: immersion, honest tropical character, real photography, restrained navigation, and calm motion. It must not feel like a responsive marketing website.

Both products share the same token core, while later phases may assign different semantic values and component treatments.

## Files

- `src/theme/tokens.css`: primitive and semantic design tokens.
- `src/theme/foundations.css`: reset, accessibility, safe-area, language and motion foundations.
- `src/index.css`: single global entry point.

## Naming

All public custom properties use the `--vc-` prefix. Shared utility classes use the `vc-` prefix.

## Token rules

1. Components must consume semantic variables before raw palette values.
2. Hard-coded colors, shadows, radii and spacing should be removed progressively when each screen is dressed.
3. Thai content must never be constrained by fixed heights intended for English text.
4. Interactive targets should be at least `--vc-touch-min`.
5. Motion must honor `prefers-reduced-motion`.
6. Safe areas must be respected on iOS and LIFF webviews.

## Typography

- Display: Marcellus, then Noto Serif Thai / Georgia fallback.
- Body: Lato, then Noto Sans Thai and system fallbacks.
- Fonts are referenced but not bundled in this delta. Existing or later asset delivery can provide them without changing component contracts.

## Theme readiness

Light is the active default. `[data-theme="dark"]` is prepared at token level only; no UI control or automatic switching is introduced in Phase 1.

## Phase boundary

Phase 2 can apply these tokens to the frozen Operations UI and consolidate duplicated Today-screen styling without touching behavior.
