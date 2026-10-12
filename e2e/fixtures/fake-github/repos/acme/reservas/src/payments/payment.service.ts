/** Deposits: a reservation for 6 or more people requires a deposit of 20 soles per person. */
export const DEPOSIT_MIN_PEOPLE = 6;
export const DEPOSIT_PER_PERSON_PEN = 20;
const STRIPE_KEY = process.env.STRIPE_KEY;

export async function payWithCard(input: { reservationId: string; amount: number }) {
  return { status: 'PAID', method: 'CARD', ...input };
}

export async function payWithYape(input: { reservationId: string; phone: string; amount: number }) {
  return { status: 'PAID', method: 'YAPE', ...input };
}
