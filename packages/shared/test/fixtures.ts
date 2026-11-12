import type { Line, Property, Receipt } from '../src/types.ts';

const meta = { version: 1, createdAt: 0, createdBy: 'a@x.com', updatedAt: 0, updatedBy: 'a@x.com' };

export function line(partial: Partial<Line> & { id: string; amountCents: number }): Line {
  return {
    description: '',
    sku: '',
    qty: null,
    unitPriceCents: null,
    taxed: null,
    kind: 'materials',
    isCharge: false,
    propertyId: null,
    category: null,
    splits: [],
    suggest: null,
    ...partial,
  };
}

export function receipt(partial: Partial<Receipt> & { id: string }): Receipt {
  return {
    ...meta,
    ledgerYear: 2026,
    status: 'saved',
    source: 'scan',
    date: '2026-03-03',
    vendorId: null,
    vendorName: 'Home Depot',
    vendorAddress: '',
    vendorPhone: '',
    vendorEmail: '',
    vendorWebsite: '',
    invoiceNo: '',
    subtotalCents: null,
    taxCents: 0,
    totalCents: null,
    taxState: 'NY',
    taxStateConfirmed: true,
    taxRatePrinted: null,
    paymentMethod: '',
    paymentRef: '',
    propertyId: 'oak',
    lines: [],
    flags: {},
    needsAttention: false,
    notes: '',
    pageCount: 1,
    failReason: '',
    readingBy: '',
    readingAt: 0,
    deletedAt: null,
    ...partial,
  };
}

export function property(id: string, name: string, type: Property['type']): Property {
  return {
    ...meta,
    id,
    name,
    type,
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
    purchaseDate: '',
    saleDate: '',
    inServiceDate: '',
    archivedAt: null,
  };
}
