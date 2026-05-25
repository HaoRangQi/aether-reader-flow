'use client';

import { useEffect, useState } from 'react';
import { useConfigStore } from '@/stores/configStore';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import type { ModelService, TaskType, ModelRef } from '@/types/domain';

const TASKS: { key: TaskType; label: string; hint?: string }[] = [
  { key: 'translate', label: '划词翻译', hint: '建议低成本快速模型（如 Haiku）' },
  { key: 'explain', label: '概念解释' },
  { key: 'verify', label: '联网验证', hint: '可选择任意模型；带 Web Search 标记的是显式工具搜索，部分模型可能内置搜索' },
  { key: 'summarize', label: '章节总结' },
  { key: 'chat', label: '追问对话' },
];

interface RoutingOption {
  value: string;
  label: string;
  ref: ModelRef;
  supportsWebSearch: boolean;
}

function refKey(r: ModelRef): string {
  return `${r.serviceId}::${r.modelId}`;
}

export function TaskRoutingConfig() {
  const { routing, setRouting, hydrated } = useConfigStore();
  const [services, setServices] = useState<ModelService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [routingFeedback, setRoutingFeedback] = useState<{
    type: 'status' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const nextServices = await new IndexedDBModelServiceRepo().list();
        if (!alive) return;
        setServices(nextServices);
        setServicesError(null);
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : '未知错误';
        setServicesError(`模型服务列表加载失败：${message}`);
        setServices([]);
      } finally {
        if (alive) setServicesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!hydrated) {
    return (
      <div className="text-muted" role="status">
        加载任务路由配置中…
      </div>
    );
  }

  const options: RoutingOption[] = [];
  for (const s of services) {
    if (!s.enabled) continue;
    for (const m of s.enabledModels) {
      options.push({
        value: refKey({ serviceId: s.id, modelId: m }),
        label: `${s.name} · ${m}`,
        ref: { serviceId: s.id, modelId: m },
        supportsWebSearch: s.protocol === 'anthropic',
      });
    }
  }

  const setTaskModel = async (task: TaskType, value: string) => {
    const opt = optionsForTask(task).find(o => o.value === value);
    if (!opt) return;
    setRoutingFeedback({ type: 'status', message: '正在保存任务路由…' });
    try {
      await setRouting({ ...routing, [task]: opt.ref });
      setRoutingFeedback({ type: 'status', message: '任务路由已保存' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setRoutingFeedback({
        type: 'error',
        message: `任务路由保存失败：${message}。已保留当前选择。`,
      });
    }
  };

  // Batch-assign all tasks to one model, then each task can still be changed individually
  const applyUnified = async (value: string) => {
    const opt = options.find(o => o.value === value);
    if (!opt) return;
    setRoutingFeedback({ type: 'status', message: '正在保存任务路由…' });
    try {
      await setRouting({
        translate: opt.ref,
        explain: opt.ref,
        verify: opt.ref,
        summarize: opt.ref,
        chat: opt.ref,
      });
      setRoutingFeedback({ type: 'status', message: '任务路由已保存' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setRoutingFeedback({
        type: 'error',
        message: `任务路由保存失败：${message}。已保留当前选择。`,
      });
    }
  };

  const allSame =
    TASKS.length > 0 &&
    TASKS.every(t => refKey(routing[t.key]) === refKey(routing[TASKS[0].key]));

  function optionsForTask(task: TaskType): RoutingOption[] {
    void task;
    return options;
  }

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">任务路由</h1>
      <p className="text-sm text-muted mb-6">
        为每种 AI 任务选择默认模型。「统一应用」会批量赋值，之后仍可单独调整各任务。
      </p>

      {servicesLoading ? (
        <div className="text-sm text-muted" role="status">
          正在加载模型服务列表…
        </div>
      ) : servicesError ? (
        <div className="text-sm border border-danger/30 text-danger rounded-md p-4" role="alert">
          {servicesError}
        </div>
      ) : options.length === 0 ? (
        <div className="text-sm border border-dashed border-warning/30 text-warning rounded-md p-4">
          没有可用模型。请先到「模型服务」配置并启用模型。
        </div>
      ) : (
        <>
          {/* Batch-apply row */}
          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-foreground">统一应用</div>
              <div className="text-xs text-muted">
                选择后批量赋值到所有任务；联网验证也可使用内置搜索模型
              </div>
            </div>
            <select
              aria-label="统一应用模型"
              value={allSame ? refKey(routing[TASKS[0].key]) : ''}
              onChange={e => void applyUnified(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground sm:w-auto sm:min-w-[240px]"
            >
              {!allSame && (
                <option value="" disabled>选择统一模型…</option>
              )}
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {routingFeedback && (
            <div
              className={
                routingFeedback.type === 'error'
                  ? 'mb-4 text-sm text-danger'
                  : 'mb-4 text-sm text-muted'
              }
              role={routingFeedback.type === 'error' ? 'alert' : 'status'}
            >
              {routingFeedback.message}
            </div>
          )}

          {/* Per-task routing — always visible */}
          <div className="space-y-4">
            {TASKS.map(t => {
              const taskOptions = optionsForTask(t.key);
              const currentKey = refKey(routing[t.key]);
              const currentOption = options.find(o => o.value === currentKey);
              const currentIsSelectable = taskOptions.some(o => o.value === currentKey);

              return (
                <div key={t.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0 sm:min-w-[120px]">
                    <div className="text-sm font-medium text-foreground">{t.label}</div>
                    {t.hint && <div className="text-xs text-subtle">{t.hint}</div>}
                  </div>
                  <select
                    aria-label={`${t.label}模型`}
                    value={currentKey}
                    onChange={e => void setTaskModel(t.key, e.target.value)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground sm:w-auto sm:min-w-[280px]"
                  >
                    {!currentIsSelectable && (
                      <option value={currentKey} disabled>
                        {currentOption ? '（当前模型不可用）' : '（未配置）'}{routing[t.key].modelId}
                      </option>
                    )}
                    {taskOptions.map(o => (
                      <option key={o.value} value={o.value}>
                        {t.key === 'verify' && o.supportsWebSearch
                          ? `${o.label}（Web Search）`
                          : o.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
