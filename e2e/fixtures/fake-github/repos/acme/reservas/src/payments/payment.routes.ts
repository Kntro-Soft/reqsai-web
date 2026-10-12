import { Router } from 'express';
import { payWithCard, payWithYape } from './payment.service';

export const paymentRouter = Router();
paymentRouter.post('/payments/card', async (req, res) => res.json(await payWithCard(req.body)));
paymentRouter.post('/payments/yape', async (req, res) => res.json(await payWithYape(req.body)));
