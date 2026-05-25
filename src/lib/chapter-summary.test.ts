import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractSummaryList, normalizeChapterSummary, parseChapterSummary } from './chapter-summary';

const generatedAt = new Date('2026-01-01T00:00:00Z');

afterEach(() => {
  vi.useRealTimers();
});

describe('chapter summary parsing', () => {
  it('parses a complete structured Markdown summary', () => {
    const summary = parseChapterSummary(
      `## 核心论点
- 资本配置决定长期竞争力
- 管理层激励会改变风险偏好

## 关键概念
- 复利
- 安全边际

## 论证逻辑
作者先定义问题，再比较两个案例，最后给出判断标准。

## 章末思考
- 这个标准是否适用于周期行业？
- 哪些指标能提前验证假设？`,
      { modelUsed: 'test-model', generatedAt },
    );

    expect(summary).toEqual({
      corePoints: ['资本配置决定长期竞争力', '管理层激励会改变风险偏好'],
      keyConcepts: ['复利', '安全边际'],
      argumentFlow: '作者先定义问题，再比较两个案例，最后给出判断标准。',
      openQuestions: ['这个标准是否适用于周期行业？', '哪些指标能提前验证假设？'],
      generatedAt,
      modelUsed: 'test-model',
    });
  });

  it('accepts heading numbering, colons, and Chinese alias variants', () => {
    const summary = parseChapterSummary(
      `### 1. 核心观点：
1. 第一条观点
2) 第二条观点

### 二、重要概念:
（一） 概念 A
（二） 概念 B

### （三）逻辑脉络：
一、先提出矛盾
二、再解释约束

### 4、开放问题：
• 还可以怎样反驳？
* 需要哪些证据？`,
      { modelUsed: 'variant-model', generatedAt },
    );

    expect(summary.corePoints).toEqual(['第一条观点', '第二条观点']);
    expect(summary.keyConcepts).toEqual(['概念 A', '概念 B']);
    expect(summary.argumentFlow).toBe('先提出矛盾\n再解释约束');
    expect(summary.openQuestions).toEqual(['还可以怎样反驳？', '需要哪些证据？']);
    expect(summary.modelUsed).toBe('variant-model');
  });

  it('recognizes bold headings when the colon is outside the markdown marker', () => {
    const summary = parseChapterSummary(
      `**核心论点**：
- 观点一

**关键概念**：
- 概念一`,
      { modelUsed: 'bold-heading-model', generatedAt },
    );

    expect(summary.corePoints).toEqual(['观点一']);
    expect(summary.keyConcepts).toEqual(['概念一']);
  });

  it('parses inline heading content when models omit list formatting', () => {
    const summary = parseChapterSummary(
      `核心论点：资本配置决定企业长期回报。
关键概念：复利、安全边际
论证逻辑：先定义长期主义，再通过案例比较不同资本配置结果。
章末思考：这个标准能否用于高波动行业？`,
      { modelUsed: 'inline-heading-model', generatedAt },
    );

    expect(summary.corePoints).toEqual(['资本配置决定企业长期回报。']);
    expect(summary.keyConcepts).toEqual(['复利、安全边际']);
    expect(summary.argumentFlow).toBe('先定义长期主义，再通过案例比较不同资本配置结果。');
    expect(summary.openQuestions).toEqual(['这个标准能否用于高波动行业？']);
  });

  it('cleans bold markers around inline heading content', () => {
    const summary = parseChapterSummary(
      `**核心论点：** 资本配置决定企业长期回报。
**关键概念：** 复利
**论证逻辑：** 先定义问题，再比较案例。
**章末思考：** 还需要哪些反证？`,
      { modelUsed: 'bold-inline-model', generatedAt },
    );

    expect(summary.corePoints).toEqual(['资本配置决定企业长期回报。']);
    expect(summary.keyConcepts).toEqual(['复利']);
    expect(summary.argumentFlow).toBe('先定义问题，再比较案例。');
    expect(summary.openQuestions).toEqual(['还需要哪些反证？']);
  });

  it('falls back to a compact core point when no structure is present', () => {
    const summary = parseChapterSummary(
      `这一章主要讨论注意力如何被稀缺资源约束。

作者把阅读行为拆成输入、选择和回顾三个步骤。`,
      { modelUsed: 'fallback-model', generatedAt },
    );

    expect(summary.corePoints).toEqual([
      '这一章主要讨论注意力如何被稀缺资源约束。\n作者把阅读行为拆成输入、选择和回顾三个步骤。',
    ]);
    expect(summary.keyConcepts).toEqual([]);
    expect(summary.argumentFlow).toBe('');
    expect(summary.openQuestions).toEqual([]);
  });

  it('uses the current time when generatedAt is not provided and preserves modelUsed', () => {
    const now = new Date('2026-02-03T04:05:06Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const summary = parseChapterSummary('没有结构的摘要', {
      modelUsed: 'current-time-model',
    });

    expect(summary.generatedAt).toEqual(now);
    expect(summary.modelUsed).toBe('current-time-model');
  });

  it('normalizes durable cache data and rejects malformed summaries', () => {
    expect(
      normalizeChapterSummary({
        corePoints: ['核心'],
        keyConcepts: [],
        argumentFlow: '流程',
        openQuestions: ['问题'],
        generatedAt: '2026-01-01T00:00:00.000Z',
        modelUsed: 'cache-model',
      }),
    ).toEqual({
      corePoints: ['核心'],
      keyConcepts: [],
      argumentFlow: '流程',
      openQuestions: ['问题'],
      generatedAt,
      modelUsed: 'cache-model',
    });

    expect(
      normalizeChapterSummary({
        corePoints: 'not-array',
        keyConcepts: [],
        argumentFlow: '流程',
        openQuestions: [],
        generatedAt,
        modelUsed: 'cache-model',
      }),
    ).toBeNull();
  });

  it('trims durable cache strings and removes blank list items', () => {
    expect(
      normalizeChapterSummary({
        corePoints: ['  核心  ', '   '],
        keyConcepts: [' 概念 ', ''],
        argumentFlow: '  流程  ',
        openQuestions: ['  问题  ', '\n'],
        generatedAt: generatedAt.getTime(),
        modelUsed: ' cache-model ',
      }),
    ).toEqual({
      corePoints: ['核心'],
      keyConcepts: ['概念'],
      argumentFlow: '流程',
      openQuestions: ['问题'],
      generatedAt,
      modelUsed: 'cache-model',
    });
  });

  it('filters empty list items after removing bullets and numbering', () => {
    expect(
      extractSummaryList(`
-
*
1.
1. 有效条目
（二） 第二条
•   
`),
    ).toEqual(['有效条目', '第二条']);
  });
});
