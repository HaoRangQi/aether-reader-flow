'use client';

/**
 * @fileoverview ModelSwitcher — small dropdown shown at the top of the AI
 * sidebar. Lets the user temporarily override which model handles the
 * current conversation, without changing the global task routing.
 *
 * Lists all enabled models across all enabled services.
 */

import { useEffect, useId, useState } from 'react';
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
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const statusId = useId();

  useEffect(() => {
    let mounted = true;

    async function loadModels() {
      try {
        const services = await new IndexedDBModelServiceRepo().list();
        const list: Option[] = [];
        const seenValues = new Set<string>();
        for (const s of services) {
          if (!s.enabled) continue;
          for (const m of s.enabledModels) {
            const value = `${s.id}::${m}`;
            if (seenValues.has(value)) continue;
            seenValues.add(value);
            list.push({
              value,
              label: `${s.name} · ${m}`,
              ref: { serviceId: s.id, modelId: m },
            });
          }
        }
        if (!mounted) return;
        setOpts(list);
        setLoadFailed(false);
        setLoaded(true);
      } catch {
        if (!mounted) return;
        setOpts([]);
        setLoadFailed(true);
        setLoaded(true);
      }
    }

    void loadModels();

    return () => {
      mounted = false;
    };
  }, []);

  const current = override ?? routing[taskType];
  const value = current ? `${current.serviceId}::${current.modelId}` : '__missing-route__';
  const hasCurrent = current ? opts.some(o => o.value === value) : false;
  const hasOverride = Boolean(override);
  const isLoadFailed = loaded && loadFailed;
  const isEmpty = loaded && !loadFailed && opts.length === 0;
  const isDisabled = !loaded || isEmpty || isLoadFailed;
  const selectValue = !loaded ? '__loading__' : isLoadFailed ? '__load-error__' : isEmpty ? '__empty__' : value;

  let status = '正在加载可用模型。';
  if (isLoadFailed) {
    status = '模型列表加载失败，模型切换器已禁用。';
  } else if (isEmpty) {
    status = '没有可用模型服务或已启用模型，模型切换器已禁用。';
  } else if (!current) {
    status = '当前任务未配置模型路由，可从列表选择临时模型。';
  } else if (loaded && !hasCurrent) {
    status = '当前服务或模型不可用，可从列表选择临时模型。';
  } else if (loaded && hasOverride) {
    status = '已为当前对话临时覆盖模型。';
  } else if (loaded) {
    status = '可为当前任务临时切换模型。';
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <select
        value={selectValue}
        onChange={e => {
          const opt = opts.find(o => o.value === e.target.value);
          if (opt) onOverride(opt.ref);
        }}
        className="text-xs bg-transparent border border-border rounded-md px-2 py-1 text-foreground max-w-[180px] truncate disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="切换模型"
        aria-describedby={statusId}
        aria-invalid={isLoadFailed || undefined}
        disabled={isDisabled}
      >
        {!loaded && (
          <option value="__loading__" disabled>
            加载模型中
          </option>
        )}
        {isLoadFailed && (
          <option value="__load-error__" disabled>
            模型加载失败
          </option>
        )}
        {isEmpty && (
          <option value="__empty__" disabled>
            无可用模型
          </option>
        )}
        {loaded && !isEmpty && !current && (
          <option value="__missing-route__" disabled>
            当前任务未配置模型
          </option>
        )}
        {loaded && current && !hasCurrent && (
          <option value={value} disabled>
            （不可用）{current.modelId}
          </option>
        )}
        {opts.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
    </span>
  );
}
