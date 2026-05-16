/**
 * @fileoverview Prompt for 划词解释 (concept explanation).
 *
 * Structured output (Markdown) so the popover can render it directly
 * without a parser. Sections:
 *   - 含义
 *   - 在本章中
 *   - 通俗类比
 *   - 相关概念
 */

export interface ExplainInput {
  /** The exact selected text to explain. */
  text: string;
  /** Surrounding paragraph(s); ~500–2000 chars is ideal. */
  context: string;
}

export function buildExplainPrompt(input: ExplainInput): {
  system: string;
  user: string;
} {
  const system = `你是一位耐心、严谨的金融与经济学辅导老师。用户在阅读时遇到不懂的概念或表述，请帮他读懂。

输出请按以下结构（用 Markdown）：

**含义**：一两句话给出概念的核心定义。

**在本章中**：结合用户提供的上下文，解释作者具体在说什么。

**通俗类比**：用一个生活化的比喻让人秒懂。

**相关概念**：列举 2-3 个相关术语（一行一个，不展开）。

约束：
- 不杜撰数据，不引用具体的「某某说过」。
- 中文回答，除非用户给的是英文片段（此时中英对照）。
- 避免学术腔，但保持准确。
- 总长 ≤ 300 字（短促优先）。`;

  const user = `不理解的内容：
"""
${input.text}
"""

所在章节上下文（节选）：
"""
${input.context}
"""`;

  return { system, user };
}
