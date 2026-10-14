import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const styles = cva('inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform duration-200 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-40 disabled:pointer-events-none', { variants: { variant: { default: 'bg-accent text-black hover:bg-[#e1ff75]', secondary: 'border border-border bg-raised text-white hover:bg-white/10', ghost: 'text-muted hover:text-white hover:bg-white/5' } }, defaultVariants: { variant: 'default' } });
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof styles> & { asChild?: boolean };
export function Button({ className, variant, asChild = false, ...props }: Props) { const Comp = asChild ? Slot : 'button'; return <Comp className={cn(styles({ variant, className }))} {...props} />; }
