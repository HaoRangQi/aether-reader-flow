/**
 * @fileoverview Prompt for 追问对话 (follow-up chat).
 *
 * Used by the AISidebar. The "anchor" — the original selection that
 * started this thread — is always pinned into the system prompt so
 * follow-up turns stay grounded.
 */
import type { TaskType } from '@/types/domain';

const MAX_ANCHOR_TEXT_CHARS = 6_000;
const MAX_MEMORY_SUMMARY_CHARS = 1_800;

export interface ChatBuildInput {
  /** Selected text that opened this thread, if any. */
  anchorText?: string;
  /** Type of the initial task that opened the thread. */
  anchorType?: TaskType;
  /** Deterministic summary of older turns omitted from the request history. */
  memorySummary?: string;
}

export function buildChatSystemPrompt(input: ChatBuildInput): string {
  const anchorText = normalizePromptText(input.anchorText, MAX_ANCHOR_TEXT_CHARS);
  const memorySummary = normalizePromptText(input.memorySummary, MAX_MEMORY_SUMMARY_CHARS);
  const base = `你是用户的金融阅读伙伴。基于他选中的原文继续对话，回答务必扣紧文本、避免泛泛而谈。

要求：
- 中文回答（除非用户用英文提问）。
- 不知道就说不知道；不要编造数据或来源。
- 必要时主动反问以澄清用户的真实诉求。
- 保持简洁，能 100 字说完不用 300 字。`;

  const memory = memorySummary
    ? `\n\n较早对话记忆（由系统压缩，仅作背景）：\n${memorySummary}`
    : '';

  if (!anchorText) return `${base}${memory}`;

  return `${base}

用户当前关注的原文片段：
"""
${anchorText}
"""${input.anchorType ? `\n\n前置任务类型：${input.anchorType}` : ''}${memory}`;
}

function normalizePromptText(value: string | undefined, maxChars: number): string {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}
