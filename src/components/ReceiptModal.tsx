import { useSettings } from '../lib/hooks';
import type { Order } from '../lib/types';
import ReceiptView, { receiptText } from './ReceiptView';
import { Button, Modal } from './ui';

export async function shareReceipt(text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      /* cancelled */
    }
  }
  await navigator.clipboard?.writeText(text);
  alert('Receipt copied to clipboard');
}

export default function ReceiptModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const settings = useSettings();
  return (
    <Modal
      open
      onClose={onClose}
      title="Sale complete 🎉"
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()}>
            🖨️ Print
          </Button>
          <Button variant="secondary" onClick={() => shareReceipt(receiptText(order, settings))}>
            📤 Share
          </Button>
          <Button className="flex-1" onClick={onClose}>
            New sale
          </Button>
        </>
      }
    >
      <div className="rounded-xl bg-white p-2 ring-1 ring-gray-200">
        <ReceiptView order={order} />
      </div>
    </Modal>
  );
}
