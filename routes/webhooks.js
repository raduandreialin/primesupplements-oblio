import express from 'express';
import InvoiceController from '../controllers/InvoiceController.js';
import verifyShopifyWebhook from '../middlewares/verifyShopifyWebhook.js';
import { logger } from '../utils/index.js';

const router = express.Router();

// Shopify webhook: Order fulfilled -> Create Oblio invoice (with verification)
router.post('/shopify/invoice/create', 
    verifyShopifyWebhook, 
    InvoiceController.createFromShopifyOrder.bind(InvoiceController)
);

// Shopify webhook: Order updated -> Retry invoice creation if has EROARE FACTURARE tag
router.post('/shopify/invoice/retry', 
    verifyShopifyWebhook, 
    InvoiceController.retryFromShopifyOrderUpdate.bind(InvoiceController)
);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;