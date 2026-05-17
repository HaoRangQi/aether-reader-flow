# Aether Reader Flow

> 让你读懂一本书的 AI 辅助阅读 Web 应用。

为深度阅读设计的「理解闭环引擎」。每一次划词、每一次提问、每一次验证 — 都被记录到你的思考文档里，可随时导出。

## ✨ 核心能力

- 📖 **划词翻译/解释** — 阅读时弹出气泡，立即理解陌生术语
- 🌐 **联网验证** — AI 调用 Web Search 工具，对作者观点求证、给来源
- 📝 **整章总结** — 一键生成结构化的章节摘要（核心论点 / 关键概念 / 论证逻辑 / 章末思考）
- 💬 **多轮追问** — 基于划选原文的深度对话
- 📜 **时间轴日志** — 所有 AI 交互按时间累加，支持筛选 + 搜索
- 📤 **多格式导出** — Markdown / 自包含 HTML，让思考可带走

## 🎨 设计哲学

**纸质阅读 + 玻璃工具** — 阅读区温润如纸、工具区悬浮如水镜。6 个预置主题包（羊皮纸 / 报刊 / 远海 / 莲青 / 枫丹 / 竹翠）含中国传统色，浅深双主题。

## 🚀 快速开始

### 环境要求

- **Node.js ≥ 20**（推荐 20 LTS 或 22 LTS；用 `node -v` 检查）
- **npm ≥ 10**（随 Node 安装）
- **现代浏览器**：Chrome / Edge ≥ 120 或 Safari ≥ 17（需要 `backdrop-filter`、`crypto.subtle`、IndexedDB v3、`color-mix()`）
- **磁盘空间**：约 600MB（含 node_modules、Playwright Chromium、PDF.js worker）
- **网络**：能访问 `api.anthropic.com`（或你配置的中转站 / 自托管 endpoint）

### 安装

```bash
# 1. 克隆仓库
git clone <repo-url> aether-reader-flow
cd aether-reader-flow

# 2. 安装依赖（首次约 1-2 分钟）
npm install

# 3.（可选）安装 Playwright Chromium，做 e2e 时才需要
npm run e2e:install
```

### 开发模式

```bash
npm run dev
# 浏览器打开 http://localhost:3000
# Turbopack 已默认开启，热重载快
```

### 生产构建

```bash
# 1. 类型检查（可选，build 会自动做）
npx tsc --noEmit

# 2. Lint（建议先过）
npm run lint -- --max-warnings 0

# 3. 测试（建议先过）
npm test

# 4. 构建（产物在 .next/，约 30-60 秒）
npm run build

# 5. 启动生产服务器（默认 3000，可改 PORT）
npm run start
# 或：PORT=8080 npm run start
```

### 部署

**自托管（推荐）**

```bash
# 在目标机器上
git pull
npm ci              # 用 lockfile 严格安装
npm run build
npm run start       # 或用 pm2 / systemd 包一层
```

注意：没有外部数据库或后端服务。`.next/` + `public/` + `node_modules/`（或 `next start` 所需子集）+ Node 运行时即可。

**Vercel / Netlify / Cloudflare Pages**

支持 Next.js 16 App Router 的 PaaS 一键部署。Build command：`npm run build`，output：`.next`。不需要额外环境变量（API Key 在用户浏览器本地）。

### 环境变量

MVP 默认**不需要任何服务端环境变量** — API Key 由用户在设置页输入，加密存于浏览器 IndexedDB。

如未来引入服务端密钥或遥测，统一加到 `.env.local`（已在 `.gitignore` 中），例如：

```bash
# .env.local — 例（当前 MVP 无此需求）
# NEXT_PUBLIC_SENTRY_DSN=...
# SOME_SERVER_ONLY_SECRET=...
```

### 首次配置（首次跑起来后）

1. 首页右上角设置图标
2. 「模型服务」→ 选预置 service（Anthropic / OpenAI / DeepSeek / OpenRouter / 硅基流动 / 自定义）→ 输入 API Key + 主密码（用于本地加密存储）
3. 「任务路由」→ 为 5 个 AI 任务（翻译 / 解释 / 验证 / 总结 / 对话）各选一个模型
4. 「成本预算」→ 设置月度上限（默认 ¥300，达到 80% / 100% 会有提醒）
5. 「外观主题」→ 选你喜欢的主题包 + 浅深模式
6. 「阅读偏好」→ 字号 / 行高 / 自定义字体

完成后回到首页上传 PDF，开始读懂一本书。

## 🛠 技术栈

- Next.js 16 App Router
- TypeScript 严格模式
- Tailwind CSS v4（`@theme` 驱动 CSS 变量）
- Zustand 4 客户端状态
- Dexie 4 (IndexedDB)
- PDF.js 4 文档解析
- Anthropic SDK + 自研 OpenAI-兼容 SSE 解析器
- Framer Motion / 纯 CSS animations
- Vitest 单元 / 集成测试
- Playwright E2E

