import { Sheet } from './Sheet';
import { Button } from './Button';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmSheet({ open, title, message, confirmLabel = 'Continue', danger, onClose, onConfirm }: ConfirmSheetProps) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="stack">
        <p className="muted">{message}</p>
        <div className="sheet-actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Sheet>
  );
}
