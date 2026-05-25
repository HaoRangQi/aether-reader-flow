'use client';

/**
 * @fileoverview QuickUnlockDialog — P2-only bootstrap UX.
 *
 * The Settings page is the primary place to configure model services. This
 * dialog remains as a fast reader-side flow to:
 *   1. Set a master password
 *   2. Unlock an already configured model service after a page reload
 *   3. Bootstrap a default Anthropic service only when no services exist yet
 *
 * This dialog does all three in one place. It's invoked from the reader
 * page header when the user clicks "解锁 AI" (or automatically when an AI
 * call hits a locked vault).
 *
 * In P4 (T4.8 in plan) the dialog gets retired and replaced by the proper
 * onboarding flow on the settings page.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GlassPanel } from '@/components/shared/GlassPanel';
import { IndexedDBModelServiceRepo } from '@/adapters/storage/IndexedDBModelServiceRepo';
import { IndexedDBConfigRepo } from '@/adapters/storage/IndexedDBConfigRepo';
import { ConfigService } from '@/services/ConfigService';
import { getVault } from '@/lib/ai-service-client';
import type { ModelService, TaskRouting } from '@/types/domain';
import { X, Eye, EyeOff } from 'lucide-react';

const DEFAULT_SERVICE_ID = 'default-anthropic';
const TASK_UNLOCK_PRIORITY = ['chat', 'translate', 'explain', 'verify', 'summarize'] as const;
type InitStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  const [initStatus, setInitStatus] = useState<InitStatus>('idle');
  const submittingRef = useRef(false);

  const initializeService = useCallback(async () => {
    setInitStatus('loading');
    setError(null);
    try {
      const repo = new IndexedDBModelServiceRepo();
      const config = new ConfigService(new IndexedDBConfigRepo());
      const services = await repo.list();
      const routing = await config.getTaskRouting();
      const servicesById = new Map(services.map(service => [service.id, service]));
      const routedService = TASK_UNLOCK_PRIORITY
        .map(task => servicesById.get(routing[task].serviceId))
        .find(service => service?.apiKeyCipher);
      const fallbackService =
        services.find(service => service.enabled && service.apiKeyCipher) ??
        services.find(service => service.apiKeyCipher) ??
        null;
      const svc = routedService ?? fallbackService;
      setExistingService(svc);
      setInitStatus('ready');
      return svc;
    } catch (e) {
      setExistingService(null);
      setInitStatus('error');
      setError(`读取本地 AI 配置失败：${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPassword('');
    setApiKey('');
    setShowKey(false);
    setBusy(false);
    submittingRef.current = false;
    setExistingService(null);
    setInitStatus('loading');
    setError(null);
    (async () => {
      const svc = await initializeService();
      if (cancelled) return;
      // If vault already unlocked (sessionStorage restored), auto-close
      if (getVault().unlocked && svc) {
        setPassword('');
        setApiKey('');
        onUnlocked?.();
        onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initializeService, open, onClose, onUnlocked]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  const submit = async () => {
    if (submittingRef.current || initStatus !== 'ready') return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!password) throw new Error('请输入主密码');
      const vault = getVault();
      vault.unlock(password);

      const repo = new IndexedDBModelServiceRepo();
      const config = new ConfigService(new IndexedDBConfigRepo());

      if (existingService) {
        // Just unlocking; verify by reading the key for the configured service.
        await vault.getApiKey(existingService.id); // throws if wrong password
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

      setPassword('');
      setApiKey('');
      setShowKey(false);
      onUnlocked?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const isReady = initStatus === 'ready';
  const controlsDisabled = busy || !isReady;
  const isFirstSetup = isReady && !existingService;
  const description = !isReady
    ? '正在检查本地 AI 配置。'
    : isFirstSetup
      ? '设置主密码与 Anthropic API Key。密钥用 AES-GCM 加密后只存在你的浏览器，从不离开本机。'
      : `请输入主密码以解锁已保存的模型服务密钥：${existingService?.name ?? '已配置服务'}。`;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={() => {
        if (!busy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-unlock-title"
    >
      <GlassPanel
        className="w-[520px] p-6"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 id="quick-unlock-title" className="text-xl font-serif text-foreground">
              {!isReady ? '读取 AI 配置' : existingService ? '解锁 AI' : '配置 AI（首次）'}
            </h2>
            <p className="text-xs text-subtle mt-1">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-muted hover:text-foreground p-1 disabled:opacity-50"
            aria-label="关闭解锁弹窗"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor="quick-unlock-password" className="block text-xs text-subtle mb-1">
              主密码
            </label>
            <input
              id="quick-unlock-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={controlsDisabled}
              autoFocus
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            />
          </div>

          {isFirstSetup && (
            <div>
              <label htmlFor="quick-unlock-api-key" className="block text-xs text-subtle mb-1">
                Anthropic API Key
              </label>
              <div className="relative">
                <input
                  id="quick-unlock-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  disabled={controlsDisabled}
                  placeholder="sk-ant-..."
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 pr-10 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  disabled={controlsDisabled}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground disabled:opacity-50"
                  aria-label={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
              {error}
            </div>
          )}

          {initStatus === 'error' && (
            <button
              type="button"
              onClick={initializeService}
              className="w-full border border-border text-foreground py-2 rounded-md text-sm hover:bg-surface"
            >
              重试读取配置
            </button>
          )}

          <button
            type="submit"
            disabled={busy || !isReady}
            className="w-full bg-accent text-white py-2 rounded-md text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? '处理中…' : existingService ? '解锁' : '保存并解锁'}
          </button>
        </form>
      </GlassPanel>
    </div>
  );
}
