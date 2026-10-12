import { Router } from 'express';
import { cancelReservation, createReservation, listReservations } from './reservation.service';

export const reservationRouter = Router();

reservationRouter.get('/reservations', async (req, res) => res.json(await listReservations(req.query.date as string)));
reservationRouter.post('/reservations', async (req, res) => res.status(201).json(await createReservation(req.body)));
reservationRouter.delete('/reservations/:id', async (req, res) => {
  await cancelReservation(req.params.id, new Date());
  res.status(204).end();
});
