'use client';

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { useT } from '@/components/shared/I18nProvider';

export function BudgetConfig() {
  const t = useT();
  const { budgetCNY, setBudget } = useConfigStore();
  const [value, setValue] = useState(budgetCNY);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const invalid = !Number.isFinite(value) || value <= 0;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setValue(budgetCNY);
  }, [budgetCNY]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = async () => {
    if (invalid || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await setBudget(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveError(`预算保存失败：${message}`);
    } finally {
      setSaving(false);
    }
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
          disabled={saving}
          aria-label="月度 AI 调用预算"
          aria-describedby="budget-help budget-validation"
          aria-invalid={invalid}
          className="w-32 bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="text-sm text-muted">{t('settings.budget.unit')}</span>
        <button
          onClick={handleSave}
          disabled={invalid || saving}
          aria-describedby="budget-validation budget-save-status"
          className="ml-4 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? '保存中…' : t('settings.budget.save')}
        </button>
        {saveError ? (
          <span id="budget-save-status" className="text-sm text-danger" role="alert">
            {saveError}
          </span>
        ) : (
          <span id="budget-save-status" className="text-sm text-success" role="status" aria-live="polite">
            {saved ? t('settings.budget.saved') : ''}
          </span>
        )}
      </div>

      <p id="budget-validation" className="mt-2 text-xs text-danger" role={invalid ? 'alert' : undefined}>
        {invalid ? '请输入大于 0 的月度预算。' : ''}
      </p>
      <p id="budget-help" className="text-xs text-subtle mt-4">{t('settings.budget.hint')}</p>
    </div>
  );
}
