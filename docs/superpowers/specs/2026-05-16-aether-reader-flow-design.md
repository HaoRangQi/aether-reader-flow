# Aether Reader Flow — 产品设计文档（PRD）

**版本**：v1.0
**日期**：2026-05-16
**状态**：草案，待评审

---

## 0. 速览

**一句话定义**：一个面向中英文长内容（短期主攻金融科普书籍）的 AI 辅助阅读 Web 应用，核心使命是**闭合"读不懂"的瞬间**——以下文中将"读不懂的瞬间"称为**理解缺口**。

**核心钉子**：让你读懂。

**技术形态**：Next.js Web 应用，前端 + API Routes 同工程。

**MVP 周期**：12 周（5 个 Phase）。

---

## 1. 产品愿景与定位

### 1.1 愿景

**让深度阅读不再卡在"看不懂"上。**

读一本典型的金融科普书，平均每 10 分钟就会遇到一个不熟悉的概念（M2、SLF、逆回购、通胀传导……）、一个未经验证的观点、一段需要查证的引用。传统应对方式（百度跳出阅读流、问朋友、放过去算了）都在打断**心流**。

Aether Reader Flow 的存在意义，是让每一次"读不懂"的瞬间都被一次轻量、可信、有源的 AI 回答闭合。

### 1.2 定位

> **不是 ChatGPT 阅读插件，不是 Notion 笔记应用，不是 Readwise。**
> 是**专为深度阅读场景设计的"理解闭环引擎"**。

| 维度 | 定位 |
|------|------|
| 主诉求 | 闭合理解缺口（不是记笔记，不是收藏，不是社交） |
| 主场景 | 桌面 Web，工作日晚饭后或周末 1-3 小时深度阅读 |
| 主用户 | 想认真读懂一本书的个体（学者、从业者、严肃学习者） |
| 主内容 | 中英文长文章/书籍（短期：金融科普） |
| 价值主张 | "读不懂的瞬间，被一次轻量、可信、有源的 AI 回答闭合" |

### 1.3 钉子哲学

**所有功能都必须服务于"读懂"。否则砍。**

- 划词翻译 ✅ —— 闭合语言缺口
- 划词解释 ✅ —— 闭合概念缺口
- 联网验证 ✅ —— 闭合可信度缺口
- 整章总结 ✅ —— 闭合全局理解缺口
- 追问对话 ✅ —— 闭合追问追到底
- 时间轴日志 ✅ —— 沉淀读懂的过程
- 多格式导出 ✅ —— 让读懂的成果带得走
- 陪读人格 ❌ 二期 —— 不为"读懂"，砍
- 多 AI 共读 ❌ 二期 —— 不为"读懂"，砍

---

## 2. 目标用户与场景

### 2.1 目标用户

**主用户画像**：

- 个体阅读者，对内容认真投入
- 中英文都读，但短期主要读中文金融科普书
- 桌面 PC/Mac 用户为主
- 愿意为 AI 调用费用付出合理成本（个人每月 ¥几百量级可接受）
- 关注数据所有权（数据要能带走）

**非目标用户**（明确排除）：

- 移动端碎片化阅读用户
- 社交化读书圈用户
- 完全免费需求用户
- 公开发行/多用户协作场景

### 2.2 核心使用场景

**场景一：金融科普书学习**

用户晚饭后打开一本金融科普 PDF：
1. 上传 PDF，系统按章节切分
2. 进入某一章「宽信用如何传导到资产价格」
3. 看到"M2 增速从 8% 上升到 12%" → 划词"M2" → 气泡显示解释
4. 看到"央行扩表必然推高房地产价格" → 划词此句 → 选"验证此观点" → AI 联网验证并给出三个反对观点的来源
5. 读完整章 → 点"章节总结" → AI 生成本章核心三段
6. 在 AI 回答下追问"那 2015-2018 年是反例吗？" → 继续对话
7. 关闭浏览器，时间轴日志已自动保存所有交互
8. 一周后导出全书思考文档为 Markdown 放进 Obsidian

**场景二：英文原版书突破**

用户读一本英文原版投资类书：
1. 上传 PDF
2. 遇到 "margin of safety" → 划词 → 中文翻译 + 投资术语解释
3. 看到作者对成长股的论述 → 觉得逻辑可疑 → 划词 → 「请验证此观点的现代有效性」→ AI 引用近 20 年学术研究反馈
4. 同样产生时间轴日志、可导出

### 2.3 使用频率

- **目标频次**：每周 3-4 次，每次 1-2 小时
- **目标深度**：3-4 周内读完一本中等厚度书（200-300 页）
- **目标产出**：每本书 50-150 条时间轴条目，1 份导出文档

---

## 3. 核心功能规格

### 3.1 一期功能（MVP，12 周内交付）

#### F1：PDF 导入与章节切分

**输入**：用户上传 PDF 文件（支持 1-500MB）

**处理**：
- 优先读取 PDF 内嵌目录（outline / bookmark）
- 若 PDF 有目录 → 按目录切分为章节单元
- 若 PDF 无目录 → 显示原文页码 1-N 让用户手动标记章节起止页
- 失败兜底：作为"无章节单一文档"处理

**输出**：
- 书籍记录（含 metadata：标题、作者、上传时间）
- 章节列表（每章含起止页、文本内容）
- 文本内容存储到 IndexedDB

**非目标**（明确不做）：
- OCR（扫描版 PDF 不在一期范围）
- EPUB/TXT 解析（接口预留，不实现）
- 加密 PDF 解锁

#### F2：阅读视图

**布局**：默认专注模式

