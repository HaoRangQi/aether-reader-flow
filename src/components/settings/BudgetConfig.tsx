'use client';

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { useT } from '@/components/shared/I18nProvider';

export function BudgetConfig() {
  const t = useT();
  const { budgetCNY, setBudget } = useConfigStore();
  const [value, setValue] = useState(budgetCNY);
  const [saved, setSaved] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setValue(budgetCNY);
  }, [budgetCNY]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = async () => {
    if (!Number.isFinite(value) || value <= 0) return;
    await setBudget(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">{t('settings.budget.title')}</h1>
      <p className="text-sm text-muted mb-8">{t('settings.budget.description')}</p>

      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground">¥</span>
        <input
          type="number"
          min="0"
          step="10"
          value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="w-32 bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
        />
        <span className="text-sm text-muted">{t('settings.budget.unit')}</span>
        <button
          onClick={handleSave}
          className="ml-4 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)]"
        >
          {t('settings.budget.save')}
        </button>
        {saved && (
          <span className="text-sm text-success">{t('settings.budget.saved')}</span>
        )}
      </div>

      <p className="text-xs text-subtle mt-6">{t('settings.budget.hint')}</p>
    </div>
  );
}
