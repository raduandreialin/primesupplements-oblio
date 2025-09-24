import express from "express";
import cors from "cors";
import { logger } from './utils/index.js';
import webhookRoutes from "./routes/webhooks.js";
import shippingRoutes from "./routes/shipping.js";
import printRoutes from "./routes/print.js";
import invoiceRoutes from "./routes/invoice.js";
import { captureRawBody } from "./middlewares/verifyShopifyWebhook.js";
import InventorySyncJob from "./jobs/inventorySyncJob.js";

const app = express();

// CORS configuration for Shopify admin extensions
app.use(cors({
  origin: [
    'https://admin.shopify.com',
    'https://*.admin.shopify.com',
    'https://admin.shopify.io',
    'https://*.admin.shopify.io',
    'https://extensions.shopifycdn.com',
    'https://*.extensions.shopifycdn.com',
    /^https:\/\/.*\.extensions\.shopifycdn\.com$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Shopify-Extension', 'User-Agent', 'Accept', 'Origin'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Capture raw body for webhook verification (before JSON parsing)
app.use('/webhooks/shopify', express.raw({ 
    type: 'application/json', 
    limit: '10mb',  // Increase limit for large Shopify webhooks
    verify: captureRawBody 
}));

// Regular JSON parsing for other routes
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/shipping', shippingRoutes);
app.use('/invoice', invoiceRoutes);
app.use('/api', printRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Oblio-Shopify Integration Server' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
    logger.info({ endpoint: `/webhooks/shopify/invoice/create` }, 'Invoice webhook endpoint available');
    logger.info({ endpoint: `/invoice/create` }, 'Invoice extension endpoint available');
    logger.info({ endpoint: `/invoice/anaf/validate` }, 'ANAF validation endpoint available');
    logger.info({ endpoint: `/shipping/create` }, 'Shipping label endpoint available');
    logger.info({ endpoint: `/shipping/create-label` }, 'Extension shipping label endpoint available (secured)');

    // Start inventory sync cron job
    const inventoryJob = new InventorySyncJob();
    inventoryJob.start();
});
