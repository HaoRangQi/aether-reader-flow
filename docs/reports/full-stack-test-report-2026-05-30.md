# Aether Reader Flow 全栈测试报告

## 1. 报告信息

| 字段 | 内容 |
|---|---|
| 项目 | Aether Reader Flow |
| 日期 | 2026-05-30 |
| 测试角色 | 全栈测试专家 |
| 技术栈 | Next.js 16.2.6、React 19、TypeScript、Vitest、Playwright、Dexie / IndexedDB |
| 本轮目标 | 对项目执行功能分析、测试计划、测试用例设计、可执行测试补强、静态审查、安全审查和执行验证 |
| 结论 | 自动化主链路通过；存在少量需后续专项验证的中低风险项 |

## 2. 步骤 1：理解与分析

### 2.1 功能点梳理

| 模块 | 主要功能 | 核心数据 / 状态 |
|---|---|---|
| 书架与上传 | PDF、EPUB、TXT 上传，批量导入，空书架状态 | `Book`、`Chapter`、IndexedDB |
| 阅读器 | 打开书籍，阅读章节，显示全文，阅读设置 | `ReaderStore`、`Chapter`、`ReadingProgress` |
| 划词 AI | 划词翻译、解释、验证、聊天入口 | selection state、AI stream、model routing |
| AI 解锁 | 首次配置主密码和 API Key，解锁已有模型服务 | `KeyVault`、`CryptoService`、`ModelService` |
| 时间轴 | 记录 AI 响应、token、模型、按书籍 / 章节查询 | `TimelineEntry` |
| 章节总结 | 生成总结、缓存、取消、重试、失败提示 | `ChapterSummary`、AI streaming |
| 导出 | 导出 Markdown / HTML / ZIP，生成阅读报告 | `ExportService`、annotations、timeline |
| 设置 | 模型服务、任务路由、预算、主题、字体、语言、存储调试 | `ConfigStore`、`ModelServiceRepo` |
| API Routes | AI task routes、模型列表、模型连接测试 | Web `Request` / `Response`、provider adapter |
| PWA | manifest、图标、installability 基础能力 | `manifest.webmanifest` |

### 2.2 核心领域模型

| 模型 | 作用 | 测试关注点 |
|---|---|---|
| `Book` | 书籍元数据 | 上传后是否可见、能否进入阅读器 |
| `Chapter` | 章节内容和摘要缓存 | 内容解析、摘要缓存失败、章节切换 |
| `Annotation` | 高亮、批注 | 锚点一致性、删除 / 更新失败 |
| `TimelineEntry` | AI 活动记录 | 并发 reload、失败请求隔离、成本显示 |
| `ModelService` | 模型服务配置 | API Key 存储、协议、启用模型列表 |
| `TaskRouting` | AI 任务到模型的映射 | 无模型、不可用模型、统一应用模型 |
| `Budget` / `Cost` | token 和成本统计 | 非有限数值、负值、刷新失败 |

### 2.3 关键业务流程

| 编号 | 流程 | 关键断言 |
|---|---|---|
| F1 | 新用户打开首页 | 显示空书架和上传入口 |
| F2 | 上传 TXT | 书籍卡片出现在书架，可点击进入阅读器 |
| F3 | 阅读器划词翻译 | 解锁 AI 后，选择文本可触发翻译并展示结果 |
| F4 | 时间轴记录 | 翻译结果写入时间轴，展示模型和 token |
| F5 | 导出 | 从书架打开导出弹窗，展示完整阅读报告模板说明 |
| F6 | 设置页 | 可进入模型服务、任务路由、存储状态等主配置区 |
| F7 | 模型 API | 拒绝非法 JSON、非法协议、跨源请求、危险 `baseUrl` |

### 2.4 潜在风险点

