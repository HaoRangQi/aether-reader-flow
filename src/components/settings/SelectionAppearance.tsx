'use client';

import { useId, useRef, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { DEFAULT_SELECTION_PREFS, type SelectionPrefs } from '@/services/ConfigService';

type ResultWidth = SelectionPrefs['resultWidth'];
type ColorKey = 'bubbleBg' | 'bubbleText' | 'bubbleAccent';
type PendingAction = 'save' | 'reset';

const WIDTH_OPTIONS: { value: ResultWidth; label: string }[] = [
  { value: 'compact', label: '紧凑（280px）' },
  { value: 'normal', label: '标准（400px）' },
  { value: 'wide', label: '宽屏（560px）' },
];

const COLOR_LABELS: Record<ColorKey, string> = {
  bubbleBg: '气泡背景色',
  bubbleText: '气泡文字色',
  bubbleAccent: '按钮强调色',
};

function isValidHexColor(value: string): boolean {
  return value === '' || /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function getColorErrors(prefs: SelectionPrefs): Partial<Record<ColorKey, string>> {
  return (Object.keys(COLOR_LABELS) as ColorKey[]).reduce<Partial<Record<ColorKey, string>>>(
    (errors, key) => {
      if (!isValidHexColor(prefs[key])) {
        errors[key] = `${COLOR_LABELS[key]}仅支持 #RGB 或 #RRGGBB 格式。`;
      }
      return errors;
    },
    {},
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SelectionAppearance() {
  const { selectionPrefs, setSelectionPrefs } = useConfigStore();
  const [draft, setDraft] = useState<SelectionPrefs>(selectionPrefs);
  const [saved, setSaved] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const colorErrors = getColorErrors(draft);
  const hasColorErrors = Object.values(colorErrors).some(Boolean);
  const isBusy = pendingAction !== null;

  const update = (patch: Partial<SelectionPrefs>) => {
    setDraft(prev => ({ ...prev, ...patch }));
    setSaved(false);
    setActionError(null);
  };

  const save = async () => {
    if (pendingRef.current || hasColorErrors) return;

    pendingRef.current = true;
    setPendingAction('save');
    setActionError(null);
    setSaved(false);
    try {
      await setSelectionPrefs(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setActionError(`划词气泡保存失败：${getErrorMessage(error)}`);
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  };

  const reset = async () => {
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPendingAction('reset');
    setActionError(null);
    setSaved(false);
    try {
      await setSelectionPrefs(DEFAULT_SELECTION_PREFS);
      setDraft(DEFAULT_SELECTION_PREFS);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setActionError(`恢复默认失败：${getErrorMessage(error)}。当前草稿已保留。`);
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-serif text-foreground">划词气泡</h2>
        <p className="text-sm text-muted mt-1">
          控制划词气泡和 AI 结果面板的外观。颜色留空则跟随当前主题。
        </p>
      </div>

      {/* Color fields */}
      <div className="space-y-4">
        <ColorField
          label="气泡背景色"
          value={draft.bubbleBg}
          onChange={v => update({ bubbleBg: v })}
          error={colorErrors.bubbleBg}
          disabled={isBusy}
        />
        <ColorField
          label="气泡文字色"
          value={draft.bubbleText}
          onChange={v => update({ bubbleText: v })}
          error={colorErrors.bubbleText}
          disabled={isBusy}
        />
        <ColorField
          label="按钮强调色"
          value={draft.bubbleAccent}
          onChange={v => update({ bubbleAccent: v })}
          error={colorErrors.bubbleAccent}
          disabled={isBusy}
        />
      </div>

      {/* Result width */}
      <div>
        <div className="text-sm text-foreground mb-2">AI 结果面板宽度</div>
        <div className="flex gap-2 flex-wrap">
          {WIDTH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => update({ resultWidth: opt.value })}
              disabled={isBusy}
              aria-pressed={draft.resultWidth === opt.value}
              className={`px-3 py-1.5 text-xs rounded-lg border transition ${
                draft.resultWidth === opt.value
                  ? 'border-accent bg-accent text-white'
                  : 'border-border text-muted hover:text-foreground hover:border-foreground/30'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <BubblePreview prefs={draft} />

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={isBusy || hasColorErrors}
          aria-describedby="selection-appearance-status"
          className="px-4 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingAction === 'save' ? '保存中…' : saved ? '✓ 已保存' : '保存'}
        </button>
        <button
          onClick={reset}
          disabled={isBusy}
          aria-describedby="selection-appearance-status"
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-muted hover:text-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingAction === 'reset' ? '恢复中…' : '恢复默认'}
        </button>
        {actionError ? (
          <span id="selection-appearance-status" role="alert" className="text-sm text-danger">
            {actionError}
          </span>
        ) : (
          <span
            id="selection-appearance-status"
            role="status"
            aria-live="polite"
            className="text-sm text-success"
          >
            {pendingAction === 'save'
              ? '正在保存划词气泡设置'
              : pendingAction === 'reset'
                ? '正在恢复默认设置'
                : saved
                  ? '划词气泡设置已保存'
                  : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  error,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex items-start gap-3">
      <label htmlFor={id} className="w-36 text-sm text-foreground shrink-0 pt-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2 flex-1">
        {/* Color picker — only active when there's a value */}
        <input
          type="color"
          value={isValidHexColor(value) && value ? value : '#888888'}
          onChange={e => onChange(e.target.value)}
          aria-label={`${label}颜色选择`}
          disabled={disabled}
          className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
          title="选择颜色"
        />
        <div className="flex-1 min-w-0">
          <input
            id={id}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="留空跟随主题"
            aria-label={`${label}颜色值`}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            className={`w-full px-3 py-1.5 text-sm rounded-lg border bg-surface text-foreground placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
              error
                ? 'border-danger focus:border-danger'
                : 'border-border focus:border-accent'
            }`}
          />
          {error && (
            <div id={errorId} role="alert" className="mt-1 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
        {value && (
          <button
            onClick={() => onChange('')}
            disabled={disabled}
            className="text-xs text-muted hover:text-foreground px-2 py-1 rounded border border-border transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}

function BubblePreview({ prefs }: { prefs: SelectionPrefs }) {
  const widthMap = { compact: 280, normal: 400, wide: 560 };
  const previewWidth = Math.min(widthMap[prefs.resultWidth], 400);
  const safeBubbleBg = isValidHexColor(prefs.bubbleBg) ? prefs.bubbleBg : '';
  const safeBubbleText = isValidHexColor(prefs.bubbleText) ? prefs.bubbleText : '';

  return (
    <div>
      <div className="text-sm text-foreground mb-2">预览</div>
      <div className="p-4 rounded-xl border border-border bg-surface">
        {/* Bubble toolbar preview */}
        <div className="mb-3">
          <div className="text-xs text-muted mb-1.5">气泡工具条</div>
          <div
            data-testid="selection-toolbar-preview"
            className="inline-flex items-center gap-0 rounded-2xl border p-1"
            style={{
              backgroundColor: safeBubbleBg || 'var(--color-glass-overlay)',
              borderColor: 'var(--color-glass-border)',
            }}
          >
            {['翻译', '解释', '验证', '深入'].map(label => (
              <span
                key={label}
                className="px-2.5 py-1.5 text-xs rounded-lg"
                style={{ color: safeBubbleText || 'var(--color-text)' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Result panel preview */}
        <div>
          <div className="text-xs text-muted mb-1.5">AI 结果面板</div>
          <div
            data-testid="selection-result-preview"
            className="rounded-2xl border p-3"
            style={{
              width: previewWidth,
              maxWidth: '100%',
              backgroundColor: safeBubbleBg || 'var(--color-glass-overlay)',
              borderColor: 'var(--color-glass-border)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs opacity-60"
                style={{ color: safeBubbleText || 'var(--color-text)' }}
              >
                翻译
              </span>
              <span
                className="text-xs opacity-40"
                style={{ color: safeBubbleText || 'var(--color-text)' }}
              >
                ✕
              </span>
            </div>
            <div
              className="text-sm font-serif"
              style={{ color: safeBubbleText || 'var(--color-text)' }}
            >
              这里是 AI 翻译 / 解释 / 验证的结果文本示例。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
