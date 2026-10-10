/** A waiter can apply a discount of at most 10% of the bill; more needs the manager. */
export const MAX_DISCOUNT_PERCENT = 10;

export function applyDiscount(amount: number, percent: number): number {
  if (percent > MAX_DISCOUNT_PERCENT) throw new Error('Descuento mayor al 10% requiere al gerente');
  return amount * (1 - percent / 100);
}
