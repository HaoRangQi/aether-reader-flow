'use client';

/**
 * BudgetConfig — set monthly CNY budget. Alerts at 80% / 100% are
 * handled separately by BudgetIndicator on cost updates.
 */
import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';

export function BudgetConfig() {
  const { budgetCNY, setBudget } = useConfigStore();
  const [value, setValue] = useState(budgetCNY);
  const [saved, setSaved] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setValue(budgetCNY);
  }, [budgetCNY]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = async () => {
    if (!Number.isFinite(value) || value <= 0) {
      alert('预算需为正数');
      return;
    }
    await setBudget(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">成本预算</h1>
      <p className="text-sm text-muted mb-8">
        设置月度 AI 调用预算（人民币）。达到 80% / 100% 会有提醒，不会强制中断。
      </p>

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
        <span className="text-sm text-muted">/ 月</span>
        <button
          onClick={handleSave}
          className="ml-4 bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)]"
        >
          保存
        </button>
        {saved && <span className="text-sm text-success">✓ 已保存</span>}
      </div>

      <p className="text-xs text-subtle mt-6">
        参考：一本 30 万字金融科普书约消耗 ¥180–300（具体取决于模型与使用强度）。
      </p>
    </div>
  );
}
