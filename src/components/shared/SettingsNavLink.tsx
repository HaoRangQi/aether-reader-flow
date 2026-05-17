'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useT } from '@/components/shared/I18nProvider';

export function SettingsNavLink() {
  const t = useT();
  return (
    <Link
      href="/settings"
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
    >
      <Settings size={14} /> {t('library.settings')}
    </Link>
  );
}
