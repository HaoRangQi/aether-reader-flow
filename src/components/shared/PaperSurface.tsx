'use client';

/**
 * PaperSurface — the "paper" half of the visual language.
 *
 * Used for content areas where the user reads (chapter body, library
 * cards). Stays solid + low-contrast — no glass / blur, no animations.
 * The point is calmness during long-form reading.
 */
import { forwardRef, type HTMLAttributes } from 'react';
import clsx from 'clsx';

export const PaperSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PaperSurface({ className, children, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={clsx('rounded-lg', className)}
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text)',
        }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