```
┌───────────────────────────────────────────────────┐
│ 📖 当前书籍标题  >  第 3 章 宽信用如何传导到资产价格 │
├───────────────────────────────────────────────────┤
│                                                   │
│         [章节正文，单栏居中，宽度可调]            │
│                                                   │
│   M2 增速从 8% 上升到 12%，意味着流动性...        │
│             ↑                                     │
│        [划词触发轻量气泡]                         │
│                                                   │
├───────────────────────────────────────────────────┤
│ [章节总结]  [📜 时间轴]  [⚙️ 设置]              │
└───────────────────────────────────────────────────┘
```

**交互**：
- 划词后弹出轻量气泡，包含 4 个按钮：[翻译] [解释] [验证] [深入]
- 点 [翻译] / [解释] / [验证] → 结果直接显示在气泡内（≤300 字时）
- 点 [深入] → 打开右侧 AI 侧边栏，进入深度对话

**性能要求**：
- 章节切换 ≤ 300ms
- 划词气泡弹出 ≤ 100ms
- AI 响应首字 ≤ 2s（流式输出）

#### F3：划词翻译

**触发**：划词 → [翻译] 按钮
**默认模型**：Haiku（成本优先）
**输出**：直接显示翻译（中→英 或 英→中 自动判断）
**特殊**：保留原文术语提示（如"hedge → 对冲（保留 hedge 原词的'屏障'语义）"）

#### F4：划词解释

**触发**：划词 → [解释] 按钮
**默认模型**：Sonnet
**输出**：
- 概念定义
- 在本书/本章中的具体含义
- 通俗类比（一句话能听懂的例子）
- 相关概念（链接到本章其他可能不懂的术语）

#### F5：划词联网验证

**触发**：划词（一句话或一段观点）→ [验证] 按钮
**默认模型**：Sonnet + Claude Web Search
**输出**：
- 观点摘要（AI 重述用户划选的观点）
- 支持证据（2-3 条带 URL）
- 反对证据（2-3 条带 URL）
- 综合判断（"广泛认可" / "存在争议" / "已被驳斥" / "缺乏证据"）
- 置信度（高/中/低）

**安全约束**：
- 引用必须含 URL，URL 必须真实可访问
- 严禁编造来源
- 来源时间戳不超过 5 年（金融领域要求）

#### F6：整章总结

**触发**：章节工具栏 → [章节总结] 按钮
**默认模型**：Sonnet
**输出**：
- 本章核心论点（≤3 条）
- 关键概念清单
- 作者的论证逻辑（流程图描述）
- 章末待思考问题（3-5 个）

**性能**：≤30s 内生成（30 章书每章 1-2 万字 token，需流式输出 + 进度提示）

#### F7：追问对话

**触发**：在任何 AI 回答下方 → 输入框 → 追问
**默认模型**：用户当前任务模型，可通过对话顶部切换器临时切换
**特性**：
- 完整保留前面 AI 的上下文
- 划词原文作为上下文锚点（始终在 prompt 中）
- 流式输出

#### F8：时间轴日志（思考文档）

**自动生成**：所有 AI 交互自动追加到当前会话的时间轴

**条目结构**：
```
{
  timestamp: ISO8601,
  chapter: "第3章",
  page: 45,
  type: "translate" | "explain" | "verify" | "summarize" | "chat",
  original_text: "划选的原文",
  user_input: "用户提问（如有）",
  ai_model: "claude-sonnet-4-6",
  ai_response: "AI 回答全文",
  sources: ["url1", "url2"],  // 仅 verify 类型
  confidence: "high",          // 仅 verify 类型
  cost_tokens: { input: 1000, output: 500 },
  cost_amount: 0.012,          // 美金
  persona: "general"           // 二期预留：陪读人格
}
```

**视图**：
- 默认按时间倒序显示
- 可按章节筛选
- 可按类型筛选（翻译/解释/验证/总结/对话）
- 支持搜索原文/AI 回答

#### F9：多格式导出

**触发**：书籍详情页 → [导出] 按钮

**Markdown 格式**：
- 章节为一级标题
- 每条时间轴条目为子标题（含时间戳）
- 原文 / 用户提问 / AI 回答 / 来源 全部结构化
- 适合 Obsidian / Notion 二次加工

**HTML 格式**：
- 排版美观（可读性优先）
- 适合分享给他人查看（导出为可独立打开的 HTML 文件）
- 包含 CSS 内联

**非目标**：
- 不支持 PDF 导出（一期太复杂）
- 不支持 DOCX

#### F10：模型服务管理

**配置 UI**（参考 Cherry Studio）：

```
设置 → 模型服务
  ├─ 预置 Service
  │   ├─ Anthropic Claude
  │   │   ├─ API Key: [输入框]
  │   │   ├─ API Base URL: https://api.anthropic.com [可改]
  │   │   ├─ 启用模型: [☑] claude-sonnet-4-6  [☑] claude-haiku-4-5
  │   │   └─ [测试连接]
  │   ├─ OpenAI
  │   ├─ DeepSeek
  │   ├─ OpenRouter（中转站示例）
  │   └─ 硅基流动（中转站示例）
  └─ [+ 添加自定义服务]
      ├─ Service 名称
      ├─ API Base URL
      ├─ API Key
      ├─ 协议类型: [Anthropic 原生 | OpenAI 兼容]
      └─ [测试连接] → 拉取模型列表
```

**任务路由设置**：

```
设置 → 任务路由
  ├─ 划词翻译 → [模型下拉] 默认 Haiku
  ├─ 概念解释 → [模型下拉] 默认 Sonnet
  ├─ 联网验证 → [模型下拉] 仅显示支持 web search 的模型
  ├─ 章节总结 → [模型下拉] 默认 Sonnet
  └─ 追问对话 → [模型下拉] 默认 Sonnet
```

