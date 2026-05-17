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

需要 Node.js ≥ 20。

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:3000

### 首次配置

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

## 🔧 命令

```bash
npm run dev        # 开发服务器，http://localhost:3000
npm run build      # 生产构建
npm run start      # 生产运行
npm test           # Vitest 单元 / 集成
npm run test:watch # 监视模式
npm run e2e        # Playwright 端到端
npm run e2e:install# 首次安装 Chromium
npm run lint       # ESLint（--max-warnings 0 干净）
```

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