## 📚 文档

- `docs/superpowers/specs/2026-05-16-aether-reader-flow-design.md` — 完整 PRD（14 章）
- `docs/superpowers/plans/2026-05-16-aether-reader-flow.md` — 实施计划（68 任务 / 5 Phase）
- `docs/superpowers/plans/deviations.md` — 实施偏差记录（Next 16 / Tailwind v4 等）
- `docs/ship-checklist.md` — MVP 上线核对清单
- `AGENTS.md` — Next 16 兼容性提示

## 🔧 命令速查

```bash
# 开发
npm run dev          # 开发服务器，http://localhost:3000（Turbopack 热重载）

# 构建 & 运行
npm run build        # 生产构建到 .next/
npm run start        # 启动生产服务器（需先 build）

# 测试
npm test             # Vitest 单元 / 集成 跑一次
npm run test:watch   # Vitest 监视模式
npm run test:ui      # Vitest UI（浏览器面板）
npm run e2e          # Playwright 端到端（会自动起 dev server）
npm run e2e:install  # 首次需要装 Chromium

# 代码质量
npm run lint                       # ESLint
npm run lint -- --max-warnings 0   # 严格模式（CI 应该用这个）
npx tsc --noEmit                   # 类型检查（不输出 .js）
```

## 🧰 故障排查

- **`npm run dev` 报 `next: command not found`** — 先 `npm install`
- **Playwright e2e 报缺浏览器** — 跑 `npm run e2e:install`
- **PDF 上传卡住** — 检查浏览器是否能加载 `public/pdf.worker.min.mjs`（DevTools Network）
- **AI 调用 401 / 403** — 设置页「模型服务」→ 编辑 → 重新填 API Key，或点「测试连接」
- **章节切分错乱** — PDF 没有 outline 会走「全文」单章兜底，这是预期行为
- **IndexedDB 配额满** — 浏览器 DevTools → Application → Storage → 清除 origin 数据后重新配置

## ⌨ 键盘快捷键

阅读视图：

- `⌘/Ctrl + B` — 切换时间轴
- `⌘/Ctrl + Shift + S` — 切换 AI 侧栏
- `⌘/Ctrl + D` — 浅 / 深模式切换
- `←` / `→` — 上一章 / 下一章

## 🔒 安全模型

- **API Key 存储**：浏览器 IndexedDB；用主密码经 PBKDF2(200k 迭代) 派生密钥后 AES-GCM 加密。每会话首次使用需输入主密码（不入 sessionStorage，跨页签隔离）。
- **API Key 传输**：仅 client → `/api/ai/*` server route → AI provider；服务端不持久化、不写日志。
- **威胁模型**：Web 应用边界 — 保护 IndexedDB 数据被外部脚本/复制读取。**不**保护本机被恶意软件控制的场景。详见 `src/services/CryptoService.ts` JSDoc。

## 📜 版权声明

MVP 阶段仅供个人使用。**用户对上传的 PDF 内容承担合法持有责任。** 公开发行或多人共享前必须重新评估版权合规。

## 📦 项目结构

```
src/
├── adapters/            # 依赖反转适配器
│   ├── models/          # ModelProvider + Anthropic / OpenAI-compat / factory
│   ├── search/          # SearchProvider + ClaudeWebSearch
│   ├── storage/         # IndexedDB Repos + Dexie schema
│   ├── parsers/         # DocumentParser + PdfParser
│   └── sync/            # SyncAdapter（二期实现）
├── services/            # 业务逻辑（AIService / BookService / 等）
├── stores/              # Zustand 客户端状态
├── components/
│   ├── library/         # 书架 / 卡片 / 上传 / 导出
│   ├── reader/          # 阅读视图 / 划词气泡 / AI 侧栏 / 时间轴 / 章节总结
│   ├── settings/        # 设置页 5 节
│   └── shared/          # GlassPanel / PaperSurface / Skeleton / Toast / ...
├── lib/                 # 主题 / Prompt 模板 / 工具函数
├── types/               # 共享类型
└── app/
    ├── page.tsx                  # 书架
    ├── reader/[bookId]/page.tsx  # 阅读
    ├── settings/page.tsx         # 设置
    └── api/                      # AI / 上传 / 导出 / 测试 API Routes
```

## 🤝 贡献

任意接手维护者请先读：

1. PRD（`docs/superpowers/specs/`）— 理解为什么这么做
2. Plan（`docs/superpowers/plans/`）— 理解实施顺序
3. `AGENTS.md` — Next 16 破坏性变更提醒
4. 任一 service / adapter 的 JSDoc 头部 — 设计意图与边界

## 📄 许可

MIT
