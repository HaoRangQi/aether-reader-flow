'use client';

import { useEffect, useState } from 'react';
import { checkStorageHealth, requestPersistence } from '@/lib/storage-debug';
import { useT } from '@/components/shared/I18nProvider';

interface StorageHealth {
  available: boolean;
  persistent: boolean;
  quota: { usage: number; quota: number } | null;
  databases: string[];
  error?: string;
}

export function StorageDebug() {
  const t = useT();
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    checkStorageHealth().then(setHealth);
  }, []);

  const handleRequestPersistence = async () => {
    setRequesting(true);
    const granted = await requestPersistence();
    if (granted) {
      const updated = await checkStorageHealth();
      setHealth(updated);
    }
    setRequesting(false);
  };

  if (!health) return null;

  const usageMB = health.quota ? (health.quota.usage / 1024 / 1024).toFixed(2) : '0';
  const quotaMB = health.quota ? (health.quota.quota / 1024 / 1024).toFixed(2) : '0';

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">存储状态</h1>
      <p className="text-sm text-muted mb-8">
        检查 IndexedDB 健康状态和持久化配置
      </p>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground w-32">IndexedDB 可用</span>
          <span className={`text-sm ${health.available ? 'text-success' : 'text-danger'}`}>
            {health.available ? '✓ 是' : '✗ 否'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-foreground w-32">持久化存储</span>
          <span className={`text-sm ${health.persistent ? 'text-success' : 'text-warning'}`}>
            {health.persistent ? '✓ 已启用' : '✗ 未启用'}
          </span>
          {!health.persistent && (
            <button
              onClick={handleRequestPersistence}
              disabled={requesting}
              className="ml-2 text-xs border border-border px-2 py-1 rounded-md hover:bg-surface-elevated disabled:opacity-50"
            >
              {requesting ? '请求中…' : '请求持久化'}
            </button>
          )}
        </div>

        {health.quota && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground w-32">存储配额</span>
            <span className="text-sm text-muted">
              {usageMB} MB / {quotaMB} MB
            </span>
          </div>
        )}

        <div className="flex items-start gap-3">
          <span className="text-sm text-foreground w-32">数据库列表</span>
          <div className="flex-1">
            {health.databases.length > 0 ? (
              <div className="space-y-1">
                {health.databases.map(db => (
                  <div key={db} className="text-sm text-muted font-mono">
                    {db}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-subtle">无数据库</span>
            )}
          </div>
        </div>

        {health.error && (
          <div className="text-sm text-danger whitespace-pre-wrap" role="alert">
            错误: {health.error}
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-surface-elevated rounded-md border border-border">
        <h3 className="text-sm font-medium text-foreground mb-2">故障排查</h3>
        <ul className="text-xs text-muted space-y-1 list-disc list-inside">
          <li>如果 IndexedDB 不可用，检查浏览器是否禁用了本地存储</li>
          <li>如果持久化未启用，数据可能在浏览器清理时被删除</li>
          <li>隐私模式/无痕模式下数据不会持久化</li>
          <li>某些浏览器扩展可能阻止 IndexedDB</li>
          <li>检查浏览器开发者工具 → Application → IndexedDB</li>
        </ul>
      </div>
    </div>
  );
}
