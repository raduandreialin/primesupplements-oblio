import express from 'express';
import ShopifyService from '../services/ShopifyService.js';
import CargusService from '../services/CargusService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

const router = express.Router();

// Initialize Shopify service
const shopifyService = new ShopifyService(
    config.shopify.B2C_SHOPIFY_SHOPNAME,
    config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
);

// Initialize Cargus service
const cargusService = new CargusService(
    config.cargus.subscriptionKey,
    config.cargus.username, 
    config.cargus.password
);


/**
 * Get AWB/shipping label URL for an order
 * GET /api/orders/:orderId/awb-url
 */
router.get('/orders/:orderId/awb-url', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        logger.info({ orderId }, 'Fetching AWB URL for order');
        
        // Get order with metafields to check for AWB information
        const order = await shopifyService.getOrder(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if order has AWB information
        let awbNumber = null;
        let awbUrl = null;
        
        // Try to get from custom attributes first (new approach)
        if (order.note_attributes) {
            const awbNumberAttr = order.note_attributes.find(attr => attr.name === 'AWB_NUMBER');
            
            if (awbNumberAttr) {
                awbNumber = awbNumberAttr.value;
                // Use our proxy endpoint for AWB document (handles Cargus authentication)
                awbUrl = `https://primesupplements-oblio-production.up.railway.app/api/awb-document/${awbNumber}`;
            }
        }
        
        // Fallback: Check fulfillments for tracking number
        if (!awbNumber && order.fulfillments && order.fulfillments.length > 0) {
            const fulfillment = order.fulfillments.find(f => f.tracking_number);
            if (fulfillment && fulfillment.tracking_number) {
                awbNumber = fulfillment.tracking_number;
                // Use our proxy endpoint for AWB document (handles Cargus authentication)
                awbUrl = `https://primesupplements-oblio-production.up.railway.app/api/awb-document/${awbNumber}`;
            }
        }
        
        if (!awbNumber || !awbUrl) {
            return res.status(404).json({
                success: false,
                error: 'Shipping label (AWB) not found for this order'
            });
        }
        
        logger.info({ orderId, awbNumber, awbUrl }, 'AWB URL found');
        
        res.json({
            success: true,
            awbUrl,
            awbNumber,
            orderId
        });
        
    } catch (error) {
        logger.error({ orderId: req.params.orderId, error: error.message }, 'Failed to get AWB URL');
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AWB URL'
        });
    }
});

/**
 * Proxy endpoint to serve AWB documents from Cargus API
 * GET /api/awb-document/:awbNumber
 */
router.options('/awb-document/:awbNumber', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

router.get('/awb-document/:awbNumber', async (req, res) => {
    try {
        const { awbNumber } = req.params;
        const { format = '0', printOnce = '1', raw = '0' } = req.query; // Default: A4 format, print once

        logger.info({ awbNumber, format, printOnce, raw }, 'Fetching AWB document from Cargus');

        // Fetch AWB document from Cargus API
        const awbDocument = await cargusService.printAwbDocuments(
            [awbNumber],
            'PDF',
            parseInt(format),
            parseInt(printOnce)
        );

        if (!awbDocument) {
            return res.status(404).json({
                success: false,
                error: 'AWB document not found'
            });
        }

        // CORS headers - allow from any origin for Shopify admin
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition, Content-Length');

        // Cache control
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // CSP headers to allow embedding in Shopify admin iframes
        res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.shopify.com https://*.admin.shopify.com https://*.admin.shopify.io https://extensions.shopifycdn.com https://*.extensions.shopifycdn.com");

        // Remove X-Frame-Options as it conflicts with CSP frame-ancestors
        res.removeHeader('X-Frame-Options');

        // If raw=1, serve the PDF directly (for direct downloads/new tab)
        if (raw === '1') {
            let pdfBuffer;
            try {
                pdfBuffer = Buffer.from(awbDocument, 'base64');
            } catch (decodeError) {
                logger.error({ awbNumber, error: decodeError.message }, 'Failed to decode Base64 AWB document');
                return res.status(500).json({
                    success: false,
                    error: 'Failed to decode AWB document'
                });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="AWB-${awbNumber}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);

            logger.info({ awbNumber, pdfSize: pdfBuffer.length }, 'AWB document served as raw PDF');
            return res.send(pdfBuffer);
        }

        // Default: Serve an HTML page with embedded PDF using PDF.js
        // This avoids Chrome's PDF viewer extension CSP issues in iframes
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWB ${awbNumber}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #525659; }
        #pdf-container { width: 100%; height: 100%; overflow: auto; display: flex; flex-direction: column; align-items: center; padding: 10px; gap: 10px; }
        .pdf-page { background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.3); }
        #loading { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-family: Arial, sans-serif; font-size: 18px; }
        #error { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #ff6b6b; font-family: Arial, sans-serif; font-size: 16px; text-align: center; padding: 20px; }
        @media print {
            html, body { background: white; }
            #pdf-container { padding: 0; gap: 0; }
            .pdf-page { box-shadow: none; page-break-after: always; }
        }
    </style>
</head>
<body>
    <div id="loading">Loading AWB document...</div>
    <div id="pdf-container"></div>
    <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const pdfData = atob('${awbDocument}');
        const pdfArray = new Uint8Array(pdfData.length);
        for (let i = 0; i < pdfData.length; i++) {
            pdfArray[i] = pdfData.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: pdfArray });
        loadingTask.promise.then(async function(pdf) {
            document.getElementById('loading').style.display = 'none';
            const container = document.getElementById('pdf-container');

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const scale = 1.5;
                const viewport = page.getViewport({ scale: scale });

                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-page';
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                container.appendChild(canvas);

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;
            }
        }).catch(function(error) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('pdf-container').innerHTML = '<div id="error">Failed to load PDF document.<br>Error: ' + error.message + '</div>';
            console.error('PDF loading error:', error);
        });
    </script>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        logger.info({ awbNumber }, 'AWB document served as HTML with PDF.js');
        res.send(htmlContent);

    } catch (error) {
        logger.error({ awbNumber: req.params.awbNumber, error: error.message }, 'Failed to fetch AWB document');
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AWB document'
        });
    }
});


export default router;
