import { clsx } from 'clsx';
import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-brand-text border border-gray-200',
  success: 'bg-brand-green/10 text-brand-green border border-brand-green/30',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  error: 'bg-brand-red/10 text-brand-red border border-brand-red/30',
  info: 'bg-brand-blue/10 text-brand-blue border border-brand-blue/30',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
