import type { Vendor } from './types.ts';

/** "THE HOME DEPOT #1234, Inc." -> "home depot" */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/\b(store|str|location|loc)\s*\d+\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|inc|incorporated|llc|l l c|corp|corporation|co|company|ltd)\b/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function phoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

export interface VendorCandidate {
  name: string;
  phone?: string;
  address?: string;
}

/** Same phone number, or same name once store numbers and "Inc/LLC" are ignored. */
export function findVendorMatch<V extends Pick<Vendor, 'id' | 'normalizedName' | 'phone'>>(
  candidate: VendorCandidate,
  vendors: V[],
): V | null {
  const phone = phoneDigits(candidate.phone ?? '');
  if (phone.length >= 10) {
    const byPhone = vendors.find((v) => phoneDigits(v.phone) === phone);
    if (byPhone) return byPhone;
  }
  const norm = normalizeVendorName(candidate.name);
  if (!norm) return null;
  return vendors.find((v) => v.normalizedName === norm) ?? null;
}

/** Fill in contact details the vendor is missing; never overwrite what is already there. */
export function fillMissingContact<V extends Pick<Vendor, 'address' | 'phone' | 'email' | 'website'>>(
  vendor: V,
  incoming: Partial<Pick<Vendor, 'address' | 'phone' | 'email' | 'website'>>,
): { changed: boolean; vendor: V } {
  const out = { ...vendor };
  let changed = false;
  for (const key of ['address', 'phone', 'email', 'website'] as const) {
    const value = incoming[key];
    if (!out[key] && value) {
      out[key] = value;
      changed = true;
    }
  }
  return { changed, vendor: out };
}
