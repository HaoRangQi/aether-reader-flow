'use client';

import { useEffect, useRef, useState } from 'react';
import { checkStorageHealth, requestPersistence } from '@/lib/storage-debug';
import {
  exportLocalBackupBlob,
  prepareLocalBackupText,
  restorePreparedLocalBackup,
  type PreparedLocalBackup,
} from '@/lib/local-backup';

interface StorageHealth {
  available: boolean;
  persistent: boolean;
  quota: { usage: number; quota: number } | null;
  databases: string[];
  error?: string;
}

type PersistResult = 'granted' | 'denied' | 'unsupported' | null;
type BackupOperation = 'export' | 'prepare' | 'restore' | null;

export function StorageDebug() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [backupOperation, setBackupOperation] = useState<BackupOperation>(null);
  const backupOperationRef = useRef<Exclude<BackupOperation, null> | null>(null);
  const [preparedBackup, setPreparedBackup] = useState<PreparedLocalBackup | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [persistResult, setPersistResult] = useState<PersistResult>(null);
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    checkStorageHealth().then(setHealth);
  }, []);

  const handleRequestPersistence = async () => {
    setRequesting(true);
    setPersistResult(null);
    setPersistError(null);
    try {
      if (!navigator.storage?.persist) {
        setPersistResult('unsupported');
        return;
      }
      const granted = await requestPersistence();
      setPersistResult(granted ? 'granted' : 'denied');
      const updated = await checkStorageHealth();
      setHealth(updated);
    } catch (error) {
      setPersistError(error instanceof Error ? error.message : String(error));
    } finally {
      setRequesting(false);
    }
  };

  const startBackupOperation = (operation: Exclude<BackupOperation, null>) => {
    if (backupOperationRef.current) return false;
    backupOperationRef.current = operation;
    setBackupOperation(operation);
    return true;
  };

  const finishBackupOperation = (operation: Exclude<BackupOperation, null>) => {
    if (backupOperationRef.current !== operation) return;
    backupOperationRef.current = null;
    setBackupOperation(null);
  };

  const handleExportBackup = async () => {
    if (!startBackupOperation('export')) return;
    setBackupError(null);
    try {
      const blob = await exportLocalBackupBlob();
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(`aether-reader-flow-backup-${date}.json`, blob);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      finishBackupOperation('export');
    }
  };

  const handleBackupFile = async (file: File | null) => {
    if (!file) return;
    if (!startBackupOperation('prepare')) return;
    setBackupError(null);
    setRestoreMessage(null);
    setPreparedBackup(null);
    try {
      const prepared = await prepareLocalBackupText(await file.text());
      setPreparedBackup(prepared);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      finishBackupOperation('prepare');
    }
  };

  const handleRestoreBackup = async () => {
    if (!preparedBackup) return;
    if (!startBackupOperation('restore')) return;
    setBackupError(null);
    setRestoreMessage(null);
    try {
      await restorePreparedLocalBackup(preparedBackup);
      setPreparedBackup(null);
      setRestoreMessage('恢复完成，页面即将刷新以载入备份数据。');
      window.setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      finishBackupOperation('restore');
    }
  };

  if (!health) return null;

  const isBackupBusy = backupOperation !== null;
  const isExporting = backupOperation === 'export';
  const isPreparingBackup = backupOperation === 'prepare';
  const isRestoringBackup = backupOperation === 'restore';
  const usageMB = health.quota ? (health.quota.usage / 1024 / 1024).toFixed(2) : '0';
  const quotaMB = health.quota ? (health.quota.quota / 1024 / 1024).toFixed(2) : '0';

  return (
    <div>
      <h1 className="font-serif text-2xl mb-2">存储状态</h1>
      <p className="text-sm text-muted mb-8">
        检查 IndexedDB 健康状态和持久化配置
      </p>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface-elevated p-4" aria-busy={isBackupBusy}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">本地数据备份</div>
              <div className="mt-1 text-xs text-muted">
                导出书籍、章节、批注、时间轴、阅读进度、设置和加密后的模型服务配置。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                disabled={isBackupBusy || !health.available}
                className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition hover:bg-surface disabled:opacity-50"
              >
                {isExporting ? '导出中…' : '导出 JSON 备份'}
              </button>
              <label
                aria-disabled={isBackupBusy || !health.available}
                className={`rounded-md border border-border px-3 py-2 text-sm text-foreground transition hover:bg-surface ${
                  isBackupBusy || !health.available ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                }`}
              >
                {isPreparingBackup ? '读取中…' : '选择备份文件'}
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={isBackupBusy || !health.available}
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0] ?? null;
                    void handleBackupFile(file);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          {preparedBackup && (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
              <div className="font-medium text-foreground">备份预览</div>
              <div className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
                <div>导出时间：{preparedBackup.preview.exportedAt.toLocaleString('zh-CN')}</div>
                <div>书籍：{preparedBackup.preview.books} 本</div>
                <div>批注：{preparedBackup.preview.annotations} 条</div>
                <div>时间轴：{preparedBackup.preview.timelineEntries} 条</div>
                <div>模型服务：{preparedBackup.preview.modelServices} 个</div>
              </div>
              <div className="mt-3 text-xs text-warning">
                恢复会先清空当前浏览器中的所有本地数据，再写入备份内容。此操作无法撤销。模型服务配置会一并恢复，但 API Key 仍为加密密文；恢复后需要使用原主密码解锁。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRestoreBackup}
                  disabled={isBackupBusy}
                  className="rounded-md bg-danger px-3 py-2 text-xs text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {isRestoringBackup ? '恢复中…' : '我已备份当前数据，覆盖恢复'}
                </button>
                <button
                  type="button"
                  onClick={() => setPreparedBackup(null)}
                  disabled={isBackupBusy}
                  className="rounded-md border border-border px-3 py-2 text-xs text-foreground transition hover:bg-surface disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {backupError && (
            <div className="mt-3 text-sm text-danger" role="alert">
              {backupError}
            </div>
          )}
          {restoreMessage && (
            <div className="mt-3 text-sm text-success" role="status">
              {restoreMessage}
            </div>
          )}
        </div>

        <Row label="IndexedDB 可用">
          <span className={health.available ? 'text-success' : 'text-danger'}>
            {health.available ? '✓ 是' : '✗ 否'}
          </span>
        </Row>

        <Row label="持久化存储">
          <span className={health.persistent ? 'text-success' : 'text-warning'}>
            {health.persistent ? '✓ 已启用' : '✗ 未启用'}
          </span>
          {!health.persistent && (
            <button
              onClick={handleRequestPersistence}
              disabled={requesting}
              className="ml-3 text-xs border border-border px-2.5 py-1 rounded-md hover:bg-surface-elevated disabled:opacity-50 transition"
            >
              {requesting ? '请求中…' : '请求持久化'}
            </button>
          )}
        </Row>

        {/* Result feedback */}
        {persistResult && (
          <div className={`ml-[8.5rem] text-sm rounded-lg p-3 border ${
            persistResult === 'granted'
              ? 'text-success border-success/20 bg-success/5'
              : 'text-warning border-warning/20 bg-warning/5'
          }`}>
            {persistResult === 'granted' && '✓ 已授权持久化存储，数据不会被浏览器自动清理。'}
            {persistResult === 'denied' && (
              <div className="space-y-2">
                <div>✗ 浏览器拒绝了持久化请求。</div>
                <div className="text-xs text-muted space-y-1">
                  <div className="font-medium text-foreground">如何手动授权：</div>
                  <div>· <strong>Chrome / Edge</strong>：地址栏左侧点击锁图标 → 网站设置 → 存储 → 允许；或将本站添加到书签，再重试。</div>
                  <div>· <strong>Firefox</strong>：地址栏左侧点击盾牌图标 → 允许存储；或在 about:permissions 里找到本站手动授权。</div>
                  <div>· <strong>Safari</strong>：不支持此 API，数据在 7 天不访问后可能被清理，建议定期导出思考文档备份。</div>
                  <div>· 隐私模式下无法授权，请切换到普通窗口。</div>
                </div>
              </div>
            )}
            {persistResult === 'unsupported' && '✗ 当前浏览器不支持 Storage Persistence API。'}
          </div>
        )}

        {persistError && (
          <div className="ml-[8.5rem] text-sm text-danger" role="alert">
            持久化请求失败：{persistError}
          </div>
        )}

        {health.quota && (
          <Row label="存储配额">
            <span className="text-muted">
              {usageMB} MB / {quotaMB} MB
            </span>
          </Row>
        )}

        <div className="flex items-start gap-3">
          <span className="text-sm text-foreground w-32 shrink-0">数据库列表</span>
          <div className="flex-1">
            {health.databases.length > 0 ? (
              <div className="space-y-1">
                {health.databases.map(db => (
                  <div key={db} className="text-sm text-muted font-mono">{db}</div>
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

      <div className="mt-8 p-4 bg-surface-elevated rounded-lg border border-border">
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

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-foreground w-32 shrink-0">{label}</span>
      <div className="flex items-center gap-2 text-sm">{children}</div>
    </div>
  );
}
