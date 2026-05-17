'use client';

/**
 * @fileoverview ModelSwitcher — small dropdown shown at the top of the AI
 * sidebar. Lets the user temporarily override which model handles the
 * current conversation, without changing the global task routing.
 *
 * Lists all enabled models across all enabled services.
 */

import { useEffect, useState } from 'react';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import type { ModelRef, TaskType } from '@/types/domain';
import { useConfigStore } from '@/stores/configStore';

interface Option {
  value: string;
  label: string;
  ref: ModelRef;
}

interface Props {
  taskType: TaskType;
  override?: ModelRef;
  onOverride: (ref: ModelRef) => void;
}

export function ModelSwitcher({ taskType, override, onOverride }: Props) {
  const routing = useConfigStore(s => s.routing);
  const [opts, setOpts] = useState<Option[]>([]);

  useEffect(() => {
    (async () => {
      const services = await new IndexedDBModelServiceRepo().list();
      const list: Option[] = [];
      for (const s of services) {
        if (!s.enabled) continue;
        for (const m of s.enabledModels) {
          list.push({
            value: `${s.id}::${m}`,
            label: `${s.name} · ${m}`,
            ref: { serviceId: s.id, modelId: m },
          });
        }
      }
      setOpts(list);
    })();
  }, []);

  if (opts.length === 0) return null;

  const current = override ?? routing[taskType];
  const value = `${current.serviceId}::${current.modelId}`;
  const hasCurrent = opts.some(o => o.value === value);

  return (
    <select
      value={value}
      onChange={e => {
        const opt = opts.find(o => o.value === e.target.value);
        if (opt) onOverride(opt.ref);
      }}
      className="text-xs bg-transparent border border-border rounded-md px-2 py-1 text-foreground max-w-[180px] truncate"
      aria-label="切换模型"
    >
      {!hasCurrent && (
        <option value={value} disabled>
          （未配置）{current.modelId}
        </option>
      )}
      {opts.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
