# 贡献指南

感谢你对 Aether Reader Flow 的关注！这份文档将帮助你快速开始贡献。

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发环境设置](#开发环境设置)
- [项目结构](#项目结构)
- [编码规范](#编码规范)
- [提交规范](#提交规范)
- [测试要求](#测试要求)
- [Pull Request 流程](#pull-request-流程)
- [问题反馈](#问题反馈)

---

## 行为准则

我们致力于为所有人提供友好、安全和包容的环境。参与本项目即表示你同意遵守以下准则：

- 尊重不同的观点和经验
- 接受建设性的批评
- 关注对社区最有利的事情
- 对其他社区成员表示同理心

---

## 如何贡献

### 贡献类型

1. **报告 Bug** — 发现问题请提 Issue
2. **建议功能** — 有好想法请提 Issue 讨论
3. **改进文档** — 文档永远可以更好
4. **修复 Bug** — 查看标记为 `bug` 的 Issue
5. **开发新功能** — 查看 [ROADMAP.md](./ROADMAP.md)

### 适合新手的任务

查找标记为以下标签的 Issue：
- `good first issue` — 适合首次贡献
- `help wanted` — 需要帮助
- `documentation` — 文档改进

---

## 开发环境设置

### 前置要求

- Node.js ≥ 20 (推荐 20 LTS)
- npm ≥ 10
- Git
- 现代浏览器（Chrome/Edge ≥ 120 或 Safari ≥ 17）

### 克隆项目

```bash
# 1. Fork 项目到你的 GitHub 账号
# 2. 克隆你的 Fork
git clone https://github.com/YOUR_USERNAME/aether-reader-flow.git
cd aether-reader-flow

# 3. 添加上游仓库
git remote add upstream https://github.com/HaoRangQi/aether-reader-flow.git

# 4. 安装依赖
npm install

# 5. 启动开发服务器
npm run dev
```

访问 http://localhost:3000 查看效果。

### 保持同步

```bash
# 定期同步上游更新
git fetch upstream
git checkout master
git merge upstream/master
```

---

## 项目结构

```
src/
├── adapters/              # 适配器层（依赖反转）
│   ├── models/           # AI 模型提供商适配器
│   ├── parsers/          # 文档解析器（PDF/EPUB）
│   ├── search/           # 搜索服务适配器
│   └── storage/          # 存储层（IndexedDB）
├── services/             # 业务逻辑层
│   ├── AIService.ts      # AI 调用服务
│   ├── BookService.ts    # 书籍管理服务
│   ├── CryptoService.ts  # 加密服务
│   └── ExportService.ts  # 导出服务
├── stores/               # Zustand 状态管理
│   ├── readerStore.ts    # 阅读器状态
│   ├── configStore.ts    # 配置状态
│   └── costStore.ts      # 成本追踪状态
├── components/           # React 组件
│   ├── library/          # 书架相关组件
│   ├── reader/           # 阅读器相关组件
│   ├── settings/         # 设置相关组件
│   └── shared/           # 共享组件
├── lib/                  # 工具库
│   ├── ai-service-client.ts  # AI 服务客户端
│   ├── i18n.ts               # 国际化
│   └── theme.ts              # 主题系统
├── types/                # TypeScript 类型定义
│   └── domain.ts         # 领域模型
└── app/                  # Next.js App Router
    ├── page.tsx                  # 书架页面
    ├── reader/[bookId]/page.tsx  # 阅读器页面
    ├── settings/page.tsx         # 设置页面
    └── api/                      # API Routes
```

### 架构原则

1. **分层架构** — UI / Service / Adapter 严格分离
2. **依赖反转** — 业务逻辑不依赖具体实现
3. **Repository 模式** — 存储层可替换
4. **单一职责** — 每个模块只做一件事

---

## 编码规范

### TypeScript

```typescript
// ✅ 好的实践
interface User {
  id: string;
  name: string;
  email: string;
}

async function getUser(id: string): Promise<User | null> {
  // 实现
}

// ❌ 避免
function getUser(id: any): any {
  // 实现
}
```

### React 组件

```typescript
// ✅ 好的实践
interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Button({ onClick, children, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ❌ 避免
export function Button(props: any) {
  return <button {...props} />;
}
```

### 命名规范

- **文件名**: PascalCase（组件）或 camelCase（工具）
  - `UserProfile.tsx`
  - `formatDate.ts`
  
- **组件**: PascalCase
  - `function UserProfile() {}`
  
- **函数/变量**: camelCase
  - `const userName = 'John';`
  - `function getUserName() {}`
  
- **常量**: UPPER_SNAKE_CASE
  - `const MAX_FILE_SIZE = 500 * 1024 * 1024;`
  
- **类型/接口**: PascalCase
  - `interface UserProfile {}`
  - `type UserId = string;`

### 注释规范

```typescript
/**
 * 获取用户信息
 * 
 * @param id - 用户 ID
 * @returns 用户对象，不存在时返回 null
 * @throws {Error} 网络错误或服务器错误
 */
async function getUser(id: string): Promise<User | null> {
  // 实现
}
```

### ESLint

项目使用 ESLint 进行代码检查：

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint -- --fix
```

---

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: 修复 Bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构（不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

### 示例

```bash
# 新功能
git commit -m "feat(reader): 添加高亮标记功能"

# 修复 Bug
git commit -m "fix(parser): 修复 PDF 解析中文乱码问题"

# 文档更新
git commit -m "docs: 更新 API 文档"

# 重构
git commit -m "refactor(storage): 优化 IndexedDB 查询性能"
```

### 提交信息要求

- 使用中文或英文（保持一致）
- 第一行不超过 72 字符
- 使用祈使句（"添加"而不是"添加了"）
- 详细描述放在 body 中

---

## 测试要求

### 单元测试

使用 Vitest 编写单元测试：

```typescript
// src/services/BookService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BookService } from './BookService';

describe('BookService', () => {
  let service: BookService;

  beforeEach(() => {
    service = new BookService();
  });

  it('should create a book', async () => {
    const book = await service.createBook({
      title: 'Test Book',
      author: 'Test Author',
    });
    
    expect(book.id).toBeDefined();
    expect(book.title).toBe('Test Book');
  });
});
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 覆盖率报告
npm run test:coverage

# UI 模式
npm run test:ui
```

### 测试覆盖率要求

- 新功能必须有测试
- 核心业务逻辑覆盖率 ≥ 80%
- Bug 修复必须添加回归测试

---

## Pull Request 流程

### 1. 创建分支

```bash
# 从 master 创建功能分支
git checkout -b feature/your-feature-name

# 或修复分支
git checkout -b fix/your-bug-fix
```

### 2. 开发

- 遵循编码规范
- 编写测试
- 更新文档

### 3. 提交前检查

```bash
# 类型检查
npx tsc --noEmit

# 代码检查
npm run lint -- --max-warnings 0

# 运行测试
npm test

# 构建检查
npm run build
```

### 4. 提交代码

```bash
git add .
git commit -m "feat: 你的功能描述"
```

### 5. 推送到 Fork

```bash
git push origin feature/your-feature-name
```

### 6. 创建 Pull Request

1. 访问你的 Fork 页面
2. 点击 "New Pull Request"
3. 填写 PR 描述：
   - 功能说明
   - 相关 Issue
   - 测试说明
   - 截图（如果是 UI 改动）

### PR 描述模板

```markdown
## 功能说明
简要描述这个 PR 做了什么。

## 相关 Issue
Closes #123

## 改动内容
- 添加了 XXX 功能
- 修复了 XXX Bug
- 重构了 XXX 模块

## 测试说明
- [ ] 单元测试已通过
- [ ] 手动测试已完成
- [ ] 文档已更新

## 截图（如适用）
[添加截图]

## 检查清单
- [ ] 代码遵循项目规范
- [ ] 已添加必要的测试
- [ ] 所有测试通过
- [ ] 文档已更新
- [ ] 提交信息符合规范
```

### 7. Code Review

- 维护者会审查你的代码
- 根据反馈进行修改
- 修改后推送到同一分支（PR 会自动更新）

### 8. 合并

- 审查通过后，维护者会合并你的 PR
- 你的贡献会出现在下一个版本中

---

## 问题反馈

### 报告 Bug

使用 [Bug Report 模板](https://github.com/HaoRangQi/aether-reader-flow/issues/new?template=bug_report.md)：

- 描述问题
- 复现步骤
- 预期行为
- 实际行为
- 环境信息（浏览器、操作系统）
- 截图或错误日志

### 功能建议

使用 [Feature Request 模板](https://github.com/HaoRangQi/aether-reader-flow/issues/new?template=feature_request.md)：

- 功能描述
- 使用场景
- 预期效果
- 可选的实现方案

### 提问

使用 [GitHub Discussions](https://github.com/HaoRangQi/aether-reader-flow/discussions)：

- 使用问题
- 技术讨论
- 想法交流

---

## 开发技巧

### 调试

```typescript
// 使用浏览器开发者工具
console.log('Debug info:', data);

// 使用 debugger
debugger;

// 使用 React DevTools
// Chrome 扩展：React Developer Tools
```

### 性能分析

```bash
# 构建分析
npm run build -- --profile

# 使用 Chrome DevTools Performance 面板
```

### 常见问题

#### Q: 如何测试 AI 功能？
A: 在设置页面配置测试用的 API Key，或使用 Mock 数据。

#### Q: 如何调试 IndexedDB？
A: 使用 Chrome DevTools → Application → IndexedDB。

#### Q: 如何测试不同主题？
A: 在设置页面切换主题，或直接修改 localStorage。

---

## 资源链接

- [项目文档](./README.md)
- [开发路线图](./ROADMAP.md)
- [架构设计](./docs/superpowers/specs/2026-05-16-aether-reader-flow-design.md)
- [实施计划](./docs/superpowers/plans/2026-05-16-aether-reader-flow.md)

---

## 致谢

感谢所有贡献者！你的每一个 PR、Issue、讨论都让这个项目变得更好。

---

**有问题？** 在 [Discussions](https://github.com/HaoRangQi/aether-reader-flow/discussions) 提问  
**发现 Bug？** 提交 [Issue](https://github.com/HaoRangQi/aether-reader-flow/issues)  
**想贡献？** 查看 [ROADMAP.md](./ROADMAP.md) 选择任务

Happy Coding! 🎉
