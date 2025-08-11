import crypto from 'crypto';
import { logger } from '../utils/index.js';

// Middleware to capture raw body
export const captureRawBody = (req, res, buf) => {
  req.rawBody = buf;
};

// Middleware to verify Shopify webhooks
const verifyShopifyWebhook = (req, res, next) => {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const shopDomain = req.headers["x-shopify-shop-domain"];

  // Check if HMAC is provided in the headers
  if (!hmac) {
    logger.error({ headers: req.headers }, "Missing HMAC in request headers");
    return res.status(401).json({ error: "Unauthorized: Missing HMAC" });
  }

  // Check if shop domain is provided
  if (!shopDomain) {
    logger.error({ headers: req.headers }, "Missing shop domain in request headers");
    return res.status(401).json({ error: "Unauthorized: Missing shop domain" });
  }

  // Dynamically get the secret for the shop
  const apiSecret = getShopSecret(shopDomain);

  if (!apiSecret) {
    logger.error({ shopDomain }, 'Shop domain not recognized');
    return res.status(401).json({ error: "Unauthorized: Shop domain not recognized" });
  }

  // Ensure rawBody is available
  if (!req.rawBody) {
    logger.error({ shopDomain }, "Raw body not available for verification");
    return res.status(400).json({ error: "Bad Request: Raw body not available" });
  }

  const generatedHash = crypto
    .createHmac("sha256", apiSecret)
    .update(req.rawBody)
    .digest("base64");

  // Use crypto.timingSafeEqual for secure comparison
  const expectedBuffer = Buffer.from(hmac, 'base64');
  const actualBuffer = Buffer.from(generatedHash, 'base64');

  if (expectedBuffer.length !== actualBuffer.length || 
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    logger.warn({ shopDomain }, 'Webhook verification failed');
    return res.status(401).json({ error: "Unauthorized: Webhook verification failed" });
  }

  // If verification passes, parse the body and proceed
  try {
    req.body = JSON.parse(req.rawBody.toString());
  } catch (error) {
    logger.error({ error: error.message }, "Invalid JSON payload");
    return res.status(400).json({ error: "Bad Request: Invalid JSON payload" });
  }

  logger.info({ shopDomain }, 'Webhook verified successfully');
  next();
};

// Helper function to get the correct secret based on shop domain
const getShopSecret = (shopDomain) => {
  const shopSecrets = {
    "primesupplements1.myshopify.com": process.env.B2C_SHOPIFY_WEBHOOK_KEY
  };
  
  return shopSecrets[shopDomain] || null;
};

export default verifyShopifyWebhook;
