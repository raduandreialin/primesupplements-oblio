import express from 'express';
import ShippingLabelController from '../controllers/ShippingLabelController.js';
import InvoiceController from '../controllers/InvoiceController.js';
import verifyShopifyWebhook, { captureRawBody } from '../middlewares/verifyShopifyWebhook.js';
import verifyShopifySession from '../middlewares/verifyShopifySession.js';

const router = express.Router();

// Invoice creation route with HMAC verification for webhooks
router.post('/create',
    express.raw({ type: 'application/json', verify: captureRawBody }),
    verifyShopifyWebhook,
    InvoiceController.createFromShopifyOrder.bind(InvoiceController)
);

// Main shipping endpoint for extensions (with session verification and JSON parsing)
router.post('/fulfillment/create/cargus',
    express.json(),
    verifyShopifySession,
    ShippingLabelController.createFromExtension.bind(ShippingLabelController)
);

// Shopify webhook: Fulfillment cancelled -> Cancel AWB (with HMAC verification)
router.post('/fulfillment/cancel',
    express.raw({ type: 'application/json', verify: captureRawBody }),
    verifyShopifyWebhook,
    ShippingLabelController.handleFulfillmentCancellation.bind(ShippingLabelController)
);

export default router;
