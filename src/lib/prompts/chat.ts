/**
 * @fileoverview Prompt for 追问对话 (follow-up chat).
 *
 * Used by the AISidebar. The "anchor" — the original selection that
 * started this thread — is always pinned into the system prompt so
 * follow-up turns stay grounded.
 */
import type { TaskType } from '@/types/domain';

export interface ChatBuildInput {
  /** Selected text that opened this thread, if any. */
  anchorText?: string;
  /** Type of the initial task that opened the thread. */
  anchorType?: TaskType;
}

export function buildChatSystemPrompt(input: ChatBuildInput): string {
  const base = `你是用户的金融阅读伙伴。基于他选中的原文继续对话，回答务必扣紧文本、避免泛泛而谈。

要求：
- 中文回答（除非用户用英文提问）。
- 不知道就说不知道；不要编造数据或来源。
- 必要时主动反问以澄清用户的真实诉求。
- 保持简洁，能 100 字说完不用 300 字。`;

  if (!input.anchorText) return base;

  return `${base}

用户当前关注的原文片段：
"""
${input.anchorText}
"""${input.anchorType ? `\n\n前置任务类型：${input.anchorType}` : ''}`;
}
