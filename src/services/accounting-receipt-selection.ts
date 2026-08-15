export interface PendingAccountingReceipt {
  id: string;
  dataUrl: string;
  fileName: string;
  contentType: string;
  byteSize: number;
}

export function appendAccountingReceiptSelections(
  current: PendingAccountingReceipt[],
  additions: PendingAccountingReceipt[],
): PendingAccountingReceipt[] {
  return [...current, ...additions];
}

export function removeAccountingReceiptSelection(
  current: PendingAccountingReceipt[],
  id: string,
): PendingAccountingReceipt[] {
  return current.filter((receipt) => receipt.id !== id);
}
