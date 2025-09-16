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
 * Get invoice URL for an order
 * GET /api/orders/:orderId/invoice-url
 */
router.get('/orders/:orderId/invoice-url', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        logger.info({ orderId }, 'Fetching invoice URL for order');
        
        // Get order with metafields to check for invoice URL
        const order = await shopifyService.getOrder(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Check if order has invoice metafields
        let invoiceUrl = null;
        let invoiceNumber = null;
        
        // Try to get from custom attributes first (new approach)
        if (order.note_attributes) {
            const invoiceUrlAttr = order.note_attributes.find(attr => attr.name === 'INVOICE_URL');
            const invoiceNumberAttr = order.note_attributes.find(attr => attr.name === 'INVOICE_NUMBER');
            
            if (invoiceUrlAttr) {
                invoiceUrl = invoiceUrlAttr.value;
            }
            if (invoiceNumberAttr) {
                invoiceNumber = invoiceNumberAttr.value;
            }
        }
        
        // Fallback: Check tags for invoice number and construct URL
        if (!invoiceUrl && order.tags) {
            const invoiceTag = order.tags.split(', ').find(tag => tag.startsWith('FACTURA-'));
            if (invoiceTag) {
                invoiceNumber = invoiceTag.replace('FACTURA-', '');
                // Construct Oblio invoice URL
                invoiceUrl = `https://www.oblio.eu/docs/invoice?cif=${process.env.OBLIO_COMPANY_CIF}&seriesName=${process.env.OBLIO_INVOICE_SERIES}&number=${invoiceNumber}`;
            }
        }
        
        if (!invoiceUrl) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found for this order'
            });
        }
        
        logger.info({ orderId, invoiceUrl, invoiceNumber }, 'Invoice URL found');
        
        // Use proxy endpoint for invoice document (handles Oblio CORS)
        const proxyInvoiceUrl = `https://primesupplements-oblio-production.up.railway.app/api/invoice-document/${orderId}?url=${encodeURIComponent(invoiceUrl)}`;
        
        const response = {
            success: true,
            invoiceUrl: proxyInvoiceUrl,
            invoiceNumber,
            orderId
        };
        
        logger.info({ response }, 'Sending invoice response with proxy URL');
        res.json(response);
        
    } catch (error) {
        logger.error({ orderId: req.params.orderId, error: error.message }, 'Failed to get invoice URL');
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve invoice URL'
        });
    }
});

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
router.get('/awb-document/:awbNumber', async (req, res) => {
    try {
        const { awbNumber } = req.params;
        const { format = '0', printOnce = '1' } = req.query; // Default: A4 format, print once
        
        logger.info({ awbNumber, format, printOnce }, 'Fetching AWB document from Cargus');
        
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
        
        // The Cargus API returns Base64 encoded PDF
        // We need to decode it and serve it as PDF
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
        
        // Set appropriate headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="AWB-${awbNumber}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        logger.info({ awbNumber, pdfSize: pdfBuffer.length }, 'AWB document served successfully');
        
        // Send the PDF buffer
        res.send(pdfBuffer);
        
    } catch (error) {
        logger.error({ awbNumber: req.params.awbNumber, error: error.message }, 'Failed to fetch AWB document');
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AWB document'
        });
    }
});

/**
 * Proxy endpoint to serve invoice documents from Oblio
 * GET /api/invoice-document/:orderId?url={invoiceUrl}
 */
router.get('/invoice-document/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'Invoice URL parameter is required'
            });
        }
        
        logger.info({ orderId, url }, 'Fetching invoice document from Oblio');
        
        // Fetch the invoice document from Oblio
        const response = await fetch(url);
        
        if (!response.ok) {
            logger.error({ orderId, url, status: response.status }, 'Failed to fetch invoice from Oblio');
            return res.status(404).json({
                success: false,
                error: 'Invoice document not found'
            });
        }
        
        // Get the content type from Oblio response
        const contentType = response.headers.get('content-type') || 'application/pdf';
        
        // Set appropriate headers for PDF
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="Invoice-${orderId}.pdf"`);
        
        // Stream the response from Oblio to the client
        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
        
        logger.info({ orderId, contentType, size: buffer.byteLength }, 'Invoice document served successfully');
        
    } catch (error) {
        logger.error({ orderId: req.params.orderId, error: error.message }, 'Failed to fetch invoice document');
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve invoice document'
        });
    }
});

/**
 * Combined documents endpoint - serves HTML page that opens both PDFs
 * GET /api/combined-documents?invoice={invoiceUrl}&awb={awbUrl}
 */
router.get('/combined-documents', async (req, res) => {
    try {
        const { invoice, awb } = req.query;
        
        if (!invoice && !awb) {
            return res.status(400).json({
                success: false,
                error: 'At least one document URL is required'
            });
        }
        
        logger.info({ invoice, awb }, 'Creating combined document view');
        
        // Create HTML page that opens both documents
        const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Print Documents</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .document { margin: 20px 0; }
        iframe { width: 100%; height: 600px; border: 1px solid #ccc; }
        .print-button { 
            background: #008060; 
            color: white; 
            padding: 10px 20px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            margin: 10px 5px;
        }
        .print-button:hover { background: #006b4f; }
    </style>
</head>
<body>
    <h1>Order Documents</h1>
    
    ${invoice ? `
    <div class="document">
        <h2>Invoice</h2>
        <button class="print-button" onclick="printDocument('${invoice}')">Print Invoice</button>
        <iframe src="${invoice}" title="Invoice"></iframe>
    </div>
    ` : ''}
    
    ${awb ? `
    <div class="document">
        <h2>Shipping Label (AWB)</h2>
        <button class="print-button" onclick="printDocument('${awb}')">Print AWB</button>
        <iframe src="${awb}" title="AWB"></iframe>
    </div>
    ` : ''}
    
    ${invoice && awb ? `
    <div style="text-align: center; margin: 20px;">
        <button class="print-button" onclick="printAll()" style="font-size: 16px;">Print All Documents</button>
    </div>
    ` : ''}
    
    <script>
        function printDocument(url) {
            const printWindow = window.open(url, '_blank');
            printWindow.onload = function() {
                printWindow.print();
            };
        }
        
        function printAll() {
            ${invoice ? `printDocument('${invoice}');` : ''}
            ${awb ? `setTimeout(() => printDocument('${awb}'), 1000);` : ''}
        }
        
        // Auto-print all if both documents are present
        window.onload = function() {
            ${invoice && awb ? 'setTimeout(printAll, 1000);' : ''}
        };
    </script>
</body>
</html>`;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to create combined document');
        res.status(500).json({
            success: false,
            error: 'Failed to create combined document'
        });
    }
});

export default router;
