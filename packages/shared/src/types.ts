export type PropertyType = 'rental' | 'flip' | 'overhead';
export type LineKind = 'labor' | 'materials' | 'other';
export type ReceiptStatus = 'queued' | 'reading' | 'toReview' | 'saved' | 'failed';

/** Fields every synced document carries (design D4). */
export interface Meta {
  id: string;
  version: number;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

export interface Property extends Meta {
  name: string;
  type: PropertyType;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  purchaseDate: string;
  saleDate: string;
  inServiceDate: string;
  archivedAt: number | null;
}

export interface Vendor extends Meta {
  name: string;
  normalizedName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  /** Past category choices, per property type: { rental: { "Repairs & Maintenance": 3 } } */
  categoryCounts: Partial<Record<PropertyType, Record<string, number>>>;
}

/** One share of a line that goes to another property. Exactly one of the two amounts is set. */
export interface Split {
  propertyId: string;
  amountCents: number | null;
  /** Share in basis points of the line (5000 = 50%). */
  percentBp: number | null;
}

export interface Line {
  id: string;
  description: string;
  sku: string;
  qty: number | null;
  unitPriceCents: number | null;
  amountCents: number;
  /** true/false when the receipt marks it; null when it does not say. */
  taxed: boolean | null;
  kind: LineKind;
  /** Receipt-level delivery, fee or discount recorded as its own line. */
  isCharge: boolean;
  /** null means the receipt's property. */
  propertyId: string | null;
  category: string | null;
  splits: Split[];
  /** The reader's category suggestion for each kind of property; kept so changing the property can re-suggest. */
  suggest: { rental: string; flip: string; overhead: string; unclear: boolean } | null;
}

export interface Receipt extends Meta {
  ledgerYear: number;
  status: ReceiptStatus;
  source: 'scan' | 'manual';
  date: string;
  vendorId: string | null;
  vendorName: string;
  vendorAddress: string;
  vendorPhone: string;
  vendorEmail: string;
  vendorWebsite: string;
  invoiceNo: string;
  subtotalCents: number | null;
  taxCents: number;
  totalCents: number | null;
  taxState: string;
  taxStateConfirmed: boolean;
  /** Printed rate in hundredths of a basis point (8.875% = 88750); null when not printed. */
  taxRatePrinted: number | null;
  paymentMethod: '' | 'card' | 'cash' | 'check' | 'transfer' | 'other';
  paymentRef: string;
  propertyId: string | null;
  lines: Line[];
  /** field path -> plain-language reason it needs checking. */
  flags: Record<string, string>;
  needsAttention: boolean;
  notes: string;
  pageCount: number;
  failReason: string;
  /** Who is reading it and since when, so two phones do not both read one scan. */
  readingBy: string;
  readingAt: number;
  deletedAt: number | null;
}

export interface YearMeta extends Meta {
  year: number;
  status: 'open' | 'cleared';
  archivedAt: number | null;
  /** When a cleared year's hidden backup is permanently deleted. */
  purgeAt: number | null;
}

export interface AppSettings extends Meta {
  anthropicKey: string;
  monthlyCapCents: number;
  model: string;
  lastPropertyId: string | null;
}

export interface UsageMonth {
  id: string;
  costMicros: number;
  scans: number;
}
