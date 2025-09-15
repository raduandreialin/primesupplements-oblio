import express from 'express';
import ShippingLabelController from '../controllers/ShippingLabelController.js';
import verifyShopifyWebhook, { captureRawBody } from '../middlewares/verifyShopifyWebhook.js';
import verifyShopifySession from '../middlewares/verifyShopifySession.js';

const router = express.Router();

// Secure route with HMAC verification for admin actions
router.post('/create',
    express.raw({ type: 'application/json', verify: captureRawBody }),
    verifyShopifyWebhook,
    ShippingLabelController.createFromShopifyOrder.bind(ShippingLabelController)
);

// Main Cargus fulfillment endpoint for extensions (with session verification and JSON parsing)
router.post('/fulfillment/create/cargus',
    express.json(),
    verifyShopifySession,
    ShippingLabelController.fulfillOrder.bind(ShippingLabelController)
);


export default router;
