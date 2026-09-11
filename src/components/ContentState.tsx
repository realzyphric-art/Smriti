import { Button } from './Button';

export function ContentState({ title, detail, action, tone = 'soft' }: { title: string; detail: string; action?: { label: string; onClick: () => void }; tone?: 'soft' | 'amber' }) {
  return <div className={`banner banner--${tone} stack-sm text-center`} role="status"><strong>{title}</strong><span>{detail}</span>{action && <Button variant="secondary" block onClick={action.onClick}>{action.label}</Button>}</div>;
}