| 优先级 | 风险 | 说明 |
|---|---|---|
| P0 | 模型 API 可被跨源调用 | 会导致浏览器携带本地配置发起 provider 探测或消耗请求 |
| P0 | `baseUrl` 未严格限制 | 存在 SSRF、协议注入、credential-in-URL 泄露风险 |
| P0 | API Key 泄露 | provider 错误、网络错误、UI 错误提示都需要脱敏 |
| P1 | 大文件解析性能 | PDF / EPUB / TXT 大文件可能造成 UI 阻塞或内存高峰 |
| P1 | IndexedDB 异步一致性 | reload、clear、保存失败可能导致旧状态覆盖新状态 |
| P1 | Playwright 选区兼容性 | Chromium、Firefox、WebKit 的 selection 行为可能不同 |
| P2 | 依赖供应链 | Next 内置 `postcss@8.4.31` 仍有 moderate advisory |

## 3. 步骤 2：测试计划制定

### 3.1 测试类型覆盖

| 类型 | 工具 | 覆盖策略 | 当前状态 |
|---|---|---|---|
| 单元测试 | Vitest | services、stores、adapters、API helper | 已执行 |
| 组件测试 | Vitest + Testing Library | 上传、设置、阅读器面板、弹窗状态 | 已执行 |
| 集成测试 | Vitest | API route、storage repo、service 协作 | 已执行 |
| E2E | Playwright | 首页、设置、manifest、主阅读链路 | 已执行 |
| UI 可访问性 | Testing Library role / label 断言 | dialog、alert、status、combobox、progressbar | 部分覆盖 |
| API 安全 | Vitest route tests | same-origin、URL validation、错误脱敏 | 已补强 |
| 静态测试 | ESLint、TypeScript | lint、类型检查、build | 已执行 |
| 依赖安全 | `npm audit` | high / critical 阈值 | 已执行 |
| 性能测试 | 待专项脚本 | 大文件解析、导出 ZIP、流式 AI 长响应 | 未专项执行 |
| 兼容性测试 | 待扩展 Playwright projects | Firefox、WebKit、移动视口 | 未专项执行 |

### 3.2 模块测试策略

| 模块 | 单元 / 组件策略 | 集成 / E2E 策略 |
|---|---|---|
| 上传 | 文件格式、批量成功、部分失败、上传中禁用关闭 | TXT 上传进入书架 |
| 阅读器 | Reader state、章节内容、设置抽屉 | 进入 `/reader/[bookId]` 后显示全文 |
| AI 解锁 | 表单校验、保存中禁用、已有服务解锁失败 | E2E 模拟首次解锁 |
| AI 翻译 | mock streaming response、错误和 retry | E2E mock `/api/ai/translate` |
| 时间轴 | 并发 reload、防止旧请求覆盖、搜索 | E2E 验证翻译后出现 1 条记录 |
| 模型 API | request body、origin、baseUrl、protocol、redaction | route handler 级测试 |
| 设置 | 无模型、加载失败、保存失败、删除失败 | E2E 验证主设置区域可访问 |
| 导出 | 空数据、URL、文件名、对象 URL | E2E 验证导出弹窗入口 |

## 4. 步骤 3：详细测试用例

### 4.1 P0 用例

| ID | 模块 | 场景 | 输入 | 预期 |
|---|---|---|---|---|
| P0-01 | 上传 / 阅读 | TXT 主链路 | `money-flow.txt` | 书籍显示在书架，可进入阅读器 |
| P0-02 | AI 解锁 | 首次解锁 | 主密码 + Anthropic API Key | 弹窗关闭，AI 操作可用 |
| P0-03 | 划词翻译 | mock AI 翻译 | 选择 `M2 增速变化会影响市场预期` | 显示英文翻译 |
| P0-04 | 时间轴 | 翻译后记录 | 一次成功翻译 | 时间轴显示 1 条记录、模型和 token |
| P0-05 | 导出 | 打开导出入口 | 已上传 1 本书 | 显示导出思考文档弹窗 |
| P0-06 | API 安全 | 跨源请求 | `Origin: https://evil.example.com` | 403，且不解析 body、不触发 provider |
| P0-07 | API 安全 | 非法 `baseUrl` | `ftp://`、`javascript:`、userinfo、控制字符 | 400，且不触发 provider |
| P0-08 | API 安全 | provider error 含密钥 | `api_key=sk-secret...` | 返回错误已脱敏并截断 |

