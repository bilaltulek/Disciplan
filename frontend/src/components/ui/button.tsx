import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'app-button inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: { default: 'app-button-primary glass-accent hover:brightness-110', destructive: 'app-button-destructive bg-destructive text-destructive-foreground shadow-[0_14px_28px_-14px_rgba(220,38,38,0.8)] hover:bg-destructive/90', outline: 'app-button-outline glass-chip text-foreground hover:bg-white/65', secondary: 'app-button-secondary bg-secondary/75 text-secondary-foreground backdrop-blur-md hover:bg-secondary', ghost: 'app-button-ghost text-muted-foreground hover:bg-white/50 hover:text-foreground', link: 'app-button-link text-primary underline-offset-4 hover:underline' },
      size: { default: 'h-10 px-4 py-2', sm: 'h-9 rounded-lg px-3', lg: 'h-11 rounded-xl px-8 text-base', icon: 'h-10 w-10' },
    }, defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
