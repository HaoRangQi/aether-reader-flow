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

import { useEffect, useId, useRef, useState } from 'react';
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

const ERROR_TEXT_LIMIT = 200;

function redactSecret(value: string, secret: string) {
  if (!secret) return value;
  return value.split(secret).join('[redacted]');
}

function truncateErrorText(value: string) {
  const normalized = value.trim();
  if (normalized.length <= ERROR_TEXT_LIMIT) return normalized;
  return `${normalized.slice(0, ERROR_TEXT_LIMIT)}…`;
}

function getErrorField(value: unknown) {
  if (!value || typeof value !== 'object' || !('error' in value)) return null;
  const error = (value as { error: unknown }).error;
  if (typeof error === 'string') return error.trim() || null;
  return null;
}

function responseErrorMessage(status: number, text: string, secret: string) {
  try {
    const parsed = JSON.parse(text) as unknown;
    const apiError = getErrorField(parsed);
    if (apiError) {
      return `HTTP ${status}: ${redactSecret(apiError, secret)}`;
    }
  } catch {
    // Non-JSON responses fall through to the bounded text fallback.
  }

  const fallback = truncateErrorText(redactSecret(text, secret));
  return fallback ? `HTTP ${status}: ${fallback}` : `HTTP ${status}`;
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
  const titleId = useId();
  const fetchingRef = useRef(false);
  const testingRef = useRef(false);
  const savingRef = useRef(false);
  const serviceInputsDisabled = fetching || testing || saving;

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
    if (fetchingRef.current) return;
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedApiKey = apiKey.trim();
    if (!trimmedBaseUrl) {
      setError('请先填写 baseUrl');
      return;
    }
    if (!trimmedApiKey && !existingId) {
      setError('请先填写 API Key');
      return;
    }
    setError(null);
    fetchingRef.current = true;
    setFetching(true);
    try {
      let keyForRequest = trimmedApiKey;
      if (!keyForRequest && existingId) {
        // Use the existing stored key (need vault unlocked)
        if (!vault.unlocked) {
          if (!masterPassword) {
            throw new Error('请先输入主密码以读取已存的 API Key');
          }
          vault.unlock(masterPassword);
        }
        keyForRequest = await vault.getApiKey(existingId);
      }
      const res = await fetch('/api/models/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, baseUrl: trimmedBaseUrl, apiKey: keyForRequest }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(responseErrorMessage(res.status, text, keyForRequest));
      }
      const json = (await res.json()) as { models: ModelInfo[] };
      setCatalog(json.models);
      if (json.models.length === 0) {
        setError('endpoint 返回空模型列表，请在“手动添加模型”中输入模型 id 后保存。');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '拉取失败';
      setError(`拉取模型列表失败：${message}。已保留当前模型选择，可重试或手动添加模型。`);
      setCatalog(prev => prev ?? []);
    } finally {
      fetchingRef.current = false;
      setFetching(false);
    }
  };

  const handleTest = async () => {
    if (testingRef.current) return;
    const trimmedBaseUrl = baseUrl.trim();
    const trimmedApiKey = apiKey.trim();
    if (!trimmedBaseUrl) {
      setTestResult('请先填写 baseUrl');
      return;
    }
    if (!trimmedApiKey && !existingId) {
      setTestResult('请先填写 baseUrl 与 API Key');
      return;
    }
    testingRef.current = true;
    setTesting(true);
    setTestResult(null);
    try {
      let keyForRequest = trimmedApiKey;
      if (!keyForRequest && existingId) {
        if (!vault.unlocked) {
          if (!masterPassword) {
            throw new Error('请先输入主密码以读取已存的 API Key');
          }
          vault.unlock(masterPassword);
        }
        keyForRequest = await vault.getApiKey(existingId);
      }
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol, baseUrl: trimmedBaseUrl, apiKey: keyForRequest }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(responseErrorMessage(res.status, text, keyForRequest));
      }
      setTestResult('✓ 连接成功');
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      testingRef.current = false;
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
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const trimmedName = name.trim();
      const trimmedBaseUrl = baseUrl.trim();
      const trimmedApiKey = apiKey.trim();
      if (!trimmedName || !trimmedBaseUrl) {
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

      const needsApiKeyEncryption = Boolean(trimmedApiKey) || !existingId;
      if (needsApiKeyEncryption && !vault.unlocked) {
        if (!masterPassword) {
          throw new Error('请输入主密码以加密 API Key');
        }
        vault.unlock(masterPassword);
      }

      let cipher = '';
      const repo = new IndexedDBModelServiceRepo();
      if (trimmedApiKey) {
        cipher = await vault.encryptForStorage(trimmedApiKey);
      } else if (existingId) {
        const cur = await repo.get(existingId);
        cipher = cur?.apiKeyCipher ?? '';
      } else {
        throw new Error('首次创建必须填写 API Key');
      }

      if (existingId) {
        await repo.update(existingId, {
          name: trimmedName,
          protocol,
          baseUrl: trimmedBaseUrl,
          apiKeyCipher: cipher,
          enabledModels,
        });
      } else {
        const id = `svc-${crypto.randomUUID()}`;
        await repo.create({
          id,
          name: trimmedName,
          protocol,
          baseUrl: trimmedBaseUrl,
          apiKeyCipher: cipher,
          enabled: true,
          enabledModels,
          createdAt: new Date(),
        });
      }
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(redactSecret(message, apiKey.trim() || apiKey));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      // Only close on direct click on the backdrop itself (not bubbled from
      // children). Using mousedown + target check survives Safari's quirk
      // where text selection inside the panel can fire a click on the parent.
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <GlassPanel
        className="w-[600px] p-6 max-h-[90vh] overflow-y-auto"
        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <h3 id={titleId} className="font-serif text-xl">
            {existingId ? '编辑模型服务' : '添加模型服务'}
          </h3>
          <button
            onClick={onClose}
            type="button"
            className="text-muted hover:text-foreground p-1"
            aria-label="关闭模型服务表单"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <Field
            label="名称"
            value={name}
            onChange={setName}
            autoComplete="off"
            disabled={saving}
          />
          <Field
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            hint="如 https://api.openai.com/v1，末尾无斜杠"
            inputMode="url"
            autoComplete="url"
            disabled={serviceInputsDisabled}
          />

          <div>
            <label htmlFor="model-service-protocol" className="text-sm text-muted mb-1 block">
              协议
            </label>
            <select
              id="model-service-protocol"
              value={protocol}
              onChange={e => setProtocol(e.target.value as 'anthropic' | 'openai')}
              disabled={serviceInputsDisabled}
              aria-label="协议"
              aria-describedby="model-service-protocol-help"
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="anthropic">Anthropic 原生</option>
              <option value="openai">OpenAI 兼容（覆盖大部分中转站）</option>
            </select>
            <div id="model-service-protocol-help" className="text-xs text-subtle mt-1">
              选择 endpoint 使用的模型服务协议。
            </div>
          </div>

          <div>
            <label htmlFor="model-service-api-key" className="text-sm text-muted mb-1 block">
              API Key
              {existingId && <span className="ml-2 text-xs">（留空保持原值）</span>}
            </label>
            <div className="relative">
              <input
                id="model-service-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                disabled={serviceInputsDisabled}
                placeholder="sk-…"
                aria-label="API Key"
                aria-describedby="model-service-api-key-help"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full bg-surface border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                disabled={serviceInputsDisabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                aria-label={showKey ? '隐藏' : '显示'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div id="model-service-api-key-help" className="text-xs text-subtle mt-1">
              {existingId ? '留空会继续使用已保存的 API Key。' : '首次创建模型服务必须填写 API Key。'}
            </div>
          </div>

          {!vault.unlocked && (
            <Field
              label="主密码"
              value={masterPassword}
              onChange={setMasterPassword}
              type="password"
              hint="用于加密 API Key（首次会同时设置）"
              disabled={saving}
            />
          )}

          {/* ---- Model discovery & checkboxes ---- */}
          <div className="border-t border-divider pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div id="model-service-models-label" className="text-sm text-foreground">
                  启用模型
                </div>
                <div id="model-service-models-help" className="text-xs text-subtle">
                  从 endpoint 拉取列表勾选，或在下方手动添加
                </div>
              </div>
              <button
                onClick={handleFetchCatalog}
                type="button"
                disabled={fetching || testing || saving || !baseUrl}
                aria-busy={fetching}
                aria-describedby="model-service-models-help model-service-fetch-status"
                className="text-sm border border-border px-3 py-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={fetching ? 'animate-spin' : ''} />
                {fetching ? '拉取中…' : '拉取模型列表'}
              </button>
            </div>

            <div
              id="model-service-fetch-status"
              className="sr-only"
              role="status"
              aria-live="polite"
            >
              {fetching ? '正在拉取模型列表，请稍候。' : ''}
            </div>

            {catalog && catalog.length > 0 && (
              <div
                className="border border-border rounded-md max-h-48 overflow-y-auto"
                role="group"
                aria-labelledby="model-service-models-label"
                aria-describedby="model-service-models-help"
              >
                {catalog.map(m => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-elevated cursor-pointer border-b border-divider last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={enabledIds.has(m.id)}
                      disabled={saving}
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
              <div
                className="text-xs text-subtle flex items-center gap-1.5 mb-2"
                role="status"
                aria-live="polite"
              >
                <AlertCircle size={12} />
                没有可勾选的模型。请在“手动添加模型”中输入模型 id，保存时会合并到启用列表。
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
                          type="button"
                          disabled={saving}
                          className="text-muted hover:text-danger"
                          aria-label={`移除模型 ${id}`}
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
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-divider">
            <button
              onClick={handleTest}
              type="button"
              disabled={fetching || testing || saving}
              aria-busy={testing}
              aria-describedby="model-service-test-status"
              className="text-sm border border-border px-3 py-1.5 rounded-md hover:bg-surface-elevated disabled:opacity-50"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <span
              id="model-service-test-status"
              className={`text-sm ${testResult?.startsWith('✓') ? 'text-success' : testResult ? 'text-danger' : 'sr-only'}`}
              role={testResult?.startsWith('✗') ? 'alert' : 'status'}
              aria-live="polite"
            >
              {testing ? '正在测试连接，请稍候。' : testResult || ''}
            </span>
          </div>

          {error && (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              type="button"
              disabled={saving}
              className="text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              type="button"
              disabled={fetching || testing || saving}
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
  inputMode,
  autoComplete,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  inputMode?: 'text' | 'url' | 'email' | 'numeric';
  autoComplete?: string;
  disabled?: boolean;
}) {
  const fieldId = useId();
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div>
      <label htmlFor={fieldId} className="text-sm text-muted mb-1 block">
        {label}
      </label>
      <input
        id={fieldId}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-label={label}
        aria-describedby={hintId}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        // Stop the parent dialog's mousedown/click from stealing focus or
        // closing the dialog when the user clicks inside the input. This
        // also keeps Safari's clipboard handler attached to the input.
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
        onPaste={e => e.stopPropagation()}
        onCopy={e => e.stopPropagation()}
        onCut={e => e.stopPropagation()}
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
      />
      {hint && (
        <div id={hintId} className="text-xs text-subtle mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}
