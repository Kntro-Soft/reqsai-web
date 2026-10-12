import { Router } from 'express';
export const menuRouter = Router();
menuRouter.get('/menu', async (_req, res) => res.json(await listDishes()));
menuRouter.put('/menu/:id/availability', async (req, res) => res.json(await setAvailability(req.params.id, req.body.available)));
export async function listDishes() { return []; }
export async function setAvailability(id: string, available: boolean) { return { id, available }; }
