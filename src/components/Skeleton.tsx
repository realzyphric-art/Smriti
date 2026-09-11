import type { CSSProperties } from 'react';

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="card skeleton-card" aria-label="Loading content"><Skeleton style={{ width: '42%', height: '1.35rem' }} />{Array.from({ length: rows }).map((_, index) => <Skeleton key={index} style={{ width: `${88 - index * 14}%`, height: '1rem' }} />)}</div>;
}

export function ListSkeleton({ count = 3 }: { count?: number }) { return <div className="stack-sm" aria-label="Loading content">{Array.from({ length: count }).map((_, index) => <CardSkeleton key={index} rows={2} />)}</div>; }