**对话顶部切换器**：
- 在 AI 侧边栏顶部、章节总结面板顶部均有
- 显示"当前任务模型"
- 点开下拉选其他模型 → 临时切换（仅本次对话）
- 不修改全局任务路由设置

#### F11：成本计量

**实时显示**：
- 每次 AI 调用后，在回答下方显示本次消耗（input/output tokens + 估算美金）
- 顶部 nav 显示"今日累计"
- 设置页显示"本月累计"

**预算提醒**：
- 用户可设置月度预算（默认 ¥300）
- 累计达到 80% / 100% 时分别提示
- 不强制中断使用，仅提醒

**计价表内置**：
- 一期硬编码常见模型价格（Sonnet/Haiku/GPT-4o 等）
- 自定义模型可手动填写 input/output 单价

---

### 3.2 二期功能（明确预留，不实现）

| 功能 | 一期预留方式 |
|------|------------|
| 陪读人格化 | 数据模型 `persona` 字段，默认 "general" |
| 多 AI 共读对比 | 数据模型预留 `comparison_session` 表结构 |
| 云同步 + 多设备 | `SyncAdapter` 接口预留，实现为 `NullSyncAdapter` |
| 移动端响应式 | CSS 不写死宽度，但不主动适配 |
| EPUB / TXT 解析 | `DocumentParser` 接口预留 |
| OCR 扫描版 PDF | 接口预留 |
| 本地 Ollama 模型 | `ModelProvider` 中 `OpenAICompatibleProvider` 已可兼容 |
| 知识卡片/章节总结提取 | 基于一期时间轴日志可后期提取 |

---

## 4. 架构设计

### 4.1 总体架构

```
┌────────────────────────────────────────────────────────┐
│                  Next.js 14+ (App Router)              │
│                                                        │
│  ┌──────────────────────────────────────────────┐    │
│  │  Frontend Layer                                │    │
│  │  - React Components                            │    │
│  │  - Zustand State Management                    │    │
│  │  - shadcn/ui + Tailwind                        │    │
│  └──────────────────────────────────────────────┘    │
│                       ↓                                │
│  ┌──────────────────────────────────────────────┐    │
│  │  API Routes Layer (server-side)                │    │
│  │  - /api/books/*                                │    │
│  │  - /api/ai/*                                   │    │
│  │  - /api/exports/*                              │    │
│  │  - 集中处理 API key（绝不暴露给前端）           │    │
│  └──────────────────────────────────────────────┘    │
│                       ↓                                │
│  ┌──────────────────────────────────────────────┐    │
│  │  Core Service Layer                            │    │
│  │  ┌────────────────┐ ┌─────────────────┐      │    │
│  │  │ AIService      │ │ BookService     │      │    │
│  │  │ - TaskRouter   │ │ - PdfParser     │      │    │
│  │  │ - ModelRegistry│ │ - ChapterSplitter│     │    │
│  │  └────────────────┘ └─────────────────┘      │    │
│  │  ┌────────────────┐ ┌─────────────────┐      │    │
│  │  │ TimelineService│ │ ExportService   │      │    │
│  │  └────────────────┘ └─────────────────┘      │    │
│  │  ┌────────────────┐ ┌─────────────────┐      │    │
│  │  │ CostMeter      │ │ ConfigService   │      │    │
│  │  └────────────────┘ └─────────────────┘      │    │
│  └──────────────────────────────────────────────┘    │
│                       ↓                                │
│  ┌──────────────────────────────────────────────┐    │
│  │  Adapter Layer (依赖反转)                       │    │
│  │  - ModelProvider (Anthropic | OpenAICompat)    │    │
│  │  - SearchProvider (ClaudeWebSearch)            │    │
│  │  - StorageRepo (IndexedDB via Dexie)           │    │
│  │  - DocumentParser (PDF.js)                     │    │
│  │  - SyncAdapter (Null impl)                     │    │
│  └──────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘

         ↓ 浏览器持久层
   IndexedDB (Dexie wrapper)
```

### 4.2 核心抽象（依赖反转）

#### ModelProvider

```typescript
interface ModelProvider {
  id: string;                    // "anthropic" | "openai-compatible-1"
  protocol: "anthropic" | "openai";
  baseUrl: string;
  apiKey: string;                // 仅服务端访问
  models: ModelInfo[];           // 启用的模型列表

  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  testConnection(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;  // 若 endpoint 支持
}

interface ModelInfo {
  id: string;                    // "claude-sonnet-4-6"
  name: string;
  contextWindow: number;
  supportsWebSearch: boolean;
  pricing: { input: number; output: number };  // per 1M tokens, USD
}

// 实现
class AnthropicProvider implements ModelProvider { ... }
class OpenAICompatibleProvider implements ModelProvider { ... }
```

#### SearchProvider

```typescript
interface SearchProvider {
  id: string;
  search(query: string): Promise<SearchResult[]>;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: Date;
}

class ClaudeWebSearchProvider implements SearchProvider { ... }
// 二期：TavilyProvider, BraveProvider
```

#### StorageRepo

```typescript
interface BookRepo {
  create(book: BookInput): Promise<Book>;
  get(id: string): Promise<Book | null>;
  list(): Promise<Book[]>;
  delete(id: string): Promise<void>;
}

interface ChapterRepo { ... }
interface TimelineRepo { ... }
interface ConfigRepo { ... }

// 实现
class IndexedDBBookRepo implements BookRepo { ... }
// 二期：SQLiteBookRepo（实现完全替换、业务层零修改）
```

#### TaskRouter

