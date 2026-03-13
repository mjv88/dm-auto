import { clsx } from 'clsx';

type StatusVariant = 'active' | 'switching' | 'error';

interface StatusBadgeProps {
  deptName: string;
  variant?: StatusVariant;
}

const variantClasses: Record<StatusVariant, string> = {
  active: 'bg-brand-green/10 text-brand-green border border-brand-green/30',
  switching: 'bg-amber-50 text-amber-700 border border-amber-200',
  error: 'bg-brand-red/10 text-brand-red border border-brand-red/30',
};

const dotClasses: Record<StatusVariant, string> = {
  active: 'bg-brand-green',
  switching: 'bg-amber-500',
  error: 'bg-brand-red',
};

export default function StatusBadge({ deptName, variant = 'active' }: StatusBadgeProps) {
  return (
    <span
      role="status"
      aria-label={`Aktuell in: ${deptName}`}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium',
        variantClasses[variant]
      )}
    >
      <span
        aria-hidden="true"
        className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotClasses[variant])}
      />
      <span>Aktuell in: {deptName}</span>
    </span>
  );
}
