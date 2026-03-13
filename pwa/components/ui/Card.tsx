import { HTMLAttributes } from 'react';
import { clsx } from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

export function Card({ className, noPadding = false, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-card shadow-card',
        !noPadding && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