```typescript
interface TaskRouter {
  resolveModel(taskType: TaskType, override?: ModelId): ModelInfo;
}

enum TaskType {
  TRANSLATE = "translate",
  EXPLAIN = "explain",
  VERIFY = "verify",
  SUMMARIZE = "summarize",
  CHAT = "chat",
}
```

### 4.3 文件结构

```
aether-reader-flow/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # 首页（书库）
│   │   ├── reader/[bookId]/page.tsx  # 阅读视图
│   │   ├── settings/page.tsx         # 设置页
│   │   └── api/
│   │       ├── books/
│   │       │   ├── upload/route.ts
│   │       │   └── [id]/route.ts
│   │       ├── ai/
│   │       │   ├── translate/route.ts
│   │       │   ├── explain/route.ts
│   │       │   ├── verify/route.ts
│   │       │   ├── summarize/route.ts
│   │       │   └── chat/route.ts
│   │       └── exports/route.ts
│   ├── components/                   # React 组件
│   │   ├── reader/
│   │   │   ├── ReaderView.tsx
│   │   │   ├── SelectionPopover.tsx
│   │   │   ├── AISidebar.tsx
│   │   │   ├── TimelinePanel.tsx
│   │   │   └── ChapterSummaryPanel.tsx
│   │   ├── library/
│   │   │   ├── BookList.tsx
│   │   │   └── UploadDialog.tsx
│   │   ├── settings/
│   │   │   ├── ModelServiceConfig.tsx
│   │   │   ├── TaskRoutingConfig.tsx
│   │   │   └── BudgetConfig.tsx
│   │   └── shared/
│   │       ├── ModelSwitcher.tsx     # 对话顶部切换器
│   │       └── CostBadge.tsx
│   ├── services/                     # 业务逻辑
│   │   ├── AIService.ts
│   │   ├── BookService.ts
│   │   ├── TimelineService.ts
│   │   ├── ExportService.ts
│   │   ├── CostMeter.ts
│   │   └── ConfigService.ts
│   ├── adapters/                     # 适配器实现
│   │   ├── models/
│   │   │   ├── AnthropicProvider.ts
│   │   │   ├── OpenAICompatibleProvider.ts
│   │   │   └── ModelProvider.ts      # interface
│   │   ├── search/
│   │   │   ├── ClaudeWebSearchProvider.ts
│   │   │   └── SearchProvider.ts
│   │   ├── storage/
│   │   │   ├── indexeddb/
│   │   │   │   ├── BookRepo.ts
│   │   │   │   ├── ChapterRepo.ts
│   │   │   │   ├── TimelineRepo.ts
│   │   │   │   └── ConfigRepo.ts
│   │   │   └── interfaces/
│   │   ├── parsers/
│   │   │   ├── PdfParser.ts
│   │   │   └── DocumentParser.ts     # interface
│   │   └── sync/
│   │       ├── NullSyncAdapter.ts    # 一期实现
│   │       └── SyncAdapter.ts        # interface
│   ├── stores/                       # Zustand stores
│   │   ├── readerStore.ts
│   │   ├── timelineStore.ts
│   │   └── configStore.ts
│   ├── lib/                          # 工具函数
│   │   ├── prompts/                  # AI Prompt 模板
│   │   │   ├── translate.ts
│   │   │   ├── explain.ts
│   │   │   ├── verify.ts
│   │   │   ├── summarize.ts
│   │   │   └── chat.ts
│   │   ├── pdf-utils.ts
│   │   └── format-utils.ts
│   └── types/                        # TypeScript 类型定义
├── public/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-05-16-aether-reader-flow-design.md  ← 本文档
├── package.json
└── README.md
```

---

## 5. 数据模型

### 5.1 IndexedDB Schema（通过 Dexie）

```typescript
// 数据库版本 1
db.version(1).stores({
  books: 'id, title, author, uploadedAt',
  chapters: 'id, bookId, [bookId+orderIndex], title',
  pages: 'id, chapterId, pageNumber, [chapterId+pageNumber]',  // PDF 原始页面文本
  timeline: 'id, bookId, chapterId, timestamp, type, [bookId+timestamp]',
  configs: 'key',  // key-value 存储
  modelServices: 'id, name',
  costRecords: 'id, timestamp, [timestamp+model]'
});
```

### 5.2 主要实体

```typescript
interface Book {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  totalPages: number;
  totalChapters: number;
  uploadedAt: Date;
  lastReadAt?: Date;
  language: 'zh' | 'en' | 'mixed';
}

interface Chapter {
  id: string;
  bookId: string;
  orderIndex: number;
  title: string;
  startPage: number;
  endPage: number;
  content: string;  // 完整文本
  wordCount: number;
  summaryCache?: ChapterSummary;  // 缓存的章节总结
}

interface TimelineEntry {
  id: string;
  bookId: string;
  chapterId: string;
  timestamp: Date;
  type: 'translate' | 'explain' | 'verify' | 'summarize' | 'chat';
  originalText: string;          // 划选的原文
  page?: number;
  userInput?: string;            // 用户提问
  aiModel: string;
  aiResponse: string;
  sources?: SourceRef[];         // verify 类型
  confidence?: 'high' | 'medium' | 'low';
  costTokens: { input: number; output: number };
  costAmount: number;            // USD
  persona: string;               // 二期预留，默认 "general"
  threadId?: string;             // 追问对话同属一个 thread
}

interface SourceRef {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: Date;
}

interface ModelService {
  id: string;
  name: string;
  protocol: 'anthropic' | 'openai';
  baseUrl: string;
  apiKey: string;  // 加密存储（详见 7.3 安全）
  enabled: boolean;
  enabledModels: string[];
}

interface TaskRouting {
  translate: ModelRef;
  explain: ModelRef;
  verify: ModelRef;
  summarize: ModelRef;
  chat: ModelRef;
}

interface ModelRef {
  serviceId: string;
  modelId: string;
}
```

