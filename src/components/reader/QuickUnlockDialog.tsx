'use client';

/**
 * @fileoverview QuickUnlockDialog — P2-only bootstrap UX.
 *
 * Until P4 ships the proper Settings page (ModelServiceConfig,
 * TaskRoutingConfig, ...), users still need a way to:
 *   1. Set a master password
 *   2. Save an Anthropic API key
 *   3. Have a default ModelService + TaskRouting written so AIService works
 *
 * This dialog does all three in one place. It's invoked from the reader
 * page header when the user clicks "解锁 AI" (or automatically when an AI
 * call hits a locked vault).
 *
 * In P4 (T4.8 in plan) the dialog gets retired and replaced by the proper
 * onboarding flow on the settings page.
 */

import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { ConfigService } from '@/services/ConfigService';
import { getVault } from '@/lib/ai-service-client';
import type { ModelService, TaskRouting } from '@/types/domain';
import { X, Eye, EyeOff } from 'lucide-react';

const DEFAULT_SERVICE_ID = 'default-anthropic';

interface Props {
  open: boolean;
  onClose: () => void;
  onUnlocked?: () => void;
}

export function QuickUnlockDialog({ open, onClose, onUnlocked }: Props) {
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingService, setExistingService] = useState<ModelService | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setPassword('');
    setApiKey('');
    (async () => {
      const svc = await new IndexedDBModelServiceRepo().get(DEFAULT_SERVICE_ID);
      setExistingService(svc);
    })();
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!password) throw new Error('请输入主密码');
      const vault = getVault();
      vault.unlock(password);

      const repo = new IndexedDBModelServiceRepo();
      const config = new ConfigService(new IndexedDBConfigRepo());

      if (existingService) {
        // Just unlocking; verify by reading a key
        if (apiKey) {
          // User wants to update the key
          const cipher = await vault.encryptForStorage(apiKey);
          await repo.update(DEFAULT_SERVICE_ID, { apiKeyCipher: cipher });
        } else {
          await vault.getApiKey(DEFAULT_SERVICE_ID); // throws if wrong password
        }
      } else {
        // First-time setup: also need a key
        if (!apiKey) throw new Error('首次设置必须填写 API Key');
        const cipher = await vault.encryptForStorage(apiKey);
        const svc: ModelService = {
          id: DEFAULT_SERVICE_ID,
          name: 'Anthropic Claude',
          protocol: 'anthropic',
          baseUrl: 'https://api.anthropic.com',
          apiKeyCipher: cipher,
          enabled: true,
          enabledModels: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
          createdAt: new Date(),
        };
        await repo.create(svc);

        // Wire the default routing to point at this service
        const routing: TaskRouting = {
          translate: { serviceId: DEFAULT_SERVICE_ID, modelId: 'claude-haiku-4-5' },
          explain: { serviceId: DEFAULT_SERVICE_ID, modelId: 'claude-sonnet-4-6' },
          verify: { serviceId: DEFAULT_SERVICE_ID, modelId: 'claude-sonnet-4-6' },
          summarize: { serviceId: DEFAULT_SERVICE_ID, modelId: 'claude-sonnet-4-6' },
          chat: { serviceId: DEFAULT_SERVICE_ID, modelId: 'claude-sonnet-4-6' },
        };
        await config.setTaskRouting(routing);
      }

      onUnlocked?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <GlassPanel
        className="w-[520px] p-6"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-serif text-foreground">
              {existingService ? '解锁 AI' : '配置 AI（首次）'}
            </h2>
            <p className="text-xs text-subtle mt-1">
              {existingService === null
                ? '设置主密码与 Anthropic API Key。密钥用 AES-GCM 加密后只存在你的浏览器，从不离开本机。'
                : '请输入你设置过的主密码。'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground p-1">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-subtle mb-1">主密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-subtle mb-1">
              Anthropic API Key
              {existingService && (
                <span className="ml-2">（留空则保持现有密钥）</span>
              )}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-surface border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
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

          {error && <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>}

          <button
            onClick={submit}
            disabled={busy}
            className="w-full bg-accent text-white py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? '处理中…' : existingService ? '解锁' : '保存并解锁'}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
