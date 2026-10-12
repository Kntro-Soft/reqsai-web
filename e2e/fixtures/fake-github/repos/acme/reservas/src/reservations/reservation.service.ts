import { canCancel } from './cancellation.policy';
import { db } from '../db';
import { sendConfirmationEmail } from './reservation.mailer';

/** A reservation admits at most 8 people; bigger groups are handled by phone. */
export const MAX_PARTY_SIZE = 8;
/** Reservations are accepted up to 30 days ahead. */
export const MAX_DAYS_AHEAD = 30;

export async function createReservation(input: { name: string; email: string; people: number; startsAt: string }) {
  if (input.people > MAX_PARTY_SIZE) {
    throw new Error('Máximo 8 personas por reserva');
  }
  const startsAt = new Date(input.startsAt);
  const days = (startsAt.getTime() - Date.now()) / 86_400_000;
  if (days > MAX_DAYS_AHEAD) {
    throw new Error('Solo se reserva con hasta 30 días de anticipación');
  }
  const reservation = await db.insert('reservations', { ...input, status: 'CONFIRMED' });
  await sendConfirmationEmail(reservation);
  return reservation;
}

export async function cancelReservation(id: string, now: Date) {
  const reservation = await db.findById('reservations', id);
  if (!canCancel(new Date(reservation.startsAt), now)) {
    throw new Error('Solo se puede cancelar hasta 2 horas antes de la reserva');
  }
  await db.update('reservations', id, { status: 'CANCELLED' });
}

export async function listReservations(date: string) {
  return db.query('select * from reservations where date(starts_at) = $1', [date]);
}
