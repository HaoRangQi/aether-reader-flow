# Aether Reader Flow - 提交治理与分批发布指引

> 更新日期：2026-05-25  
> 目的：在大规模 WIP worktree 中，降低一次性提交风险，保证可回滚、可验证、可追责。

## 1. 当前工作区快照

- 当前分支：`master`（跟踪 `origin/master`）
- staged：空（建议保持按切片精确 add）
- 未提交文件量：`201`（已跟踪修改 `103`，未跟踪新增 `98`）
- 质量门状态（2026-05-25 本轮复核）：
  - `npx tsc --noEmit` 已通过（原 `ModelServiceForm.test.tsx:159` 阻塞已修复）

## 2. 分批提交原则

1. 单批只覆盖一个可讲清楚的业务目标。
2. 每批都能独立通过最小质量门（targeted test/lint）。
3. 不跨批混入无关文件，避免 review 和回滚成本失控。
4. 每批提交信息都要包含：改什么、为何改、如何验证。

## 3. 建议提交切片（按优先级）

### 切片 A：阅读器 UX 热修（优先）

目标：先把用户可感知问题修好，尽快恢复可用性。

建议范围（按目录）：

- `src/components/reader/*`
- `src/components/library/BookCard.tsx`
- `src/lib/themes.ts`
- 对应测试文件（如 `*.test.tsx`）

建议重点覆盖：

- AI 对话按钮支持开合 toggle
- AI 侧栏支持“新开会话”和可拉高输入框
- 章节总结改为浮动层可见
- 主题“豆芽绿”降低刺眼高亮
- 书架卡片图标补可见提示语（不改原位置）

建议最小验证：

```bash
npm test -- src/components/reader/AISidebar.test.tsx src/components/reader/ChapterSummaryPanel.test.tsx src/components/library/BookCard.test.tsx
npm run lint -- src/components/reader/ReaderView.tsx src/components/reader/AISidebar.tsx src/components/reader/ChapterSummaryPanel.tsx src/components/library/BookCard.tsx src/lib/themes.ts
```

### 切片 B：模型服务与路由配置链路

目标：保证“配置模型服务 → 测试连接 → 路由使用”闭环稳定。

建议范围：

- `src/components/settings/*`
- `src/app/api/models/*`
- `src/adapters/models/*`
- `src/services/ConfigService*`

建议最小验证：

```bash
npm test -- src/components/settings/ModelServiceForm.test.tsx src/components/settings/ModelServiceConfig.test.tsx src/app/api/models/list/route.test.ts src/app/api/models/test/route.test.ts
npm run lint -- src/components/settings src/app/api/models src/adapters/models src/services/ConfigService.ts
```

### 切片 C：阅读留痕与数据层（批注/进度/会话/时间轴）

目标：稳定本地存储契约，减少刷新后状态丢失与回放异常。

建议范围：

- `src/adapters/storage/*`
- `src/stores/*`
- `src/lib/reading-*`、`src/lib/chat-*`、`src/lib/selection-*`
- `src/components/reader/Timeline*`、`Annotation*`

建议最小验证：

```bash
npm test -- src/adapters/storage src/stores src/lib/reading-stats.test.ts src/lib/chat-memory.test.ts src/components/reader/TimelinePanel.test.tsx src/components/reader/AnnotationPanel.test.tsx
npm run lint -- src/adapters/storage src/stores src/lib src/components/reader
```

## 4. 统一质量门（切片收口后）

> 在每一轮切片合并前，必须执行完整门禁：

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run e2e
```

备注：若 `tsc` 失败，必须在提交描述中显式记录阻塞项与责任切片，不得静默带过。

## 5. 提交信息模板（推荐）

```text
feat: <一句话描述业务收益>

Scope:
- <模块 A>
- <模块 B>

Why:
- <问题现状/用户反馈>

Validation:
- <targeted test/lint 命令与结果>
- <全量质量门结果>
```

## 6. 风险提示

- 当前工作区是大规模并行 WIP，严禁 `git add .`。
- 若同一文件同时承载多个业务目标，建议先拆分为最小可审改动后再提交。
- 对“刷新后需重复解锁 AI”等高频痛点，应优先进入下一切片，避免用户体验持续恶化。
