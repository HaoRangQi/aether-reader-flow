'use client';

import { useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { DEFAULT_PROMPT_OVERRIDES, type PromptOverrides } from '@/services/ConfigService';
import { buildTranslatePrompt } from '@/lib/prompts/translate';
import { buildExplainPrompt } from '@/lib/prompts/explain';
import { buildVerifyPrompt } from '@/lib/prompts/verify';
import { buildSummarizePrompt } from '@/lib/prompts/summarize';
import { buildChatSystemPrompt } from '@/lib/prompts/chat';

type TaskKey = keyof PromptOverrides;

const TASK_META: { key: TaskKey; label: string; hint: string }[] = [
  { key: 'translate', label: '划词翻译', hint: '翻译选中文本，保留术语括注' },
  { key: 'explain', label: '概念解释', hint: '解释概念，结合上下文，给出类比' },
  { key: 'verify', label: '联网验证', hint: '联网核查观点，输出 JSON 结构' },
  { key: 'summarize', label: '章节总结', hint: '梳理核心论点、关键概念、论证逻辑' },
  { key: 'chat', label: '追问对话', hint: '基于选中原文的多轮对话' },
];

function getDefaultPrompt(key: TaskKey): string {
  switch (key) {
    case 'translate': return buildTranslatePrompt({ text: '' }).system;
    case 'explain':   return buildExplainPrompt({ text: '', context: '' }).system;
    case 'verify':    return buildVerifyPrompt({ text: '', context: '' }).system;
    case 'summarize': return buildSummarizePrompt({ chapterTitle: '', chapterContent: '' }).system;
    case 'chat':      return buildChatSystemPrompt({});
  }
}

export function PromptConfig() {
  const { promptOverrides, setPromptOverrides } = useConfigStore();
  // draft stores the override text; empty string = using default
  const [draftOverride, setDraftOverride] = useState<PromptOverrides | null>(null);
  const [editorValues, setEditorValues] = useState<Partial<Record<TaskKey, string>>>({});
  const [activeKey, setActiveKey] = useState<TaskKey>('explain');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const draft = draftOverride ?? promptOverrides;
  const setDraft = (
    next: PromptOverrides | ((prev: PromptOverrides) => PromptOverrides),
  ) => {
    setDraftOverride(prev => {
      const base = prev ?? promptOverrides;
      return typeof next === 'function' ? next(base) : next;
    });
  };

  const defaultPrompt = getDefaultPrompt(activeKey);
  const activeMeta = TASK_META.find(t => t.key === activeKey)!;
  // What's shown in the textarea: override if set, otherwise the built-in default
  const isCustomized = draft[activeKey].trim().length > 0;
  const displayValue = editorValues[activeKey] ?? (isCustomized ? draft[activeKey] : defaultPrompt);
  const customizedCount = TASK_META.filter(t => draft[t.key].trim().length > 0).length;

  const handleChange = (value: string) => {
    // If user edited back to exactly the default, treat as "not customized"
    const isDefault = value.trim() === defaultPrompt.trim();
    setEditorValues(prev => ({ ...prev, [activeKey]: value }));
    setDraft(prev => ({ ...prev, [activeKey]: isDefault ? '' : value }));
    setSaved(false);
    setSaveError(null);
  };

  const resetOne = () => {
    setEditorValues(prev => ({ ...prev, [activeKey]: defaultPrompt }));
    setDraft(prev => ({ ...prev, [activeKey]: '' }));
    setSaved(false);
    setSaveError(null);
  };

  const save = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await setPromptOverrides(draft);
      setDraftOverride(null);
      setEditorValues({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('提示词保存失败，请检查后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  const resetAll = async () => {
    if (isSaving) return;

    const previousDraft = draft;
    const previousEditorValues = editorValues;
    setDraft(DEFAULT_PROMPT_OVERRIDES);
    setEditorValues({});
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await setPromptOverrides(DEFAULT_PROMPT_OVERRIDES);
      setDraftOverride(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setDraftOverride(previousDraft);
      setEditorValues(previousEditorValues);
      setSaveError('恢复默认失败，请检查后重试。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">提示词</h1>
      <p className="text-sm text-muted mb-6">
        直接在默认提示词上修改，保存后生效。「恢复默认」撤销当前任务的所有改动。
      </p>

      <div className="flex gap-4">
        {/* Task selector */}
        <div className="w-36 shrink-0 space-y-1" role="group" aria-label="选择提示词任务">
          {TASK_META.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveKey(t.key)}
              aria-pressed={activeKey === t.key}
              aria-label={`${t.label}${draft[t.key].trim() ? '，已自定义' : ''}`}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between gap-1 ${
                activeKey === t.key
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-foreground hover:bg-surface-elevated'
              }`}
            >
              <span>{t.label}</span>
              {draft[t.key].trim() && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  activeKey === t.key ? 'bg-white/70' : 'bg-accent'
                }`} />
              )}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span id="prompt-editor-label" className="text-sm font-medium text-foreground">
                {activeMeta.label}
              </span>
              <span id="prompt-editor-hint" className="text-xs text-muted ml-2">
                {activeMeta.hint}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isCustomized && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                  已修改
                </span>
              )}
              <button
                type="button"
                onClick={resetOne}
                disabled={!isCustomized || isSaving}
                aria-describedby="prompt-save-status"
                className="text-xs text-muted hover:text-foreground transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                恢复默认
              </button>
            </div>
          </div>

          <textarea
            value={displayValue}
            onChange={e => handleChange(e.target.value)}
            disabled={isSaving}
            rows={18}
            aria-labelledby="prompt-editor-label"
            aria-describedby="prompt-editor-hint prompt-editor-status"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-foreground font-mono resize-y focus:outline-none focus:border-accent disabled:opacity-70"
            spellCheck={false}
          />

          <div id="prompt-editor-status" className="mt-1.5 text-xs text-subtle">
            {isCustomized
              ? `已自定义（${draft[activeKey].length} 字符）· 与默认不同`
              : '当前显示内置默认提示词，直接编辑即可覆盖'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          aria-describedby="prompt-save-status"
          className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSaving ? '保存中...' : saved ? '✓ 已保存' : '保存'}
        </button>
        <button
          type="button"
          onClick={resetAll}
          disabled={customizedCount === 0 || isSaving}
          aria-describedby="prompt-save-status"
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-muted hover:text-foreground transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isSaving ? '处理中...' : '全部恢复默认'}
        </button>
        {saveError ? (
          <span id="prompt-save-status" role="alert" className="text-sm text-red-600">
            {saveError}
          </span>
        ) : (
          <span id="prompt-save-status" role="status" aria-live="polite" className="text-sm text-subtle">
            {isSaving
              ? '正在保存提示词设置'
              : saved
                ? '提示词设置已保存'
                : customizedCount > 0
                  ? `已自定义 ${customizedCount} 个任务`
                  : '全部任务使用默认提示词'}
          </span>
        )}
      </div>
    </div>
  );
}
