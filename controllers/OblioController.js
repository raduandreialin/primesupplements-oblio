import { logger } from '../utils/index.js';

class OblioController {
    /**
     * Handle stock update webhook from Oblio
     */
    static async handleStockUpdate(req, res) {
        try {
            const requestId = req.headers['x-oblio-request-id'];

            logger.info(`📦 Oblio stock webhook received`);

            // TODO: Process stock update logic here
            // This will sync stock changes from Oblio to Shopify

            // Return the base64-encoded X-Oblio-Request-Id as required by Oblio
            const base64RequestId = Buffer.from(requestId).toString('base64');
            res.status(200).send(base64RequestId);

        } catch (error) {
            logger.error(`❌ Oblio stock webhook error: ${error.message}`);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

export default OblioController;