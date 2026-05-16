/**
 * Generic glass-material container. Implements the "glass tools" half of
 * the spec's visual language (§7.1).
 *
 * P5 will refine this with the full token-driven backdrop-filter +
 * shimmer animations; in P2 we ship a solid base that's already correct
 * (semi-transparent + blur + glass tokens).
 */
'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import clsx from 'clsx';

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'danger';
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(function GlassPanel(
  { className, variant = 'default', children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={clsx(
        'rounded-2xl border',
        'backdrop-blur-xl backdrop-saturate-150',
        variant === 'default' && 'shadow-lg',
        variant === 'success' && 'shadow-lg ring-1 ring-success/30',
        variant === 'danger' && 'shadow-lg ring-1 ring-danger/30',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-glass-overlay)',
        borderColor: 'var(--color-glass-border)',
      }}
      {...rest}
    >
      {children}
    </div>
  );
});
