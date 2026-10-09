import express from 'express';
import { reservationRouter } from './reservations/reservation.routes';
import { paymentRouter } from './payments/payment.routes';
import { menuRouter } from './menu/menu.routes';
const app = express();
app.use('/api', reservationRouter, paymentRouter, menuRouter);
app.listen(3000);
