import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn/ui-style button. The default variant uses the purple -> royal-blue
// brand gradient; white text keeps >= 5.2:1 contrast across the whole gradient.
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-150',
    'outline-none focus-visible:ring-3 focus-visible:ring-ring/45',
    'disabled:pointer-events-none disabled:opacity-60',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          'bg-brand-gradient text-primary-foreground shadow-md shadow-violet-600/25 hover:bg-brand-gradient-hover hover:shadow-lg hover:shadow-violet-600/30 active:translate-y-px',
        outline: 'border border-gray-300 bg-card text-foreground shadow-xs hover:border-gray-400 hover:bg-gray-50',
        secondary: 'bg-primary-soft text-primary-soft-foreground hover:bg-violet-200/70',
        ghost: 'font-medium text-muted-foreground hover:bg-gray-100 hover:text-foreground',
        destructive: 'bg-destructive text-white shadow-xs hover:bg-red-700',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-md px-3 text-[13px]',
        lg: 'h-12 px-5 text-[15px]',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export function Button({ className, variant, size, type = 'button', ...props }) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
