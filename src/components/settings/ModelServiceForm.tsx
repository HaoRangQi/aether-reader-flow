'use client';

/**
 * @fileoverview ModelServiceForm — create / edit a ModelService with
 * Cherry-Studio-style model discovery.
 *
 * Flow:
 *   1. Fill name / baseUrl / protocol / apiKey
 *   2. Click "拉取模型列表" → POST /api/models/list → render checkboxes
 *   3. User toggles which models to enable
 *   4. (Optional) Click "测试连接" to verify credentials
 *   5. Save — encrypts apiKey via KeyVault and writes ModelService
 *
 * Falls back to manual CSV input if the catalog endpoint fails or returns
 * empty (some self-hosted endpoints don't implement /models).
 */

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { getVault } from '@/lib/ai-service-client';
import type { ModelService, ModelInfo } from '@/types/domain';
import { X, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

type Preset = Omit<ModelService, 'id' | 'createdAt' | 'apiKeyCipher'>;

interface Props {
  existingId?: string;
  preset?: Preset;
  onClose: () => void;
}

export function ModelServiceForm({ existingId, preset, onClose }: Props) {
  const vault = getVault();

  const [name, setName] = useState(preset?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(preset?.baseUrl ?? '');
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>(
    preset?.protocol ?? 'openai',
  );
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  // Discovered catalog + which ones the user enabled.
  const [catalog, setCatalog] = useState<ModelInfo[] | null>(null);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    new Set(preset?.enabledModels ?? []),
  );
  // Manual-entry fallback list (CSV) — used when catalog is empty
  // or the user adds custom ids.
  const [manualCSV, setManualCSV] = useState('');

  const [masterPassword, setMasterPassword] = useState('');
  const [fetching, setFetching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!existingId) return;
    (async () => {
      const s = await new IndexedDBModelServiceRepo().get(existingId);
      if (s) {
        setName(s.name);
        setBaseUrl(s.baseUrl);
        setProtocol(s.protocol);
        setEnabledIds(new Set(s.enabledModels));
      }
    })();
  }, [existingId]);

  const handleFetchCatalog = async () => {
    if (!baseUrl) {
      setError('请先填写 baseUrl');
      return;
    }
    if (!apiKey && !existingId) {
      setError('请先填写 API Key');
      return;
    }
    setError(null);
    setFetching(true);
    setCatalog(null);
    try {
      let keyForRequest = apiKey;
      if (!keyForRequest && existingId) {
        // Use the existing stored key (need vault unlocked)
        if (!vault.unlocked) {
          throw new Error('请先输入主密码以读取已存的 API Key');
        }
        keyForRequest = await vault.getApiKey(existingId);
      }
      const res = await fetch('/api/models/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, baseUrl, apiKey: keyForRequest }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = (await res.json()) as { models: ModelInfo[] };
      setCatalog(json.models);
      if (json.models.length === 0) {
        setError('endpoint 返回空模型列表，请手动输入模型 id');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '拉取失败');
      setCatalog([]);
    } finally {
      setFetching(false);
    }
  };

  const handleTest = async () => {
    if (!apiKey || !baseUrl) {
      setTestResult('请先填写 baseUrl 与 API Key');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, baseUrl, apiKey }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      setTestResult('✓ 连接成功');
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setTesting(false);
    }
  };

  const toggleModel = (id: string) => {
    setEnabledIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!name.trim() || !baseUrl.trim()) {
        throw new Error('名称与 baseUrl 必填');
      }

      // Merge manual entries (CSV) into enabledIds.
      const manualIds = manualCSV
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const enabledModels = Array.from(
        new Set([...enabledIds, ...manualIds]),
      );

      if (enabledModels.length === 0) {
        throw new Error('请至少启用一个模型（勾选列表或在自定义中填写）');
      }

      if (!vault.unlocked) {
        if (!masterPassword) {
          throw new Error('请输入主密码以加密 API Key');
        }
        vault.unlock(masterPassword);
      }

      let cipher = '';
      const repo = new IndexedDBModelServiceRepo();
      if (apiKey) {
        cipher = await vault.encryptForStorage(apiKey);
      } else if (existingId) {
        const cur = await repo.get(existingId);
        cipher = cur?.apiKeyCipher ?? '';
      } else {
        throw new Error('首次创建必须填写 API Key');
      }

      if (existingId) {
        await repo.update(existingId, {
          name,
          protocol,
          baseUrl,
          apiKeyCipher: cipher,
          enabledModels,
        });
      } else {
        const id = `svc-${crypto.randomUUID()}`;
        await repo.create({
          id,
          name,
          protocol,
          baseUrl,
          apiKeyCipher: cipher,
          enabled: true,
          enabledModels,
          createdAt: new Date(),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <GlassPanel
        className="w-[600px] p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h3 className="font-serif text-xl">
            {existingId ? '编辑模型服务' : '添加模型服务'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="名称" value={name} onChange={setName} />
          <Field
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            hint="如 https://api.openai.com/v1，末尾无斜杠"
          />

          <div>
            <div className="text-sm text-muted mb-1">协议</div>
            <select
              value={protocol}
              onChange={e => setProtocol(e.target.value as 'anthropic' | 'openai')}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="anthropic">Anthropic 原生</option>
              <option value="openai">OpenAI 兼容（覆盖大部分中转站）</option>
            </select>
          </div>

          <div>
            <div className="text-sm text-muted mb-1">
              API Key
              {existingId && <span className="ml-2 text-xs">（留空保持原值）</span>}
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-…"
                className="w-full bg-surface border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                aria-label={showKey ? '隐藏' : '显示'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {!vault.unlocked && (
            <Field
              label="主密码"
              value={masterPassword}
              onChange={setMasterPassword}
              type="password"
              hint="用于加密 API Key（首次会同时设置）"
            />
          )}

          {/* ---- Model discovery & checkboxes ---- */}
          <div className="border-t border-divider pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm text-foreground">启用模型</div>
                <div className="text-xs text-subtle">
                  从 endpoint 拉取列表勾选，或在下方手动添加
                </div>
              </div>
              <button
                onClick={handleFetchCatalog}
                disabled={fetching || !baseUrl}
                className="text-sm border border-border px-3 py-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={fetching ? 'animate-spin' : ''} />
                {fetching ? '拉取中…' : '拉取模型列表'}
              </button>
            </div>

            {catalog && catalog.length > 0 && (
              <div className="border border-border rounded-md max-h-48 overflow-y-auto">
                {catalog.map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-elevated cursor-pointer border-b border-divider last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={enabledIds.has(m.id)}
                      onChange={() => toggleModel(m.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground truncate font-mono text-xs">{m.id}</div>
                      {m.name !== m.id && (
                        <div className="text-subtle text-xs">{m.name}</div>
                      )}
                    </div>
                    {m.supportsWebSearch && (
                      <span
                        className="text-xs text-info shrink-0"
                        title="支持 Web Search"
                      >
                        🌐
                      </span>
                    )}
                    {m.pricing.input > 0 && (
                      <span
                        className="text-xs text-subtle shrink-0"
                        title="输入 / 输出（USD per 1M tokens）"
                      >
                        ${m.pricing.input}/${m.pricing.output}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            {catalog && catalog.length === 0 && (
              <div className="text-xs text-subtle flex items-center gap-1.5 mb-2">
                <AlertCircle size={12} /> endpoint 未返回列表 — 请手动添加
              </div>
            )}

            {/* Show already-enabled but not-in-catalog ids */}
            {Array.from(enabledIds).filter(id => !catalog?.some(m => m.id === id)).length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-subtle mb-1">已启用（自定义/原配置）</div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(enabledIds)
                    .filter(id => !catalog?.some(m => m.id === id))
                    .map(id => (
                      <span
                        key={id}
                        className="text-xs bg-surface border border-border rounded px-2 py-0.5 font-mono inline-flex items-center gap-1"
                      >
                        <CheckCircle2 size={10} className="text-success" />
                        {id}
                        <button
                          onClick={() => toggleModel(id)}
                          className="text-muted hover:text-danger"
                          aria-label="移除"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-3">
              <Field
                label="手动添加模型（逗号分隔，保存时合并到启用列表）"
                value={manualCSV}
                onChange={setManualCSV}
                hint="例：gpt-4o, my-custom-model-v2"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-divider">
            <button
              onClick={handleTest}
              disabled={testing}
              className="text-sm border border-border px-3 py-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-50"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && (
              <span
                className={`text-sm ${testResult.startsWith('✓') ? 'text-success' : 'text-danger'}`}
              >
                {testResult}
              </span>
            )}
          </div>

          {error && (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-accent text-white px-4 py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-sm text-muted mb-1">{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
      />
      {hint && <div className="text-xs text-subtle mt-1">{hint}</div>}
    </div>
  );
}
