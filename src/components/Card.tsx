import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'tint' | 'flat';
  padLg?: boolean;
  children: ReactNode;
}

export function Card({
  variant = 'default',
  padLg,
  children,
  className = '',
  ...rest
}: CardProps) {
  const classes = [
    'card',
    variant === 'tint' ? 'card--tint' : '',
    variant === 'flat' ? 'card--flat' : '',
    padLg ? 'card--pad-lg' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}
