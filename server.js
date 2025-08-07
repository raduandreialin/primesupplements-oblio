import express from "express";
import webhookRoutes from "./routes/webhooks.js";
import { captureRawBody } from "./middlewares/verifyShopifyWebhook.js";

const app = express();

// Capture raw body for webhook verification (before JSON parsing)
app.use('/webhooks/shopify', express.raw({ type: 'application/json', verify: captureRawBody }));

// Regular JSON parsing for other routes
app.use(express.json());

// Routes
app.use('/webhooks', webhookRoutes);

// Basic health check
app.get('/', (req, res) => {
    res.json({ status: 'OK', message: 'Oblio-Shopify Integration Server' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`📋 Webhook endpoint: http://localhost:${PORT}/webhooks/shopify/invoice/create`);
});
