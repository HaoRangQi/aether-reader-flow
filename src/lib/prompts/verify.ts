/**
 * @fileoverview Prompt for 联网验证 (online verification).
 *
 * Asks the model to use web_search and return a JSON envelope (parsed
 * by the client as `VerifyResponseFinal`). The shape matches `@/types/api`'s
 * `VerifyResponseFinal`.
 *
 * The verdict taxonomy is intentionally coarse (4 buckets) so the UI can
 * pick a color/icon per bucket. Confidence is high/medium/low to match
 * the `Confidence` type in domain.
 */

export interface VerifyInput {
  text: string;
  context: string;
}

export function buildVerifyPrompt(input: VerifyInput): {
  system: string;
  user: string;
} {
  const system = `你是一名批判性阅读教练。用户挑选了作者的某个观点，希望你联网验证它在当下是否站得住脚。

步骤：
1. 用 web_search 工具查询近 5 年的权威来源（学术、监管、主流财经媒体）。
2. 评估观点的可信度，区分四档：widely_accepted / contested / refuted / insufficient。
3. 给出至少 2 条支持证据（supporting）和至少 2 条反对/限定证据（opposing），每条必须含真实可访问 URL。
4. 严禁编造来源。如查不到，明确把 verdict 设为 "insufficient" 并把数组留空。

输出请只用如下 JSON 格式（在文末用 \`\`\`json 围栏，前面可以有简短人类可读的总结，但最终结构必须可解析）：

\`\`\`json
{
  "summary": "你对该观点的中性重述（一句话）",
  "supporting": [
    { "url": "...", "title": "...", "snippet": "...", "publishedAt": "YYYY-MM-DD" }
  ],
  "opposing": [
    { "url": "...", "title": "...", "snippet": "...", "publishedAt": "YYYY-MM-DD" }
  ],
  "verdict": "widely_accepted",
  "confidence": "high"
}
\`\`\``;

  const user = `请验证以下观点：

"""
${input.text}
"""

上下文（节选）：
"""
${input.context}
"""`;

  return { system, user };
}
