import crypto from 'crypto';
import { logger } from '../utils/index.js';

/**
 * Simple session verification for Shopify Admin Extensions
 * For custom apps - validates basic request authenticity
 */
export const verifyShopifySession = (req, res, next) => {
    try {
        // Check if request has basic Shopify identifiers
        const userAgent = req.get('User-Agent') || '';
        const origin = req.get('Origin') || '';
        const referer = req.get('Referer') || '';
        
        // Specific validation for your Shopify store
        const allowedDomains = [
            'primesupplements1.myshopify.com',
            'admin.shopify.com'
        ];
        
        const isFromShopifyAdmin = 
            userAgent.includes('Shopify') ||
            allowedDomains.some(domain => 
                origin.includes(domain) || referer.includes(domain)
            );
            
        if (!isFromShopifyAdmin) {
            logger.warn('Request blocked - not from Shopify Admin', {
                userAgent,
                origin,
                referer,
                ip: req.ip
            });
            
            return res.status(401).json({
                success: false,
                error: 'Unauthorized - Invalid request source'
            });
        }
        
        // Check for required fields that should come from extension
        const { orderId, orderNumber } = req.body;
        
        if (!orderId || !orderNumber) {
            logger.warn('Request blocked - missing required extension fields', {
                hasOrderId: !!orderId,
                hasOrderNumber: !!orderNumber,
                ip: req.ip
            });
            
            return res.status(400).json({
                success: false,
                error: 'Missing required fields from extension'
            });
        }
        
        // Validate orderId format (should be Shopify GID)
        if (!orderId.startsWith('gid://shopify/Order/')) {
            logger.warn('Request blocked - invalid order ID format', {
                orderId,
                ip: req.ip
            });
            
            return res.status(400).json({
                success: false,
                error: 'Invalid order ID format'
            });
        }
        
        // Add shop context for single-store custom app
        req.shopifyContext = {
            isAuthenticated: true,
            source: 'admin-extension',
            shop: 'primesupplements1.myshopify.com',
            orderId,
            orderNumber
        };
        
        logger.info('Session verified for shipping label request', {
            orderId,
            orderNumber,
            ip: req.ip
        });
        
        next();
        
    } catch (error) {
        logger.error('Error in session verification', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
};

export default verifyShopifySession;
