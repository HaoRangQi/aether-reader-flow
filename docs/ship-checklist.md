# Ship Checklist — Aether Reader Flow MVP

Pre-flight checklist before tagging a release. Tick items in order; do not
skip the manual end-to-end walkthrough.

## Build & Quality Gates

- [ ] `npm test` — all unit/integration tests pass
- [ ] `npm run lint -- --max-warnings 0` — zero warnings
- [ ] `npm run build` — clean production build (no TS errors)
- [ ] `npm run e2e` — Playwright smoke passes

## Functional Coverage

### Library
- [ ] Empty state renders on a fresh profile
- [ ] PDF upload accepts a real Chinese finance book (e.g., 钱从哪里来)
- [ ] Upload rejects non-PDF
- [ ] Upload rejects file > 500 MB
- [ ] BookCard click navigates to reader
- [ ] Download icon opens ExportDialog (does NOT navigate)

### Reader
- [ ] Three columns render (nav / content / right-side panels)
- [ ] Chapter list shows correct count + titles
- [ ] Chapter switching is instant (< 300ms)
- [ ] ChapterContent uses user-selected font / size / line height
- [ ] Selection in chapter body pops up SelectionPopover at correct location
- [ ] Selection outside chapter body does NOT pop

### Selection Popover
- [ ] 翻译 streams inline with bilingual output + term annotations
- [ ] 解释 streams inline with 4 named sections
- [ ] 验证 shows progress, returns JSON with sources, parsed correctly into TimelineEntry
- [ ] 深入 opens AISidebar with anchor set to the selection
- [ ] Error in any of the above renders inline (no app crash)
- [ ] Close (X) clears the popover

### AISidebar
- [ ] Empty state on open
- [ ] First user message → assistant streams → final usage chunk → cost refresh
- [ ] Multi-turn preserves history
- [ ] ModelSwitcher lists all enabled models
- [ ] Changing ModelSwitcher uses new model for the next message (override)
- [ ] Enter sends, Shift+Enter newlines
- [ ] Error mid-stream shows in last bubble; subsequent sends work

### ChapterSummaryPanel
- [ ] First time on chapter → streams summary → parsed into 4 sections
- [ ] Cached on chapter → next open is instant
- [ ] "重新生成" forces fresh AI call

### TimelinePanel
- [ ] Lists all entries reverse-chronologically
- [ ] Chapter filter narrows correctly
- [ ] Type filter (chips) narrows correctly
- [ ] Search box matches originalText / userInput / aiResponse

### Settings
- [ ] Settings page reachable from home page link
- [ ] All 5 sections render
- [ ] Adding a service: name + baseUrl + key + test connection works
- [ ] Saving without API key on existing service preserves cipher
- [ ] Deleting a service updates the list
- [ ] Task routing dropdowns populated from enabled models
- [ ] Theme picker changes UI immediately on selection
- [ ] Mode toggle (light/dark/auto) flips colors live
- [ ] Font preferences live preview reflects choice
- [ ] Saving font prefs persists across reload
- [ ] Budget input persists across reload

### Cost & Budget
- [ ] BudgetIndicator on home page shows month/today CNY
- [ ] Threshold 80% triggers warning toast (do a real call to hit it if not already)
- [ ] Threshold 100% triggers danger toast
- [ ] CostBadge per AI exchange in timeline shows model + tokens + USD

### Export
- [ ] Markdown export downloads .md with all chapters and entries
- [ ] HTML export downloads .html; opens offline in browser
- [ ] HTML escapes special chars (paste `<script>` as a title → confirm rendered text)
- [ ] Export filter by chapters works

## Non-functional

- [ ] No console errors during typical session
- [ ] No "Please use the legacy build" warnings reach the browser console
- [ ] All 6 themes render correctly in both light and dark (12 combinations)
- [ ] Keyboard shortcuts: Cmd+B / Cmd+D / Cmd+Shift+S / arrow keys
- [ ] Window resized < 1024px shows the narrow-viewport banner
- [ ] `prefers-reduced-motion` disables popover/sidebar animations

## Security

- [ ] API Key never appears in any client-side JS bundle (grep dist for known prefix)
- [ ] API Key never appears in server logs
- [ ] Bad master password fails decryption gracefully (no crash)
- [ ] Locking the vault clears the in-memory cache (next AI call fails with `Vault is locked`)

## Performance

- [ ] Chapter switch ≤ 300 ms (visual)
- [ ] Selection popover ≤ 100 ms (visual)
- [ ] AI first token ≤ 2 s on typical API latency
- [ ] Chapter summary completes < 30 s for a 30k-token chapter (with progress UI)

## Cost (real end-to-end)

- [ ] One real finance book (~30k tokens × 30 chapters), full read + ~100 AI calls
  → total < ¥350 (target ¥300)
- [ ] Translate task uses Haiku (cost badge confirms)
- [ ] Cost badge accurate to ±5% versus actual API receipt

## Release Mechanics

- [ ] `docs/superpowers/plans/deviations.md` final review — all open items either
  resolved or moved to a future-work issue
- [ ] README "已知限制" section accurate
- [ ] git status clean (no uncommitted files)
- [ ] All commits descriptive and Chinese-style per project convention
- [ ] Tag with `git tag v0.1.0-mvp`
