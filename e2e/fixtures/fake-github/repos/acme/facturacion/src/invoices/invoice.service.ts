/** A company invoice (factura) needs the customer's RUC (11 digits); a receipt (boleta) only a DNI. */
export function issueInvoice(input: { ruc: string; amount: number }) {
  if (!/^\d{11}$/.test(input.ruc)) throw new Error('El RUC debe tener 11 dígitos');
  return { type: 'FACTURA', ...input };
}

export function issueReceipt(input: { dni?: string; amount: number }) {
  return { type: 'BOLETA', ...input };
}
