'use client';

import { useEffect, useRef } from 'react';
import { SettingsLayout } from '@/components/settings/SettingsLayout';
import { ModelServiceConfig } from '@/components/settings/ModelServiceConfig';
import { TaskRoutingConfig } from '@/components/settings/TaskRoutingConfig';
import { BudgetConfig } from '@/components/settings/BudgetConfig';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { FontPreferences } from '@/components/settings/FontPreferences';
import { LanguagePicker } from '@/components/settings/LanguagePicker';
import { StorageDebug } from '@/components/settings/StorageDebug';
import { SelectionAppearance } from '@/components/settings/SelectionAppearance';
import { PromptConfig } from '@/components/settings/PromptConfig';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ReaderSettingsDrawer({ open, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col shadow-2xl sm:w-[780px] sm:max-w-[95vw]"
        style={{ backgroundColor: 'var(--color-background)' }}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-elevated transition"
          aria-label="关闭设置"
        >
          <X size={16} />
        </button>

        {/* Reuse the full settings layout */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <SettingsLayout
            showBackLink={false}
            sections={{
              models: <ModelServiceConfig />,
              routing: <TaskRoutingConfig />,
              prompts: <PromptConfig />,
              budget: <BudgetConfig />,
              theme: <ThemePicker />,
              font: <FontPreferences />,
              language: <LanguagePicker />,
              selection: <SelectionAppearance />,
              storage: <StorageDebug />,
            }}
          />
        </div>
      </div>
    </>
  );
}
