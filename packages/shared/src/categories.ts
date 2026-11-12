import type { PropertyType } from './types.ts';

export type TaxTreatment =
  | 'Deduct this year'
  | 'Capitalize & depreciate'
  | 'Add to property cost'
  | 'Reduces sale proceeds';

/** Must match the expense-categories spec and the tax-categories skill exactly. */
export const CATEGORIES: Record<PropertyType, string[]> = {
  rental: [
    'Repairs & Maintenance',
    'Capital Improvement',
    'Supplies',
    'Cleaning & Maintenance Services',
    'Utilities',
    'Insurance',
    'Property Taxes',
    'Mortgage Interest',
    'HOA / Condo Fees',
    'Legal & Professional',
    'Advertising',
    'Travel & Auto',
    'Other Rental Expense',
  ],
  flip: [
    'Acquisition & Closing Costs',
    'Renovation',
    'Holding Costs – Utilities',
    'Holding Costs – Insurance',
    'Holding Costs – Property Taxes',
    'Holding Costs – Interest',
    'Selling Costs',
    'Other Flip Cost',
  ],
  overhead: [
    'Office & Supplies',
    'Software & Subscriptions',
    'Legal & Professional',
    'Bank & Merchant Fees',
    'Insurance',
    'Travel & Auto',
    'Meals',
    'Education',
    'Licenses & Fees',
    'Other Business Expense',
  ],
};

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  rental: 'Rental',
  flip: 'Flip',
  overhead: 'Overhead',
};

export function isValidCategory(type: PropertyType, category: string | null): boolean {
  return category !== null && CATEGORIES[type].includes(category);
}

export function taxTreatment(type: PropertyType, category: string): TaxTreatment {
  if (type === 'flip') return category === 'Selling Costs' ? 'Reduces sale proceeds' : 'Add to property cost';
  if (type === 'rental' && category === 'Capital Improvement') return 'Capitalize & depreciate';
  return 'Deduct this year';
}

export const REPAIR_VS_IMPROVEMENT_HINT =
  'Repair: keeps the property in normal working condition (fix a leak, patch drywall). ' +
  'Improvement: makes it better, restores it after major wear (a whole new roof), or adapts it to a new use.';

export const NOT_TAX_ADVICE =
  'Categories and tax treatment labels organize records for your accountant and are not tax advice.';

/** Most-used past category for this vendor and property type, once it has been chosen 3 times. */
export function categoryFromMemory(
  counts: Partial<Record<PropertyType, Record<string, number>>> | undefined,
  type: PropertyType,
): string | null {
  const byCat = counts?.[type];
  if (!byCat) return null;
  let best: string | null = null;
  let bestN = 0;
  let total = 0;
  for (const [cat, n] of Object.entries(byCat)) {
    total += n;
    if (n > bestN) {
      best = cat;
      bestN = n;
    }
  }
  if (best && bestN >= 3 && bestN * 2 > total && isValidCategory(type, best)) return best;
  return null;
}
