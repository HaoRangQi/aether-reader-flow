'use client';

/**
 * @fileoverview FontPreferences — let users override reader typography.
 *
 * Persists into ConfigService's font prefs; live preview rendered in the
 * panel. ThemeProvider (P5) will apply these to `:root` CSS variables so
 * the reader picks them up immediately.
 */

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import type { FontPrefs } from '@/services/ConfigService';
import clsx from 'clsx';

export function FontPreferences() {
  const { font, setFont } = useConfigStore();
  const [local, setLocal] = useState<FontPrefs>(font);
  const [saved, setSaved] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setLocal(font), [font]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = async () => {
    await setFont(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const previewFamily =
    local.family === 'custom' && local.customCSS ? local.customCSS : 'var(--font-serif)';

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">阅读偏好</h1>
      <p className="text-sm text-muted mb-8">
        默认字体为思源宋体 + Source Serif Pro。可填写 CSS font-family 使用系统已安装的字体。
      </p>

      <Section label="字体">
        <div className="flex gap-2 mb-3">
          {(['default', 'custom'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setLocal({ ...local, family: opt })}
              className={clsx(
                'px-4 py-2 text-sm rounded-md transition',
                local.family === opt
                  ? 'bg-accent text-white'
                  : 'border border-border text-foreground hover:bg-surface-elevated',
              )}
            >
              {opt === 'default' ? '默认' : '自定义'}
            </button>
          ))}
        </div>
        {local.family === 'custom' && (
          <input
            type="text"
            placeholder='例：Charter, Optima, "PingFang SC", serif'
            value={local.customCSS}
            onChange={e => setLocal({ ...local, customCSS: e.target.value })}
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
          />
        )}
      </Section>

      <Section label="字号">
        <div className="flex gap-2">
          {[14, 17, 20].map(s => (
            <button
              key={s}
              onClick={() => setLocal({ ...local, size: s as 14 | 17 | 20 })}
              className={clsx(
                'px-4 py-2 text-sm rounded-md transition',
                local.size === s
                  ? 'bg-accent text-white'
                  : 'border border-border text-foreground hover:bg-surface-elevated',
              )}
            >
              {s}px
            </button>
          ))}
        </div>
      </Section>

      <Section label="行高">
        <div className="flex gap-2">
          {[1.6, 1.8, 2.0].map(h => (
            <button
              key={h}
              onClick={() => setLocal({ ...local, lineHeight: h as 1.6 | 1.8 | 2.0 })}
              className={clsx(
                'px-4 py-2 text-sm rounded-md transition',
                local.lineHeight === h
                  ? 'bg-accent text-white'
                  : 'border border-border text-foreground hover:bg-surface-elevated',
              )}
            >
              {h}
            </button>
          ))}
        </div>
      </Section>

      <Section label="预览">
        <div
          className="border border-border rounded-md p-6 bg-surface"
          style={{
            fontFamily: previewFamily,
            fontSize: `${local.size}px`,
            lineHeight: local.lineHeight,
          }}
        >
          央行扩表是否必然推高资产价格？这是一个值得反复求证的问题。
          <br />
          When money supply expands, asset prices tend to follow — but not always.
        </div>
      </Section>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={save}
          className="bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)]"
        >
          保存
        </button>
        {saved && <span className="text-sm text-success">✓ 已保存</span>}
      </div>
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
