import express from 'express';
import InvoiceController from '../controllers/InvoiceController.js';
import { logger } from '../utils/index.js';

const router = express.Router();

/**
 * Invoice Routes
 * 
 * API endpoints for invoice operations, supporting both webhook
 * and admin extension interactions.
 */

// ==================== WEBHOOK ROUTES ====================

/**
 * POST /invoice/webhook/create
 * Create invoice from Shopify order fulfillment webhook
 */
router.post('/webhook/create', async (req, res) => {
    try {
        await InvoiceController.createFromShopifyOrder(req, res);
    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/webhook/create'
        }, 'Invoice webhook creation route error');
        
        // Always return 200 for webhooks to prevent retries
        res.status(200).json({ received: true, error: error.message });
    }
});

/**
 * POST /invoice/webhook/retry
 * Retry invoice creation from Shopify order update webhook
 */
router.post('/webhook/retry', async (req, res) => {
    try {
        await InvoiceController.retryFromShopifyOrderUpdate(req, res);
    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/webhook/retry'
        }, 'Invoice webhook retry route error');
        
        // Always return 200 for webhooks to prevent retries
        res.status(200).json({ received: true, error: error.message });
    }
});

// ==================== EXTENSION ROUTES ====================

/**
 * POST /invoice/create
 * Create invoice from admin extension
 * 
 * Expected payload:
 * {
 *   orderId: string,
 *   orderData: object,
 *   invoiceOptions?: object,
 *   customClient?: object,
 *   validateCompany?: boolean,
 *   skipAnaf?: boolean
 * }
 */
router.post('/create', async (req, res) => {
    try {
        await InvoiceController.createFromExtension(req, res);
    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/create',
            orderId: req.body?.orderId
        }, 'Invoice extension creation route error');
        
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * POST /invoice/retry
 * Retry invoice creation from admin extension
 * 
 * Expected payload:
 * {
 *   orderId: string,
 *   orderData: object,
 *   retryOptions?: object
 * }
 */
router.post('/retry', async (req, res) => {
    try {
        await InvoiceController.retryFromExtension(req, res);
    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/retry',
            orderId: req.body?.orderId
        }, 'Invoice extension retry route error');
        
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * GET /invoice/status/:orderId
 * Get invoice status for an order
 */
router.get('/status/:orderId', async (req, res) => {
    try {
        await InvoiceController.getInvoiceStatus(req, res);
    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/status/:orderId',
            orderId: req.params.orderId
        }, 'Invoice status route error');
        
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// ==================== ANAF VALIDATION ROUTES ====================

/**
 * POST /invoice/anaf/validate
 * Validate company with ANAF
 * 
 * Expected payload:
 * {
 *   cif: string,
 *   includeInactiveCompanies?: boolean
 * }
 */
router.post('/anaf/validate', async (req, res) => {
    try {
        await InvoiceController.validateCompany(req, res);
    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/anaf/validate',
            cif: req.body?.cif
        }, 'ANAF validation route error');
        
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

/**
 * POST /invoice/anaf/search
 * Search companies by CIF or name (future enhancement)
 * 
 * Expected payload:
 * {
 *   query: string,
 *   searchType?: 'cif' | 'name' | 'auto',
 *   limit?: number
 * }
 */
router.post('/anaf/search', async (req, res) => {
    try {
        const { query, searchType = 'auto', limit = 10 } = req.body;

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        // For now, redirect to validation if it looks like a CIF
        const cleanQuery = query.trim().toUpperCase();
        const withoutRO = cleanQuery.startsWith('RO') ? cleanQuery.substring(2) : cleanQuery;
        
        if (/^\d+$/.test(withoutRO)) {
            // It's a CIF, use validation endpoint
            req.body = { cif: query, includeInactiveCompanies: true };
            await InvoiceController.validateCompany(req, res);
        } else {
            // Name search not yet implemented
            res.json({
                success: false,
                error: 'Name-based search not yet implemented. Please use CIF for company lookup.',
                suggestions: ['Try searching by CIF number instead']
            });
        }

    } catch (error) {
        logger.error({
            error: error.message,
            stack: error.stack,
            route: '/invoice/anaf/search',
            query: req.body?.query
        }, 'ANAF search route error');
        
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// ==================== UTILITY ROUTES ====================

/**
 * GET /invoice/health
 * Health check for invoice system
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Invoice system is healthy',
        timestamp: new Date().toISOString(),
        services: {
            oblio: 'available',
            anaf: 'available',
            shopify: 'available'
        }
    });
});

/**
 * GET /invoice/config
 * Get invoice configuration for extension
 */
router.get('/config', (req, res) => {
    try {
        const config = {
            defaultSeries: process.env.OBLIO_INVOICE_SERIES || 'PRS',
            companyCif: process.env.OBLIO_COMPANY_CIF,
            availableSeries: ['PRS', 'FCT', 'FACT', 'PRO'], // This could be dynamic
            defaultLanguage: 'RO',
            supportedLanguages: ['RO', 'EN'],
            vatRates: [
                { name: 'Normala', percentage: 21 },
                { name: 'Redusa', percentage: 11 },
                { name: 'SFDD', percentage: 0 }
            ],
            paymentMethods: ['Card', 'Transfer', 'Cash', 'Other'],
            features: {
                anafValidation: true,
                emailSending: true,
                stockManagement: true,
                partialInvoices: true,
                retryLogic: true
            }
        };

        res.json({
            success: true,
            config
        });

    } catch (error) {
        logger.error({
            error: error.message,
            route: '/invoice/config'
        }, 'Invoice config route error');
        
        res.status(500).json({
            success: false,
            error: 'Failed to get invoice configuration'
        });
    }
});

// ==================== ERROR HANDLING ====================

/**
 * Global error handler for invoice routes
 */
router.use((error, req, res, next) => {
    logger.error({
        error: error.message,
        stack: error.stack,
        route: req.path,
        method: req.method,
        body: req.body
    }, 'Invoice route error handler');

    // Don't expose internal errors to client
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.status(500).json({
        success: false,
        error: isProduction ? 'Internal server error' : error.message,
        ...(isProduction ? {} : { details: error.stack })
    });
});

export default router;
