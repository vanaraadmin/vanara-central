import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAccountingReceiptSelections,
  removeAccountingReceiptSelection,
  type PendingAccountingReceipt,
} from "../../src/services/accounting-receipt-selection.ts";

function receipt(id: string, fileName = `${id}.jpg`): PendingAccountingReceipt {
  return { id, dataUrl: "data:image/jpeg;base64,AQ==", fileName, contentType: "image/jpeg", byteSize: 1 };
}

test("successive receipt selections append instead of replacing earlier pages", () => {
  const first = appendAccountingReceiptSelections([], [receipt("first")]);
  const second = appendAccountingReceiptSelections(first, [receipt("second"), receipt("third")]);
  const third = appendAccountingReceiptSelections(second, [receipt("fourth"), receipt("fifth")]);
  assert.deepEqual(third.map((item) => item.id), ["first", "second", "third", "fourth", "fifth"]);
});

test("duplicate filenames remain distinct and one selected page can be removed", () => {
  const selected = appendAccountingReceiptSelections([], [receipt("first", "receipt.jpg"), receipt("second", "receipt.jpg")]);
  const remaining = removeAccountingReceiptSelection(selected, "first");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "second");
  assert.equal(remaining[0].fileName, "receipt.jpg");
});