### 5.3 二期预留字段（一期不使用，但 schema 已定）

```typescript
interface TimelineEntry {
  // 一期字段 ...
  persona: string;               // 二期：陪读人格 id
  comparisonSessionId?: string;  // 二期：多 AI 共读会话 id
}

// 二期：多 AI 共读会话表
interface ComparisonSession {
  id: string;
  question: string;
  models: string[];
  responses: { [modelId: string]: string };
  createdAt: Date;
}
```

---

## 6. 关键 UX 流程

### 6.1 首次使用流程

```
1. 用户打开 http://localhost:3000
2. 显示欢迎页 → "你还没配置 AI 服务，是否现在配置？"
3. 进入设置页 → 选预置 Service（默认引导 Anthropic Claude）
4. 输入 API Key → [测试连接]
5. 选择默认任务路由（提供合理默认值，用户可改）
6. 设置月度预算（默认 ¥300）
7. 完成 → 跳转书库页
8. 引导上传第一本 PDF
```

### 6.2 阅读交互流程

```
1. 进入阅读视图（默认第 1 章）
2. 阅读过程中划词
3. 弹出气泡 → [翻译] [解释] [验证] [深入]
4a. 点 [翻译] → 气泡内显示翻译（300 字内）
4b. 点 [解释] → 气泡内显示解释（300 字内）
4c. 点 [验证] → 气泡显示进度 → 完成后展开多源结果
4d. 点 [深入] → 右侧 AI 侧栏打开 + 划词作为锚点
5. 时间轴日志自动累加每次交互
6. 章节末 → 点 [章节总结] → 顶部展开总结面板
```

### 6.3 模型切换流程

```
场景：用户在 AI 对话中临时想试试另一个模型

1. AI 侧栏顶部：[Claude Sonnet 4.6 ▼]
2. 点开下拉 → 显示所有"已启用模型"
3. 选 DeepSeek V3
4. 后续对话使用 DeepSeek V3（仅本次会话）
5. 任务路由全局设置不变
```

### 6.4 导出流程

```
1. 书库页 → 点击书籍 → [导出] 按钮
2. 选格式：[Markdown] | [HTML]
3. 选范围：[全书] | [指定章节] | [指定时间段]
4. [生成] → 浏览器下载
```

---

## 7. UI 设计

> **设计哲学**：纸质阅读 + 玻璃工具 — 阅读区"亲近书本"，工具区"悬浮智能"。

UI 在本产品中**不亚于功能的重要性**。功能可以用时间留住人，但视觉**一秒钟就决定用户是否留下**。本章节确立产品的视觉宪法。

### 7.1 设计哲学

**核心隐喻**：用户像在一本古书旁，悬浮着一面智能水镜。

**视觉分区铁律**：

| 元素 | 材质 | 理由 |
|------|------|------|
| 章节正文区域 | 纸 | 长时间凝视，不能模糊不能反光 |
| 章节标题、目录 | 纸 | 与正文一体 |
| 顶部导航栏 | 玻璃 | 工具区，悬浮感 |
| 划词气泡 | 玻璃 | 临时浮层，"召唤而来" |
| AI 侧边栏 | 玻璃 | 工具区，可调出可隐藏 |
| 时间轴日志面板 | 玻璃 | 工具区 |
| 设置页 | 玻璃 | 配置区 |
| 书库页 | 混合 | 卡片是纸，框架是玻璃 |
| 模型切换器 | 玻璃 | 工具控件 |
| 章节总结面板 | 玻璃 | 工具区，可关闭 |

### 7.2 主题系统

#### 7.2.1 一期预置 6 个主题包

每个主题包包含浅色 + 深色双主题，可独立切换。

| 主题包 | 浅色性格 | 深色性格 | 强调色 |
|--------|--------|--------|--------|
| 📜 **羊皮纸**（默认） | 暖纸 #FAF8F4 | 深褐书房 #1A1714 | 暖橙 #C8783F |
| 📰 **报刊** | 报纸白 #F5F2EC | 油墨黑 #0E0D0B | 深红 #A02C2C |
| 🌊 **远海** | 薄雾蓝 #F0F4F7 | 深海蓝 #0A1620 | 月白 #D4E4F2 |
| 🪷 **莲青**（中国传统） | 莲白 #F6F4F0 | 墨青 #1B2330 | 莲青 #5C7896 |
| 🍁 **枫丹**（中国传统） | 米白 #F8F4ED | 古铜 #1F1612 | 丹色 #B33E2A |
| 🎋 **竹翠**（中国传统） | 嫩竹白 #F2F5EE | 松柏深绿 #0E1A14 | 竹青 #5B7A4E |

**默认**：📜 羊皮纸 浅色

#### 7.2.2 主题 Token 结构

```typescript
interface Theme {
  id: string;
  name: string;
  light: ColorTokens;
  dark: ColorTokens;
}

interface ColorTokens {
  // 背景层
  background: string;          // 整体背景（纸色）
  surface: string;             // 卡片/面板（玻璃半透明用此色）
  surfaceElevated: string;     // 浮层（气泡、对话框）

  // 文本层
  text: string;                // 正文 (#2C2A28，暖墨黑)
  textMuted: string;           // 次要文字
  textSubtle: string;          // 辅助文字

  // 强调与状态
  accent: string;              // 主强调色
  accentHover: string;
  selection: string;           // 划词高亮（马克笔色，半透明）

  // 功能色
  success: string;             // verify 高置信
  warning: string;             // verify 中置信
  danger: string;              // verify 低置信/错误
  info: string;                // 链接、提示

  // 边框与分割
  border: string;
  divider: string;

  // 玻璃专用
  glassOverlay: string;        // 玻璃的半透明白/黑（如 rgba(255,255,255,0.7)）
  glassBorder: string;         // 玻璃边框（如 rgba(0,0,0,0.06)）
  glassGlow: string;           // 玻璃微发光色
}
```

