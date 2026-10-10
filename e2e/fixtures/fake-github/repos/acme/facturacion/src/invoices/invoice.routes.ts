import { Router } from 'express';
export const router = Router();
router.post('/invoices', issueInvoiceHandler);
router.post('/receipts', issueReceiptHandler);
router.get('/invoices/:id/pdf', downloadInvoicePdfHandler);