### 4.2 P1 用例

| ID | 模块 | 场景 | 预期 |
|---|---|---|---|
| P1-01 | 上传 | 批量部分成功 | 保留失败上下文，成功项触发刷新，不关闭弹窗 |
| P1-02 | 上传 | 上传中点击 backdrop | 不关闭弹窗 |
| P1-03 | 设置 | 模型服务加载失败 | alert 提示，可重试 |
| P1-04 | 任务路由 | 保存失败 | 保留原选择并提示 |
| P1-05 | AI Sidebar | 流式错误 | 显示 retry，不把失败对话带入下一次 history |
| P1-06 | 章节总结 | 取消后迟到 chunk | 不写入缓存，不污染 UI |
| P1-07 | 阅读统计 | 非有限 / 负数目标 | 不保存，显示错误 |
| P1-08 | Store | 并发 reload | 新请求结果不被旧请求覆盖 |

### 4.3 P2 用例

| ID | 模块 | 场景 | 预期 |
|---|---|---|---|
| P2-01 | PWA | manifest | `name`、`short_name`、`start_url`、icons 正确 |
| P2-02 | 兼容性 | Firefox / WebKit 选区 | 与 Chromium 行为一致 |
| P2-03 | 性能 | 200MB PDF 导入 | 不崩溃，提供可接受反馈 |
| P2-04 | 导出 | 大量 annotation / timeline | ZIP / Markdown 结构完整 |

## 5. 步骤 4：可执行测试代码

### 5.1 本轮新增 / 修改的测试能力

| 文件 | 变更 |
|---|---|
| `src/tests/e2e/smoke.spec.ts` | 新增 TXT 上传、阅读器、AI 解锁、划词翻译、时间轴、导出入口主路径 E2E |
| `src/app/api/models/list/route.test.ts` | 增加跨源拒绝、危险 `baseUrl` 拒绝；适配 Vitest 4 构造器 mock |
| `src/app/api/models/test/route.test.ts` | 增加跨源拒绝、危险 `baseUrl` 拒绝 |
| 多个 `*.test.tsx` / `*.test.ts` | 将被 `new` 调用的 `vi.fn(() => ...)` 改为 constructible `function` mock |

### 5.2 本轮新增 / 修改的生产代码

| 文件 | 变更 |
|---|---|
| `src/app/api/models/_lib/request.ts` | 新增模型 provider 请求统一校验 |
| `src/app/api/models/list/route.ts` | 复用统一请求校验，减少重复逻辑 |
| `src/app/api/models/test/route.ts` | 复用统一请求校验，并使用规范化后的 `baseUrl` |

## 6. 步骤 5：代码审查与静态测试

### 6.1 安全审查

| OWASP 类别 | 结果 |
|---|---|
| Broken Access Control / CSRF | 模型管理 API 新增 same-origin 校验，跨源请求返回 403 |
| SSRF | `baseUrl` 仅允许 `http:` / `https:`，拒绝 userinfo、控制字符、非法 URL |
| Sensitive Data Exposure | provider error 和 network error 继续执行脱敏 / 截断测试 |
| Security Misconfiguration | high / critical audit 为 0；保留 Next 内置 `postcss` moderate advisory |
| Injection | 拒绝 `javascript:`、控制字符、非法 URL |

### 6.2 静态测试结果

| 命令 | 结果 |
|---|---|
| `npm test` | 95 files / 721 tests passed |
| `npm run e2e` | 4 passed |
| `npm run lint -- --max-warnings 0` | passed |
| `npx tsc --noEmit` | passed |
| `npm run build` | passed |
| `npm audit --audit-level=high` | exit 0；仍报告 2 个 moderate |
| `git diff --check` | passed |

### 6.3 依赖与工具链审查

| 项 | 结果 |
|---|---|
| `happy-dom` | 从 `^15.11.7` 升级到 `^20.9.0`，清除 critical audit 来源 |
| `vitest` / `@vitest/ui` | 升级到 `^4.1.7`，同步修复构造器 mock 兼容问题 |
| `next` | 保持精确锁定 `16.2.6` |
| `eslint-config-next` | 保持精确锁定 `16.2.6` |
| Next SWC lockfile | 显式重装后 build 不再出现 SWC lockfile patch 警告 |

