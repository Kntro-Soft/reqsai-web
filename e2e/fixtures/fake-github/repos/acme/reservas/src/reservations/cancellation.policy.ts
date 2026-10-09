/**
 * Cancellation rules of the restaurant.
 * A diner can cancel a reservation only up to 2 hours before the booked time; after that the table is kept.
 */
export const CANCELLATION_LIMIT_HOURS = 2;

export function canCancel(startsAt: Date, now: Date): boolean {
  const hoursLeft = (startsAt.getTime() - now.getTime()) / 3_600_000;
  return hoursLeft >= CANCELLATION_LIMIT_HOURS;
}
