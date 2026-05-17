# MVP Ship Checklist — Aether Reader Flow v0.1.0

> 上线候选自查清单。每一条都应在第一名真实用户开始使用之前对照确认。

## ⚙ 功能

- [ ] PDF 上传（≤ 500MB）走 PDF.js 客户端解析；无 outline 的书走「全文」单章兜底
- [ ] 划词气泡 4 个按钮均可触发：翻译 / 解释 / 验证 / 深入
- [ ] 翻译 / 解释 / 验证 在气泡内流式渲染
- [ ] 深入 → AI 侧栏打开，原文片段作为锚点
- [ ] 章节总结：首次生成后写入 chapter.summaryCache，再次打开即时显示
- [ ] 章节总结「重新生成」按钮跳过缓存
- [ ] AI 侧栏多轮对话：Enter 发送 / Shift+Enter 换行 / 自动滚动到底
- [ ] AI 侧栏顶部 ModelSwitcher 可临时切换模型（仅本次会话，不改全局路由）
- [ ] 时间轴面板：列表反向时序 / 章节筛选 / 类型 chip 多选 / 搜索原文+AI+用户输入
- [ ] BookCard 右上角下载图标 → ExportDialog
- [ ] ExportDialog 可选 Markdown / HTML 与 全部 / 部分章节
- [ ] Markdown 导出含层级（H1 书 / H2 章 / H3 条目）+ 时间 + 来源
- [ ] HTML 导出离线可独立打开（含内联 CSS），所有 user/AI 文本经 XSS 转义
- [ ] 设置页 5 节均可导航
- [ ] 模型服务：5 个预置 + 自定义 + 列表（编辑 / 删除）+ 测试连接
- [ ] 任务路由：5 任务 × 所有已启用模型 下拉
- [ ] 主题选择：6 主题包 × 浅深 + auto
- [ ] 字体偏好：默认 / 自定义 CSS font-family + 字号 + 行高 + 实时预览
- [ ] 月度预算配置：达到 80% / 100% 时 Toast 提醒

## 🎨 视觉

- [ ] 6 主题包 light + dark 共 12 套配色均加载正确
- [ ] ThemeProvider 切换平滑（< 400ms），不闪烁
- [ ] 玻璃面板在所有主题下背景可见、blur 生效
- [ ] 划词气泡 spring 动画进入
- [ ] AI 侧栏 / 时间轴面板 从右侧滑入
- [ ] 焦点环（:focus-visible）键盘 Tab 时可见

## ⌨ 交互

- [ ] ⌘/Ctrl + B 切换时间轴
- [ ] ⌘/Ctrl + Shift + S 切换 AI 侧栏
- [ ] ⌘/Ctrl + D 浅/深模式切换
- [ ] ← / → 上一章 / 下一章（不在输入框时）

## ♿ 可访问性

- [ ] prefers-reduced-motion 用户感知不到大幅动画
- [ ] 所有交互按钮带 aria-label 或可见文本
- [ ] 所有 dialog 带 role="dialog" aria-modal="true"
- [ ] 选择主题卡片用 aria-pressed

## 📐 响应式

- [ ] ≥ 1280px：完整三栏布局
- [ ] < 1024px：NarrowViewportNotice 顶部条提示

## 🚀 性能

- [ ] 章节切换 ≤ 300ms
- [ ] 划词气泡弹出 ≤ 100ms
- [ ] AI 第一 token ≤ 2s
- [ ] 章节总结 ≤ 30s（30k token）

## 💰 成本

- [ ] 单本 30 万字金融书端到端实测 ≤ ¥350
- [ ] translate 任务默认走 Haiku
- [ ] CostBadge 数字 ±5% 误差内

## 🔒 安全

- [ ] 客户端 bundle 不含 plaintext API key
- [ ] 服务端日志不写 API key
- [ ] CryptoService 错误密码无误差抛出
- [ ] sessionStorage 不存主密码

## 🧪 测试

- [ ] npm test — 136/136 pass
- [ ] npm run e2e — 至少 1 项 pass
- [ ] npm run lint --max-warnings 0 — 0 / 0
- [ ] npm run build — 干净
- [ ] npx tsc --noEmit — 类型干净

## 🏁 真实使用流（最后手动一遍）

新 profile 上从零跑一遍：

1. [ ] 打开首页 → 看到空状态 + 上传按钮
2. [ ] 进设置 → 配 Anthropic API Key + 主密码
3. [ ] 设任务路由（用 sonnet + haiku）
4. [ ] 选羊皮纸主题 → 切深色 → 切莲青 → 确认整套色变
5. [ ] 上传一本真实中文金融科普 PDF
6. [ ] 进入第 3 章 → 划词「M2」→ 翻译 → 见结果
7. [ ] 划词「央行扩表必然推高房地产价格」→ 验证 → 见 sources + 置信度
8. [ ] 工具栏「章节总结」→ 30s 内看到 4 段结构化总结
9. [ ] AI 侧栏发起追问「那 2015-2018 是反例吗？」→ 多轮对话
10. [ ] 顶部 ModelSwitcher → 切到 Haiku → 下次回答用 Haiku
11. [ ] 时间轴面板 → 筛选「验证」类型 → 搜索关键词
12. [ ] 回首页 → BookCard 下载 → 导出 MD → 检查格式
13. [ ] 导出 HTML → 双击离线打开 → 渲染正确
14. [ ] 设置 → 改自定义字体 → 阅读视图即时更新
15. [ ] 设置 → 改预算为 ¥1 → AI 调用后看到「超出预算」Toast

完成所有项 → 打 tag v0.1.0-mvp，宣布 MVP 完成。