#### 7.2.3 主题切换 UX

- 设置页 → 主题（grid 展示 6 个主题包，每个含浅+深预览缩略图）
- 顶部 nav 快速切换浅/深（不切主题包，只切当前包内 light/dark）
- 系统跟随选项（auto）

### 7.3 字体系统

#### 7.3.1 默认字体

| 用途 | 中文 | 英文 |
|------|------|------|
| 正文 serif | 思源宋体 Source Han Serif SC | Source Serif Pro |
| UI sans | 思源黑体 Source Han Sans SC | Inter |
| 数字/代码 | — | IBM Plex Mono |

**授权**：全部 OFL/Apache 2.0 开源免费。

**加载策略**：
- WOFF2 格式，预加载
- 中文按 unicode-range 子集化，按需加载
- 英文字体全量加载（小）

#### 7.3.2 字体偏好设置（F12）

```
设置 → 阅读偏好
  ├─ 正文字体: [默认: Source Serif Pro, 思源宋体]
  │             [自定义: 输入 CSS font-family]
  ├─ 字号: [小 14px | 中 17px (默认) | 大 20px]
  ├─ 行高: [紧凑 1.6 | 适中 1.8 (默认) | 宽松 2.0]
  └─ [实时预览面板]
```

实现：用户在输入框填写 CSS font-family 字符串（如 `"Charter, Optima, 宋体, serif"`），通过 CSS 变量 `--user-font-family` 应用到正文区域。

### 7.4 视觉细节

#### 7.4.1 纸质区域细节

```css
.paper-surface {
  background: var(--theme-background);    /* 不是纯白/纯黑 */
  color: var(--theme-text);                /* 不是 #000，是暖墨黑 */
  /* 极细微噪点纹理 */
  background-image: url('data:image/svg+xml;...');  /* opacity 0.02-0.04 */
}

.reader-content {
  font-family: var(--user-font-family, "Source Serif Pro", "Source Han Serif SC", serif);
  font-size: 17px;
  line-height: 1.8;
  max-width: 720px;        /* 黄金阅读宽度 */
  letter-spacing: 0.01em;
  hyphens: auto;
}

/* 划词高亮 - 模拟马克笔 */
mark.user-selection {
  background: linear-gradient(
    180deg,
    transparent 60%,
    var(--theme-selection) 60%
  );
  /* 模拟马克笔从底部 60% 开始上色 */
  padding: 0 2px;
}
```

#### 7.4.2 玻璃区域细节（适中强度）

```css
.glass-panel {
  background: var(--theme-glass-overlay);   /* rgba(255,255,255,0.72) 浅 */
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid var(--theme-glass-border);
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.06),
    0 1px 0 rgba(255, 255, 255, 0.5) inset;      /* 顶部高光 */
}

/* hover 时微发光 */
.glass-panel:hover {
  backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.08),
    0 0 24px var(--theme-glass-glow),            /* 微发光 */
    0 1px 0 rgba(255, 255, 255, 0.55) inset;
}

/* 重要状态发光：如 verify 高置信结果 */
.glass-panel.highlight-success {
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.08),
    0 0 32px var(--theme-success),
    0 1px 0 rgba(255, 255, 255, 0.55) inset;
}
```

#### 7.4.3 动效原则

| 场景 | 时长 | 缓动 | 备注 |
|------|------|------|------|
| 章节切换 | 200ms | ease-out | fade + y(8px) 偏移 |
| 划词气泡出现 | 250ms | spring | scale 0.96 → 1 + opacity |
| AI 侧栏展开 | 300ms | ease-out | 宽度 0 → 420px |
| 玻璃 hover | 200ms | ease | backdrop-saturate 增加 |
| AI 流式输出 | 12-15ms/字 | — | 逐字显示 |
| 主题切换 | 400ms | ease | 全局色值过渡 |

### 7.5 完整状态设计（F13）

UI 必须完整覆盖所有状态，无半成品感。

#### 7.5.1 加载状态（skeleton）

- 书库加载 → 卡片骨架
- 章节加载 → 段落骨架（多行 placeholder）
- AI 调用中 → 流式输出（不需骨架）+ 进度指示
- 章节总结生成 → 进度条（0% → 100%）+ 实时状态文字

#### 7.5.2 空状态

| 场景 | 空状态设计 |
|------|----------|
| 书库无书 | 居中插画 + "上传你的第一本书" + 上传按钮 |
| 章节无时间轴条目 | 居中文字 + "开始划词，AI 会陪你读懂" |
| 设置页未配置 Provider | 引导卡片 + "你还没配置 AI 服务" + [立即配置] |

#### 7.5.3 错误状态

| 场景 | 错误状态设计 |
|------|----------|
| PDF 解析失败 | 玻璃错误卡片 + 错误说明 + [重试] + [兜底为无章节模式] |
| API 调用失败 | 浮层 toast 玻璃 + 错误文字 + [重试] |
| API key 无效 | inline 提示 + [前往设置] |
| 网络断开 | 顶部条玻璃带 + "网络已断开" |
| 月度预算超出 | 浮层警告 + [仍要继续] / [前往调整预算] |

#### 7.5.4 唯本微交互（增加"秀"度）

