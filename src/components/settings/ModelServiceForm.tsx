'use client';

/**
 * @fileoverview ModelServiceForm — create / edit dialog for a ModelService.
 *
 * Includes a "test connection" button that POSTs to /api/models/test.
 * Master password is required to encrypt the API key; if the vault is
 * locked we prompt for it inline.
 */

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { getVault } from '@/lib/ai-service-client';
import type { ModelService } from '@/types/domain';
import { X, Eye, EyeOff } from 'lucide-react';

type Preset = Omit<ModelService, 'id' | 'createdAt' | 'apiKeyCipher'>;

interface Props {
  existingId?: string;
  preset?: Preset;
  onClose: () => void;
}

export function ModelServiceForm({ existingId, preset, onClose }: Props) {
  const repo = new IndexedDBModelServiceRepo();
  const vault = getVault();

  const [name, setName] = useState(preset?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(preset?.baseUrl ?? '');
  const [protocol, setProtocol] = useState<'anthropic' | 'openai'>(
    preset?.protocol ?? 'openai',
  );
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [enabledModelsCSV, setEnabledModelsCSV] = useState(
    preset?.enabledModels.join(', ') ?? '',
  );
  const [masterPassword, setMasterPassword] = useState('');
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
        setEnabledModelsCSV(s.enabledModels.join(', '));
      }
    })();
  }, [existingId]);

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
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      setTestResult('✓ 连接成功');
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!name.trim() || !baseUrl.trim()) {
        throw new Error('名称与 baseUrl 必填');
      }

      if (!vault.unlocked) {
        if (!masterPassword) {
          throw new Error('请输入主密码以加密 API Key');
        }
        vault.unlock(masterPassword);
      }

      let cipher = '';
      if (apiKey) {
        cipher = await vault.encryptForStorage(apiKey);
      } else if (existingId) {
        const cur = await repo.get(existingId);
        cipher = cur?.apiKeyCipher ?? '';
      } else {
        throw new Error('首次创建必须填写 API Key');
      }

      const enabledModels = enabledModelsCSV
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

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
        className="w-[560px] p-6 max-h-[90vh] overflow-y-auto"
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

          <Field
            label="启用模型（逗号分隔）"
            value={enabledModelsCSV}
            onChange={setEnabledModelsCSV}
            hint="例：claude-sonnet-4-6, claude-haiku-4-5"
          />

          {!vault.unlocked && (
            <Field
              label="主密码"
              value={masterPassword}
              onChange={setMasterPassword}
              type="password"
              hint="用于加密 API Key（首次会同时设置）"
            />
          )}

          <div className="flex items-center gap-3 pt-2">
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
