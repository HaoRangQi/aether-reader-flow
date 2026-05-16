# Plan Deviations Log

Tracks intentional deviations from `docs/superpowers/plans/2026-05-16-aether-reader-flow.md`.
Each entry: date, what changed, why, impact on downstream tasks.

---

## 2026-05-17 — Tech stack version bump

**Plan said**: Next.js 14 + Tailwind CSS 3 + tailwind.config.ts.

**Actual**: `create-next-app@latest` produced **Next.js 16 + React 19 + Tailwind CSS 4** (eslint.config.mjs, postcss.config.mjs, no tailwind.config.ts).

**Why kept**: Newer versions are stable, supported, and Tailwind v4's CSS-first `@theme` directive simplifies the 6-theme-pack work in P5 (no separate config file to maintain). Forcing v3 would mean fighting the scaffold and accepting an EOL upgrade path.

**Impact on plan tasks**:
- **T1.11** — globals.css will use Tailwind v4 `@theme` syntax instead of editing `tailwind.config.ts` for color tokens. CSS variables strategy preserved (still drives runtime theme swap).
- **T5.1/T5.2** — theme tokens defined via JS object (`src/lib/themes.ts`) → applied at runtime via inline `style.setProperty` on `:root`. No change to Tailwind config file.
- **`next.config.ts`** instead of `next.config.js`.
- **`eslint.config.mjs`** instead of `.eslintrc.json`.
- Async `params` in dynamic routes already in plan (T1.13 wrote `await params`) — matches Next 16.

**No semantic plan changes.** All abstractions, file structures, and test cases hold. Implementation language for styling is the only thing adjusted.

---