## 7. 步骤 6：测试执行模拟

### 7.1 自动执行

按以下顺序执行可复现本轮自动化验证：

```bash
npm install
npm test
npm run lint -- --max-warnings 0
npx tsc --noEmit
npm run build
npm run e2e
npm audit --audit-level=high
git diff --check
```

### 7.2 主路径 E2E 模拟

| 步骤 | 输入 / 操作 | 预期输出 |
|---|---|---|
| 1 | 打开首页 | 显示空书架和上传入口 |
| 2 | 上传 `money-flow.txt` | 书架出现 `money-flow` 链接 |
| 3 | 点击书籍 | URL 进入 `/reader/book-*`，展示全文 |
| 4 | 输入主密码和 Anthropic API Key | AI 解锁弹窗关闭 |
| 5 | 选择文本并点击翻译 | 显示 `M2 growth changes market expectations.` |
| 6 | 打开时间轴 | 显示 1 条翻译记录和 `claude-haiku-4-5 · 19 tokens` |
| 7 | 返回书架并点击导出 | 显示 `导出思考文档` 弹窗 |

### 7.3 API 安全模拟

| 输入 | 预期 |
|---|---|
| `Origin: https://evil.example.com` | 403 `{ "error": "Forbidden origin" }` |
| `baseUrl: "javascript:alert(1)"` | 400 `{ "error": "Invalid baseUrl" }` |
| `baseUrl: "https://user:pass@provider.example.com/v1"` | 400 `{ "error": "Invalid baseUrl" }` |
| `protocol: "ollama"` | 400 `{ "error": "Invalid provider protocol" }` |
| provider error 内含 API Key | 返回错误包含 `[redacted]`，不包含原始 secret |

## 8. 整体测试报告总结

| 维度 | 结论 |
|---|---|
| 功能主链路 | 已通过自动化 E2E 覆盖 |
| 单元 / 组件测试 | 95 个文件、721 个测试通过 |
| API 安全 | 已补强 P0 风险：跨源请求和危险 `baseUrl` |
| 静态质量 | lint、TypeScript、build 均通过 |
| 依赖安全 | high / critical 为 0；moderate 仍需跟踪 Next 上游 |
| 工具链稳定性 | Next SWC lockfile patch 警告已消除 |
| 未覆盖范围 | 真实 provider、跨浏览器、大文件性能、移动视口 |

## 9. 高优先级风险清单

| 优先级 | 风险 | 当前状态 | 建议 |
|---|---|---|---|
| P0 | 模型 API 跨源调用 | 已修复并测试 | 保持 route tests |
| P0 | 危险 `baseUrl` 导致 SSRF / 注入 | 已修复并测试 | 后续可增加 allowlist 配置 |
| P1 | 真实 provider 行为差异 | 未专项测试 | 使用测试 key 做 nightly smoke |
| P1 | 大文件导入 / 导出性能 | 未专项测试 | 增加 fixture 和性能预算 |
| P1 | Firefox / WebKit 选区差异 | 未专项测试 | 扩展 Playwright projects |
| P2 | Next 内置 `postcss` moderate advisory | 暂无非破坏性修复 | 跟踪 Next 发布，避免 `npm audit fix --force` 降级 Next |

## 10. 建议改进点

1. 增加 Firefox、WebKit Playwright 项目，尤其覆盖划词、弹窗、导出流程。
2. 增加 50MB、200MB、500MB 文件导入性能基准，记录耗时、内存和 UI 可响应性。
3. 增加真实 OpenAI / Anthropic / OpenAI-compatible provider 的 smoke 测试，放入 CI secret 环境。
4. 为导出 Markdown / ZIP 增加结构快照测试，覆盖批注、时间轴、章节总结混合数据。
5. 持续跟踪 Next 16 后续版本，优先消除 `postcss` moderate advisory。
6. 对 API `baseUrl` 考虑增加可选 allowlist 或私网地址拦截策略，进一步降低 SSRF 面。

