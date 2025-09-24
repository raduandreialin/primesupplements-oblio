import { logger } from '../utils/index.js';

// Middleware to verify Oblio webhooks
const verifyOblioWebhook = (req, res, next) => {
  const requestId = req.headers['x-oblio-request-id'];

  // Check if X-Oblio-Request-Id is provided
  if (!requestId) {
    logger.error({ headers: req.headers }, "Missing X-Oblio-Request-Id in request headers");
    return res.status(401).json({ error: "Unauthorized: Missing X-Oblio-Request-Id" });
  }

  // Log the incoming webhook
  logger.info({ requestId }, 'Oblio webhook received');

  // Oblio webhooks don't use HMAC verification like Shopify
  // The main requirement is to return the base64-encoded request ID
  next();
};

export default verifyOblioWebhook;