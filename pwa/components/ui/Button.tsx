'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { ButtonHTMLAttributes, forwardRef } from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium rounded-button transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary: 'bg-brand-blue text-white hover:bg-[#106EBE]',
        ghost: 'bg-transparent border border-brand-blue text-brand-blue hover:bg-brand-blue/10',
        destructive: 'bg-brand-red text-white hover:bg-[#C43501]',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'min-h-[48px] px-4 text-base',
        lg: 'min-h-[56px] px-6 text-lg',
        full: 'min-h-[48px] w-full px-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };
