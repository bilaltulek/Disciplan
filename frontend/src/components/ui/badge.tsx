import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 backdrop-blur-md', {
  variants: { variant: { default: 'border-transparent bg-primary/90 text-primary-foreground hover:bg-primary', secondary: 'border-white/45 bg-white/55 text-secondary-foreground hover:bg-white/70', destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80', outline: 'border-white/45 bg-white/45 text-foreground' } },
  defaultVariants: { variant: 'default' },
});

interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
function Badge({ className, variant, ...props }: BadgeProps) { return <div className={cn(badgeVariants({ variant }), className)} {...props} />; }
export { Badge, badgeVariants };
