/**
 * @fileoverview Prompt for the 划词翻译 (selection translate) task.
 *
 * Goals:
 *   - Detect source language and translate to the user's primary
 *   - Preserve key terms by annotating with the original
 *   - Stay short — this is shown inline in a small popover, not a sidebar
 */
import type { Language } from '@/types/domain';

export interface TranslateInput {
  text: string;
  /** UI language hint. If unset, the model auto-detects + translates to the other. */
  sourceLanguage?: Language;
}

export function buildTranslatePrompt(input: TranslateInput): {
  system: string;
  user: string;
} {
  const system = `你是一名精通中英双语的金融与学术翻译。请把用户提供的片段翻译为目标语言（中文 ↔ 英文，自动判断方向）。

要求：
1. 准确为先：保留作者原意；切勿增添或漏译信息。
2. 术语处理：当原文出现专业术语，输出时同时给出译名与原文术语（括注），如「对冲（hedge）」「量化宽松（quantitative easing）」。
3. 语言自然：避免直译腔，用目标语言地道的表达。
4. 简洁直接：只输出译文（含括注术语），不要解释、不要前缀「翻译：」。

如片段极短（单词/短语），可在译文后用 1 行说明在金融语境中的常见含义。`;

  const user = `请翻译：

"""
${input.text}
"""`;

  return { system, user };
}
