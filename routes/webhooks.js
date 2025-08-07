import express from 'express';
import InvoiceController from '../controllers/InvoiceController.js';
import verifyShopifyWebhook from '../middlewares/verifyShopifyWebhook.js';

const router = express.Router();

// Shopify webhook: Order fulfilled -> Create Oblio invoice (with verification)
router.post('/shopify/invoice/create', 
    verifyShopifyWebhook, 
    InvoiceController.createFromShopifyOrder.bind(InvoiceController)
);

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

export default router;