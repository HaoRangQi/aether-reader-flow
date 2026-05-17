'use client';

/**
 * Settings layout — left rail of section names + right content area.
 *
 * Section content is provided by the caller via the `sections` map so
 * each section's data flow is self-contained. State of "which section
 * is active" is local to the layout component. All labels are i18n-aware.
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import { useT } from '@/components/shared/I18nProvider';
import type { TKey } from '@/lib/i18n';

export type SectionId = 'models' | 'routing' | 'budget' | 'theme' | 'font' | 'language';

const SECTIONS: { id: SectionId; labelKey: TKey }[] = [
  { id: 'models', labelKey: 'settings.section.models' },
  { id: 'routing', labelKey: 'settings.section.routing' },
  { id: 'budget', labelKey: 'settings.section.budget' },
  { id: 'theme', labelKey: 'settings.section.theme' },
  { id: 'font', labelKey: 'settings.section.font' },
  { id: 'language', labelKey: 'settings.section.language' },
];

export interface SettingsLayoutProps {
  sections: Record<SectionId, ReactNode>;
}

export function SettingsLayout({ sections }: SettingsLayoutProps) {
  const t = useT();
  const [active, setActive] = useState<SectionId>('models');

  return (
    <div className="flex h-screen">
      <aside className="w-60 shrink-0 border-r border-divider p-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground mb-4"
        >
          <ArrowLeft size={14} /> {t('library.back')}
        </Link>
        <h2 className="font-serif text-lg mb-4">{t('settings.title')}</h2>
        <nav className="space-y-1" aria-label={t('settings.title')}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={clsx(
                'w-full text-left px-3 py-2 rounded-md text-sm transition',
                active === s.id
                  ? 'bg-[var(--color-accent)]/10 text-accent'
                  : 'text-muted hover:bg-surface-elevated hover:text-foreground',
              )}
              aria-current={active === s.id ? 'page' : undefined}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-12">
        <div className="max-w-3xl mx-auto">{sections[active]}</div>
      </main>
    </div>
  );
}
