import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const styles = cva('btn', { variants: { variant: { default: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost' } }, defaultVariants: { variant: 'default' } });
type Props = React.ComponentPropsWithRef<'button'> & VariantProps<typeof styles> & { asChild?: boolean; unstyled?: boolean };
export function Button({ className, variant, asChild = false, unstyled = false, ...props }: Props) { const Comp = asChild ? Slot : 'button'; return <Comp className={unstyled ? className : cn(styles({ variant, className }))} {...props} />; }
