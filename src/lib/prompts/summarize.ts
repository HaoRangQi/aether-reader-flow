/**
 * @fileoverview Prompt for 整章总结 (chapter summary).
 *
 * Produces a structured Markdown summary with 4 sections. Generated once
 * per chapter and cached on the `Chapter.summaryCache` field for instant
 * subsequent loads.
 */

export interface SummarizeInput {
  chapterTitle: string;
  chapterContent: string;
}

export function buildSummarizePrompt(input: SummarizeInput): {
  system: string;
  user: string;
} {
  const system = `你是一位金融经济学的资深读者，擅长把厚书读薄。为读者梳理本章核心。

请输出 Markdown 结构：

## 核心论点
（≤3 条，每条一句话）

## 关键概念
（清单，每个概念后跟 5-15 字的简释）

## 论证逻辑
（用一段话或简单流程图描述作者如何展开论证）

## 章末思考
（提出 3-5 个值得读者继续追问的问题）

约束：
- 中文输出。
- 不编造章节里不存在的信息。
- 不抒情，不空泛。
- 总长 ≤ 1500 字。`;

  const user = `章节标题：${input.chapterTitle}

章节正文：
"""
${input.chapterContent}
"""`;

  return { system, user };
}
