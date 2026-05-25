'use client';

import { useRef, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import type { FontPrefs } from '@/services/ConfigService';

const SYSTEM_FONTS = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Palatino', value: 'Palatino, "Palatino Linotype", serif' },
  { label: 'Charter', value: 'Charter, "Bitstream Charter", serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'SF Pro / Segoe UI', value: '-apple-system, "Segoe UI", sans-serif' },
  { label: 'PingFang SC', value: '"PingFang SC", "Hiragino Sans GB", sans-serif' },
  { label: 'Microsoft YaHei', value: '"Microsoft YaHei", "微软雅黑", sans-serif' },
  { label: 'Noto Serif SC', value: '"Noto Serif SC", serif' },
  { label: 'Source Han Serif', value: '"Source Han Serif SC", "思源宋体", serif' },
  { label: 'Menlo / Consolas', value: 'Menlo, Consolas, "Courier New", monospace' },
];

type FamilyMode = 'default' | 'system' | 'custom';

function resolveFontCSS(family: FamilyMode, value: string, fallback: string): string {
  if (family === 'default') return fallback;
  return value || fallback;
}

export function FontPreferences() {
  const { font, setFont } = useConfigStore();
  const [localOverride, setLocalOverride] = useState<FontPrefs | null>(null);
  const [unified, setUnified] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const local = localOverride ?? font;
  const setLocal = (
    next: FontPrefs | ((prev: FontPrefs) => FontPrefs),
  ) => {
    setSaveError(null);
    setSaved(false);
    setLocalOverride(prev => {
      const base = prev ?? font;
      return typeof next === 'function' ? next(base) : next;
    });
  };

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await setFont(local);
      setLocalOverride(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(`字体设置保存失败：${message}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // When unified is toggled on, copy reader settings to UI
  const handleUnifiedToggle = (on: boolean) => {
    setUnified(on);
    if (on) {
      setLocal(prev => ({
        ...prev,
        uiFamily: prev.readerFamily,
        uiFontValue: prev.readerFontValue,
      }));
    }
  };

  // When unified is on, changing reader font also updates UI font
  const setReaderFont = (patch: Partial<Pick<FontPrefs, 'readerFamily' | 'readerFontValue'>>) => {
    setLocal(prev => {
      const next = { ...prev, ...patch };
      if (unified) {
        next.uiFamily = (patch.readerFamily ?? prev.readerFamily) as FamilyMode;
        next.uiFontValue = patch.readerFontValue ?? prev.readerFontValue;
      }
      return next;
    });
  };

  const readerCSS = resolveFontCSS(local.readerFamily, local.readerFontValue, 'var(--font-serif)');
  const uiCSS = resolveFontCSS(local.uiFamily, local.uiFontValue, 'var(--font-sans)');

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">阅读偏好</h1>
      <p className="text-sm text-muted mb-6">
        字体分为「界面字体」（整个应用）和「阅读字体」（正文区域）。可统一设置，也可分别调整。
      </p>

      {/* Unified toggle */}
      <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-surface border border-border">
        <button
          role="switch"
          aria-checked={unified}
          aria-label="统一字体"
          aria-describedby="font-unified-description"
          onClick={() => handleUnifiedToggle(!unified)}
          disabled={saving}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${unified ? 'bg-accent' : 'bg-border'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${unified ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
        <div>
          <div className="text-sm text-foreground">统一字体</div>
          <div id="font-unified-description" className="text-xs text-muted">界面和阅读区使用同一字体</div>
        </div>
      </div>

      {/* Reader font */}
      <Section label={unified ? '字体' : '阅读字体'}>
        <FontSelector
          label={unified ? '字体' : '阅读字体'}
          family={local.readerFamily}
          value={local.readerFontValue}
          onFamilyChange={v => setReaderFont({ readerFamily: v })}
          onValueChange={v => setReaderFont({ readerFontValue: v })}
          disabled={saving}
        />
      </Section>

      {/* UI font — only shown when not unified */}
      {!unified && (
        <Section label="界面字体">
          <FontSelector
            label="界面字体"
            family={local.uiFamily}
            value={local.uiFontValue}
            onFamilyChange={v => setLocal(prev => ({ ...prev, uiFamily: v }))}
            onValueChange={v => setLocal(prev => ({ ...prev, uiFontValue: v }))}
            disabled={saving}
          />
        </Section>
      )}

      {/* Size slider */}
      <Section label={`字号 · ${local.readerSize}px`}>
        <input
          type="range" min={12} max={24} step={1}
          value={local.readerSize}
          aria-label="阅读字号"
          aria-describedby="font-size-description"
          aria-valuetext={`${local.readerSize}px`}
          onChange={e => setLocal(prev => ({ ...prev, readerSize: Number(e.target.value) }))}
          disabled={saving}
          className="w-full accent-accent disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div id="font-size-description" className="flex justify-between text-xs text-subtle mt-1">
          <span>12px 小</span><span>24px 大</span>
        </div>
      </Section>

      {/* Line height slider */}
      <Section label={`行高 · ${local.readerLineHeight.toFixed(1)}`}>
        <input
          type="range" min={1.4} max={2.2} step={0.1}
          value={local.readerLineHeight}
          aria-label="阅读行高"
          aria-describedby="font-line-height-description"
          aria-valuetext={local.readerLineHeight.toFixed(1)}
          onChange={e => setLocal(prev => ({ ...prev, readerLineHeight: Number(e.target.value) }))}
          disabled={saving}
          className="w-full accent-accent disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div id="font-line-height-description" className="flex justify-between text-xs text-subtle mt-1">
          <span>1.4 紧凑</span><span>2.2 宽松</span>
        </div>
      </Section>

      {/* Preview */}
      <Section label="预览">
        <div className="space-y-3">
          <div>
            <div className="text-xs text-subtle mb-1">界面字体</div>
            <div className="border border-border rounded-lg px-4 py-3 bg-surface text-sm"
              style={{ fontFamily: uiCSS }}>
              设置 · 书架 · 章节总结 · AI 对话 · 时间轴
            </div>
          </div>
          <div>
            <div className="text-xs text-subtle mb-1">阅读字体</div>
            <div className="border border-border rounded-lg px-4 py-3 bg-surface"
              style={{ fontFamily: readerCSS, fontSize: `${local.readerSize}px`, lineHeight: local.readerLineHeight }}>
              央行扩表是否必然推高资产价格？这是一个值得反复求证的问题。
              <br />
              When money supply expands, asset prices tend to follow — but not always.
            </div>
          </div>
        </div>
      </Section>

      <div className="flex items-center gap-3 mt-6">
        <button onClick={save}
          disabled={saving}
          aria-describedby="font-save-status"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm hover:bg-accent-hover transition disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? '保存中…' : '保存'}
        </button>
        {saveError ? (
          <span id="font-save-status" role="alert" className="text-sm text-danger">
            {saveError}
          </span>
        ) : (
          <span id="font-save-status" role="status" aria-live="polite" className="text-sm text-success">
            {saved ? '✓ 已保存' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function FontSelector({
  label, family, value, onFamilyChange, onValueChange, disabled = false,
}: {
  label: string;
  family: FamilyMode;
  value: string;
  onFamilyChange: (v: FamilyMode) => void;
  onValueChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap" role="group" aria-label={`${label}模式`}>
        {(['default', 'system', 'custom'] as FamilyMode[]).map(opt => (
          <button key={opt} onClick={() => onFamilyChange(opt)}
            aria-label={`${label}${opt === 'default' ? '默认' : opt === 'system' ? '系统字体' : '自定义'}`}
            aria-pressed={family === opt}
            disabled={disabled}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              family === opt
                ? 'bg-accent text-white'
                : 'border border-border text-foreground hover:bg-surface-elevated'
            } disabled:cursor-not-allowed disabled:opacity-60`}>
            {opt === 'default' ? '默认' : opt === 'system' ? '系统字体' : '自定义'}
          </button>
        ))}
      </div>
      {family === 'system' && (
        <select value={value} onChange={e => onValueChange(e.target.value)}
          aria-label={`${label}系统字体`}
          disabled={disabled}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60">
          <option value="">选择字体…</option>
          {SYSTEM_FONTS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      )}
      {family === 'custom' && (
        <input type="text" value={value} onChange={e => onValueChange(e.target.value)}
          aria-label={`${label}自定义字体`}
          placeholder='例：Charter, "PingFang SC", serif'
          disabled={disabled}
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60" />
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-sm text-muted mb-2">{label}</div>
      {children}
    </div>
  );
}
