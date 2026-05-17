'use client';

/**
 * @fileoverview TaskRoutingConfig — assigns a default model to each task type.
 *
 * Builds the option list from all enabled models across all enabled services.
 * If no services exist, shows guidance pointing to ModelServiceConfig.
 */

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import type {
  ModelService,
  TaskType,
  ModelRef,
  TaskRouting,
} from '@/types/domain';

const TASKS: { key: TaskType; label: string; hint?: string }[] = [
  { key: 'translate', label: '划词翻译', hint: '建议低成本快速模型（如 Haiku）' },
  { key: 'explain', label: '概念解释' },
  { key: 'verify', label: '联网验证', hint: '需要支持 Web Search 的模型' },
  { key: 'summarize', label: '章节总结' },
  { key: 'chat', label: '追问对话' },
];

function refKey(r: ModelRef): string {
  return `${r.serviceId}::${r.modelId}`;
}

export function TaskRoutingConfig() {
  const { routing, setRouting, hydrated } = useConfigStore();
  const [services, setServices] = useState<ModelService[]>([]);

  useEffect(() => {
    (async () => {
      setServices(await new IndexedDBModelServiceRepo().list());
    })();
  }, []);

  if (!hydrated) {
    return <div className="text-muted">加载中…</div>;
  }

  const options: Array<{ value: string; label: string; ref: ModelRef }> = [];
  for (const s of services) {
    if (!s.enabled) continue;
    for (const m of s.enabledModels) {
      options.push({
        value: refKey({ serviceId: s.id, modelId: m }),
        label: `${s.name} · ${m}`,
        ref: { serviceId: s.id, modelId: m },
      });
    }
  }

  const setTaskModel = (task: TaskType, value: string) => {
    const opt = options.find(o => o.value === value);
    if (!opt) return;
    const next: TaskRouting = { ...routing, [task]: opt.ref };
    void setRouting(next);
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">任务路由</h1>
      <p className="text-sm text-muted mb-8">
        为每种 AI 任务选择默认模型。阅读时也可以通过侧栏顶部的切换器临时换用。
      </p>

      {options.length === 0 ? (
        <div className="text-sm border border-dashed border-warning/30 text-warning rounded-md p-4">
          没有可用模型。请先到「模型服务」配置并启用模型。
        </div>
      ) : (
        <div className="space-y-5">
          {TASKS.map(t => (
            <div key={t.key} className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-foreground">{t.label}</div>
                {t.hint && <div className="text-xs text-subtle">{t.hint}</div>}
              </div>
              <select
                value={refKey(routing[t.key])}
                onChange={e => setTaskModel(t.key, e.target.value)}
                className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground min-w-[280px]"
              >
                {/* If current routing points to a non-existent option,
                    surface it as disabled so users see what was set. */}
                {!options.some(o => o.value === refKey(routing[t.key])) && (
                  <option value={refKey(routing[t.key])} disabled>
                    （未配置）{routing[t.key].modelId}
                  </option>
                )}
                {options.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
