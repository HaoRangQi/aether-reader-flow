import { describe, it, expect } from 'vitest';
import { buildTranslatePrompt } from './translate';
import { buildExplainPrompt } from './explain';
import { buildVerifyPrompt } from './verify';
import { buildSummarizePrompt } from './summarize';
import { buildChatSystemPrompt } from './chat';

describe('prompt builders (snapshot stability)', () => {
  it('translate', () => {
    expect(buildTranslatePrompt({ text: 'hedge fund' })).toMatchSnapshot();
  });

  it('explain', () => {
    expect(
      buildExplainPrompt({
        text: 'M2',
        context: 'M2 增速从 8% 上升到 12%',
      }),
    ).toMatchSnapshot();
  });

  it('verify', () => {
    expect(
      buildVerifyPrompt({
        text: '央行扩表必然推高资产价格',
        context: '宽信用如何传导到资产价格…',
      }),
    ).toMatchSnapshot();
  });

  it('summarize', () => {
    expect(
      buildSummarizePrompt({
        chapterTitle: '第3章 宽信用如何传导到资产价格',
        chapterContent: '宽信用 ...（节选）',
      }),
    ).toMatchSnapshot();
  });

  it('chat (no anchor)', () => {
    expect(buildChatSystemPrompt({})).toMatchSnapshot();
  });

  it('chat (with anchor)', () => {
    expect(
      buildChatSystemPrompt({ anchorText: 'M2 增速', anchorType: 'explain' }),
    ).toMatchSnapshot();
  });
});

describe('prompt invariants', () => {
  it('translate prompt is bilingual-aware', () => {
    const p = buildTranslatePrompt({ text: 'x' });
    expect(p.system).toMatch(/中英|bilingual|中文|英文/);
  });

  it('explain prompt requires 4 named sections', () => {
    const p = buildExplainPrompt({ text: 'x', context: 'y' });
    expect(p.system).toContain('含义');
    expect(p.system).toContain('在本章中');
    expect(p.system).toContain('通俗类比');
    expect(p.system).toContain('相关概念');
  });

  it('verify prompt demands JSON envelope', () => {
    const p = buildVerifyPrompt({ text: 'x', context: 'y' });
    expect(p.system).toMatch(/json|JSON/);
    expect(p.system).toMatch(/widely_accepted|contested|refuted|insufficient/);
  });

  it('summarize prompt requires 4 named sections', () => {
    const p = buildSummarizePrompt({ chapterTitle: 'x', chapterContent: 'y' });
    expect(p.system).toContain('核心论点');
    expect(p.system).toContain('关键概念');
    expect(p.system).toContain('论证逻辑');
    expect(p.system).toContain('章末思考');
  });

  it('chat prompt pins anchor when provided', () => {
    const p = buildChatSystemPrompt({ anchorText: 'M2', anchorType: 'explain' });
    expect(p).toContain('M2');
    expect(p).toContain('explain');
  });

  it('chat prompt omits blank anchor and memory sections', () => {
    const p = buildChatSystemPrompt({
      anchorText: ' \n\t ',
      anchorType: 'explain',
      memorySummary: ' \n\t ',
    });

    expect(p).not.toContain('用户当前关注的原文片段');
    expect(p).not.toContain('前置任务类型');
    expect(p).not.toContain('较早对话记忆');
  });

  it('chat prompt normalizes and bounds dynamic context', () => {
    const p = buildChatSystemPrompt({
      anchorText: '  M2\n\n增速\t回升  ',
      memorySummary: '旧问题 '.repeat(700),
    });

    expect(p).toContain('M2 增速 回升');
    expect(p).toContain('较早对话记忆');
    expect(p).toContain('…');

    const memory = p.split('较早对话记忆（由系统压缩，仅作背景）：\n')[1] ?? '';
    expect(memory.length).toBeLessThanOrEqual(1_800);
  });
});