- **划词时**：纸面下方出现"墨水波纹"扩散动画（150ms 一次）
- **AI 输出时**：玻璃面板从左到右掠过透明阳光（subtle shimmer）
- **联网验证完成**：高置信结果出现时玻璃边缘有金色微闪（120ms 一次）
- **章节切换**：进入新章时，章节号在屏幕中央短暂浮现（500ms 后淡出）
- **保存时间轴成功**：右下角玻璃徽章浮现"✓" 500ms 后淡出

### 7.6 组件库选型

- **基础组件**：shadcn/ui（轻量、可定制、Tailwind 友好）
- **动效**：Framer Motion（spring 物理动效）
- **图标**：Lucide Icons（线性、统一）
- **样式**：Tailwind CSS + CSS variables（主题切换）
- **字体加载**：next/font + 子集化策略

### 7.7 响应式与可访问性

- **响应式断点（一期）**：
  - ≥1280px：完整三栏布局
  - 1024-1279px：侧栏可隐藏
  - <1024px：明确提示"建议在桌面端使用"
- **键盘快捷键**：
  - `⌘/Ctrl + K`：打开命令面板
  - `⌘/Ctrl + B`：切换侧栏
  - `⌘/Ctrl + D`：切换浅/深
  - `←/→`：上一章/下一章
- **可访问性**：
  - 对比度 ≥ AA（WCAG 2.1）
  - 焦点可见（focus ring）
  - 主题切换不丢失键盘焦点

---

## 8. 非功能性需求

### 8.1 性能

- 章节加载 ≤ 300ms
- 划词气泡弹出 ≤ 100ms
- AI 流式首字 ≤ 2s
- 章节总结生成 ≤ 30s（含进度提示）
- IndexedDB 单本书容量上限 100MB（PDF 文本 + 时间轴）

### 8.2 可靠性

- API 调用失败 → 重试 1 次 → 显示错误 + 不消耗预算
- IndexedDB 写入失败 → 内存保留 + 用户可见提示
- PDF 解析失败 → 兜底为"无章节"模式
- 长文章 AI 调用超过模型 context → 自动分段处理

### 8.3 安全

- **API Key 存储（一期方案）**：
  - 用户的 API Key 仅存储在浏览器本地的 IndexedDB 中，**永不上传服务端持久化**
  - API Key 通过 **Web Crypto API 的 AES-GCM** 加密存储，加密密钥由用户设置的"主密码"经 PBKDF2 派生（首次启动时引导用户设置）
  - 应用启动时需要用户输入主密码解锁 → 解锁后 key 仅保留在浏览器内存中
  - API Key 由前端→/api 路由→AI Provider 的链路上**仅在 server 端内存中转发**，从不写日志
  - 一期接受局限：本地纯 Web 应用方案，安全性取决于浏览器/操作系统的本地隔离，需向用户明示。二期可迁移到 Tauri/桌面应用时升级为 OS keychain（macOS Keychain / Windows Credential Manager）
- **跨站点保护**：所有 API Routes 校验 Origin header
- **输入验证**：PDF 文件类型 + 大小校验
- **输出过滤**：AI 响应不直接 innerHTML，防 XSS

### 8.4 隐私

- 用户数据完全在本地（IndexedDB）
- API Key 不发送到任何第三方服务（除目标 AI Provider）
- 不收集任何遥测数据
- 二期云同步功能必须明确知情同意

### 8.5 版权合规

⚠️ **明确声明**：

- MVP 阶段仅供用户**个人**使用
- 用户上传 PDF 需为合法持有
- 应用 README 与首次启动需展示版权提示
- 不提供书籍共享、不主动获取版权内容
- **公开发行前**需重新评估版权合规策略

---

## 9. AI 成本预算

### 9.1 单本书估算（30 万字金融书，30 章）

| 任务类型 | 调用次数 | 平均 token (input+output) | 模型 | 单价美金 |
|---------|---------|--------------------------|------|---------|
| 划词翻译 | 100 | 1K | Haiku | $0.001 |
| 划词解释 | 80 | 5K | Sonnet | $0.025 |
| 划词验证 | 30 | 50K | Sonnet + Search | $0.50 |
| 章节总结 | 30 | 30K | Sonnet | $0.10 |
| 追问对话 | 100 | 20K | Sonnet | $0.05 |

**总估算：约 $25-40 一本书（约 ¥180-300）**

### 9.2 成本优化策略

- **任务路由分级**：简单任务自动用 Haiku（10x 便宜）
- **Prompt 缓存**：章节正文作为 system prompt，跨多次调用复用
- **章节总结缓存**：同一章节生成的总结永久保存，无需重新调用
- **流式输出**：避免输出截断浪费
- **预算提醒**：80% / 100% 警告
- **Token 显示**：每次调用后实时显示，提升用户感知

### 9.3 用户视角

- 建议月度预算：¥200-400（个人 2-3 本书）
- 重度使用者预算：¥500-1000（个人 5 本书）
- 二期接入本地 Ollama → 简单任务免费

---

## 10. MVP 5 个 Phase 时间安排

| Phase | 时间 | 目标 | 交付物 |
|-------|------|------|--------|
| **P1: 骨架** | Week 1-2 | 项目搭建、抽象层、PDF 上传 | Next.js 工程、ModelProvider/StorageRepo 接口、PDF 上传解析 + 章节切分 |
| **P2: 核心 AI** | Week 3-6 | 4 个核心 AI 能力 | 划词翻译/解释/验证、章节总结 |
| **P3: 沉淀与导出** | Week 7-8 | 时间轴日志 + 导出 | TimelineService、Markdown/HTML 导出 |
| **P4: 配置与成本** | Week 9-10 | 模型管理 UI、成本计量 | 设置页、Provider 配置、任务路由、预算提醒 |
| **P5: 打磨** | Week 11-12 | Prompt 调优、UX 打磨 | 5 个 prompt 模板调优、UI 完善、bug 修复 |

