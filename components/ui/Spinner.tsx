import { clsx } from 'clsx';

type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

export function Spinner({ size = 'md', className, label = 'Laden…' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={clsx('inline-block rounded-full border-brand-blue border-t-transparent animate-spin', sizeClasses[size], className)}
    />
  );
}
