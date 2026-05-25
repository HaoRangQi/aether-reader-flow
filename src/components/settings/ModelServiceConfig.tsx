'use client';

/**
 * @fileoverview ModelServiceConfig — list + add/edit/delete model services.
 *
 * Cherry Studio-style UX:
 *   - Show "presets" the user can click to start configuring a known
 *     vendor with a sensible baseUrl + protocol
 *   - Show "custom" tile so users can configure any OpenAI-compatible endpoint
 *   - List of existing services with edit / delete actions
 *
 * Form is `ModelServiceForm` (separate file).
 */

import { useCallback, useEffect, useState } from 'react';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import type { ModelService } from '@/types/domain';
import { ModelServiceForm } from './ModelServiceForm';

type Preset = Omit<ModelService, 'id' | 'createdAt' | 'apiKeyCipher'>;

const PRESETS: Preset[] = [
  {
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    enabled: true,
    enabledModels: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
  },
  {
    name: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    enabledModels: ['gpt-4o', 'gpt-4o-mini'],
  },
  {
    name: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    enabled: true,
    enabledModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    name: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    enabled: true,
    enabledModels: [],
  },
  {
    name: '硅基流动',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    enabled: true,
    enabledModels: [],
  },
];

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '未知错误');

export function ModelServiceConfig() {
  const [services, setServices] = useState<ModelService[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingPreset, setAddingPreset] = useState<Preset | null>(null);
  const [loadingServices, setLoadingServices] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(async (failurePrefix = '模型服务列表加载失败') => {
    setLoadingServices(true);
    try {
      const nextServices = await new IndexedDBModelServiceRepo().list();
      setServices(nextServices);
      setServicesError(null);
      return true;
    } catch (error) {
      setServicesError(`${failurePrefix}：${errorMessage(error)}。请重试。`);
      return false;
    } finally {
      setLoadingServices(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void reload();
  }, [reload]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    if (!confirm('删除该模型服务？任务路由可能需要重新配置。')) return;
    setDeleteError(null);
    setDeletingId(id);
    try {
      await new IndexedDBModelServiceRepo().delete(id);
      await reload('模型服务已删除，但刷新列表失败');
    } catch (error) {
      setDeleteError(`删除模型服务失败：${errorMessage(error)}。已保留当前服务和编辑内容。`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">模型服务</h1>
      <p className="text-sm text-muted mb-8">
        配置 AI 模型来源。绝大多数中转站兼容 OpenAI 协议，填写 base URL + API Key 即可接入。
        API Key 在浏览器中用 AES-GCM 加密存储，永不离开本机。
      </p>

      <h3 className="font-serif text-base mb-3">已配置</h3>
      {servicesError && (
        <div className="mb-4 text-sm border border-danger/30 text-danger rounded-md p-4" role="alert">
          <div>{servicesError}</div>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 text-sm text-accent hover:underline"
          >
            重试加载
          </button>
        </div>
      )}
      {deleteError && (
        <div className="mb-4 text-sm border border-danger/30 text-danger rounded-md p-4" role="alert">
          {deleteError}
        </div>
      )}
      {loadingServices ? (
        <div className="text-sm text-muted" role="status">
          正在加载模型服务列表…
        </div>
      ) : services.length === 0 && !servicesError ? (
        <div className="text-sm text-subtle border border-dashed border-border rounded-md p-6 text-center">
          还没配置任何服务，从下方预置选择一个开始
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {services.map(s => (
            <div
              key={s.id}
              role="group"
              aria-label={`模型服务 ${s.name}`}
              className="flex items-center justify-between border border-border rounded-md p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground">{s.name}</div>
                <div className="text-xs text-subtle truncate">
                  {s.protocol} · {s.baseUrl} · {s.enabledModels.length} 个模型
                </div>
              </div>
              <div className="flex gap-3 shrink-0 ml-3">
                <button
                  onClick={() => setEditingId(s.id)}
                  className="text-sm text-accent hover:underline"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId !== null}
                  aria-busy={deletingId === s.id}
                  className="text-sm text-danger hover:underline"
                >
                  {deletingId === s.id ? '删除中…' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="font-serif text-base mb-3">添加</h3>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => setAddingPreset(p)}
            className="text-left border border-border rounded-md p-3 hover:bg-surface-elevated"
          >
            <div className="text-sm font-medium text-foreground">{p.name}</div>
            <div className="text-xs text-subtle truncate">{p.baseUrl}</div>
          </button>
        ))}
        <button
          onClick={() =>
            setAddingPreset({
              name: '',
              protocol: 'openai',
              baseUrl: '',
              enabled: true,
              enabledModels: [],
            })
          }
          className="text-left border border-dashed border-border rounded-md p-3 hover:bg-surface-elevated"
        >
          <div className="text-sm font-medium text-foreground">+ 自定义服务</div>
          <div className="text-xs text-subtle">兼容 OpenAI 协议的任何 endpoint</div>
        </button>
      </div>

      {(addingPreset || editingId) && (
        <ModelServiceForm
          existingId={editingId ?? undefined}
          preset={addingPreset ?? undefined}
          onClose={() => {
            setAddingPreset(null);
            setEditingId(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