### 详细 Phase 拆解（高层级，实现细节由 plan 提供）

#### P1 骨架（2 周）
- Next.js 14 + TypeScript + Tailwind + shadcn/ui 项目脚手架
- IndexedDB（Dexie）基础结构 + Repository 接口
- PDF.js 集成 + PdfParser 实现
- 章节切分（outline 优先 + 手动 fallback）
- 书库页 + 上传对话框

#### P2 核心 AI（4 周）
- ModelProvider 接口 + Anthropic 实现 + OpenAI 兼容实现
- AIService（5 个任务类型）
- API Routes（5 个）+ Prompt 模板
- ClaudeWebSearch 集成
- 阅读视图 + 划词气泡
- AI 侧边栏 + 流式输出

#### P3 沉淀与导出（2 周）
- TimelineService（自动累加）
- 时间轴 UI + 筛选/搜索
- Markdown 导出
- HTML 导出（含 CSS 内联）

#### P4 配置与成本（2 周）
- Provider 配置 UI（参考 Cherry Studio）
- 任务路由配置 UI
- 模型切换器组件
- CostMeter + 实时显示 + 月度预算提醒

#### P5 打磨（2 周）
- 5 个 Prompt 模板的反复调优
- 性能优化（PDF 大文件、IndexedDB 查询）
- UX 细节（专注模式切换、键盘快捷键）
- 文档：README + 用户指南

---

## 11. 未来扩展路线（二期及以后）

### 11.1 已预留接口（最容易实现）

- **本地 Ollama**：通过 OpenAICompatibleProvider 一行配置即可接入
- **更多 SearchProvider**：Tavily、Brave、SerpAPI
- **EPUB / TXT 解析**：DocumentParser 接口已就位

### 11.2 中等扩展（需要新代码但架构已支持）

- **陪读人格化**：基于 persona 字段 + 多套 prompt 模板
- **多 AI 共读对比**：ComparisonSession 表 + 多 model 并行调用
- **SQLite 存储**：替换 IndexedDB 实现 + 数据迁移工具
- **Tauri 打包**：Next.js → Tauri 应用

### 11.3 重大扩展（需要新基础设施）

- **云同步**：实现 SyncAdapter + 后端服务
- **多设备同步**：基于云同步
- **多人/团队使用**：账号系统 + 权限
- **移动端**：响应式优化 + PWA
- **OCR**：扫描版 PDF 支持

---

## 12. 决策记录

### 12.1 为什么选 Next.js + 本地 API Routes

- 比纯前端方案多了 API key 安全防线
- 比 Tauri 方案开发速度快 3x
- 部署灵活：本机跑或 Vercel 都行
- 与"先做成再做好"的纪律契合

### 12.2 为什么选 IndexedDB 而非 SQLite

- 一期实现速度优先
- 浏览器原生，无后端依赖
- 通过 Repository 抽象，二期可零业务代码改动切换到 SQLite

### 12.3 为什么钉子是"读懂"而非"思考"或"陪读"

- "读懂"是高频痛点（每 10 分钟一次）
- "思考"是低频价值（一本书几次）
- "陪读"是新颖但未验证需求
- 钉子选错 → MVP 资源浪费

### 12.4 为什么模型管理参考 Cherry Studio

- 90% 中转站兼容 OpenAI 协议，UX 已被验证好用
- 用户不被一家锁死
- 支持本地模型（Ollama 等）零成本

### 12.5 为什么砍掉陪读人格化（一期）

- 不为"读懂"主轴服务
- 实现复杂度大（多套 prompt + UI 切换 + 测试）
- 数据模型预留即可，二期实现零返工

### 12.6 为什么砍掉多 AI 共读（一期）

- 用户自己也说"这期把核心跑通"
- 数据模型 + Provider 抽象已为二期铺路
- 一期专注证明核心闭环

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| AI 成本超预期 | 用户放弃 | 任务分级 + 实时显示 + Haiku 兜底 |
| PDF 解析失败率高 | 用户流失 | 手动章节划分 + 兜底模式 + 错误明确 |
| Prompt 调优周期长 | 上线延期 | P5 单独 2 周给 prompt |
| IndexedDB 配额撞墙 | 数据丢失 | 配额监控 + 提醒清理 + 二期 SQLite |
| API Key 泄漏 | 用户损失 | AES-GCM 加密 + 明确告知用户责任 |
| 版权问题 | 法律风险 | 明确个人使用声明 + 不公开发行 |

---

## 14. 成功标准

### 14.1 MVP 上线标准

- 4 个核心能力（翻译/解释/验证/总结）全部可用
- 时间轴日志正确累加，重启不丢失
- Markdown + HTML 导出可生成
- Provider 配置 UI 完整可用
- 实测一本完整金融科普书端到端流程顺畅
- 单本书 AI 成本控制在 ¥300 以内

### 14.2 早期用户验证标准（你自己用 1 个月）

- 读完至少 1 本书
- 时间轴累计 ≥ 100 条
- 触发联网验证 ≥ 30 次
- 至少导出 1 次
- 主观评价"比之前读得懂"

---

## 附录 A：术语表

| 术语 | 定义 |
|------|------|
| 缺口 | 用户读书时遇到不理解的瞬间 |
| 闭合 | 通过 AI 调用让缺口被解决 |
| Provider | AI 模型服务的抽象（如 Anthropic、OpenAI） |
| 任务路由 | 不同任务类型映射到不同模型的策略 |
| 时间轴 | 思考文档的本体，按时间累加的阅读交互记录 |
| 专注模式 | 默认 UI 状态，仅显示原文 |

---

**文档结束**
