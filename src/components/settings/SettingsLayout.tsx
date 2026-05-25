'use client';

/**
 * Settings layout — left rail of section names + right content area.
 *
 * Section content is provided by the caller via the `sections` map so
 * each section's data flow is self-contained. State of "which section
 * is active" is local to the layout component. All labels are i18n-aware.
 */
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useT } from '@/components/shared/I18nProvider';
import type { TKey } from '@/lib/i18n';

export type SectionId = 'models' | 'routing' | 'budget' | 'theme' | 'font' | 'language' | 'selection' | 'prompts' | 'storage';

const SECTIONS: { id: SectionId; labelKey: TKey }[] = [
  { id: 'models', labelKey: 'settings.section.models' },
  { id: 'routing', labelKey: 'settings.section.routing' },
  { id: 'prompts', labelKey: 'settings.section.prompts' },
  { id: 'budget', labelKey: 'settings.section.budget' },
  { id: 'theme', labelKey: 'settings.section.theme' },
  { id: 'font', labelKey: 'settings.section.font' },
  { id: 'language', labelKey: 'settings.section.language' },
  { id: 'selection', labelKey: 'settings.section.selection' },
  { id: 'storage', labelKey: 'settings.section.storage' },
];

const DEFAULT_SECTION: SectionId = 'models';
const SECTION_IDS = new Set<SectionId>(SECTIONS.map(section => section.id));

export interface SettingsLayoutProps {
  sections: Record<SectionId, ReactNode>;
  showBackLink?: boolean;
}

function getHashSection(): SectionId | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash.slice(1);
  return SECTION_IDS.has(hash as SectionId) ? (hash as SectionId) : null;
}

export function SettingsLayout({ sections, showBackLink = true }: SettingsLayoutProps) {
  const t = useT();
  const [active, setActive] = useState<SectionId>(DEFAULT_SECTION);

  useEffect(() => {
    const handleHashChange = () => {
      const section = getHashSection();
      if (section) setActive(section);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const selectSection = (section: SectionId) => {
    const nextHash = `#${section}`;
    if (active === section && window.location.hash === nextHash) return;

    setActive(section);
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
  };

  return (
    <div className="flex h-screen min-h-0 flex-col md:flex-row">
      <aside className="shrink-0 border-b border-divider p-4 md:w-60 md:border-b-0 md:border-r md:overflow-y-auto">
        {showBackLink && (
          <Link
            href="/"
            className="mb-4 flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            {t('library.back')}
          </Link>
        )}
        <h2 className="font-serif text-lg mb-4">{t('settings.title')}</h2>
        <nav
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:block md:space-y-1 md:overflow-visible md:px-0 md:pb-0"
          aria-label={t('settings.title')}
        >
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => selectSection(s.id)}
              className={clsx(
                'shrink-0 rounded-md px-3 py-2 text-sm transition md:w-full md:text-left',
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
      <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-12">
        <div className="mx-auto w-full max-w-3xl">{sections[active]}</div>
      </main>
    </div>
  );
}
