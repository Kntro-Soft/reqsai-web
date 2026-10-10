/** Every receipt and invoice applies Peru's general sales tax (IGV) of 18%. */
export const IGV_RATE = 0.18;

export function withTax(amount: number): number {
  return Math.round(amount * (1 + IGV_RATE) * 100) / 100;
}
