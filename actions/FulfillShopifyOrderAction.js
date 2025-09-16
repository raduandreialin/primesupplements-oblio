import ShopifyService from '../services/ShopifyService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

/**
 * Action: Fulfill Shopify Order
 * 
 * Handles Shopify order fulfillment with tracking information.
 * Integrates with Shopify API to mark orders as fulfilled and 
 * add shipping tracking details.
 * 
 * Single Responsibility: Shopify fulfillment operations
 */
export class FulfillShopifyOrderAction {
    constructor(shopifyService = null) {
        // Allow dependency injection for testing
        this.shopifyService = shopifyService || new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
    }

    /**
     * Execute order fulfillment in Shopify
     * @param {Object} params - Fulfillment parameters
     * @returns {Promise<Object>} Fulfillment result
     */
    async execute({
        orderId,
        awb,
        notifyCustomer = true,
        carrier = 'Cargus'
    }) {
        try {
            logger.info({ 
                orderId, 
                trackingNumber: awb.BarCode,
                carrier,
                notifyCustomer 
            }, 'Starting Shopify order fulfillment');

            // Fulfill order with tracking information
            const fulfillmentResult = await this.shopifyService.fulfillOrderWithCargus(
                orderId, 
                awb, 
                notifyCustomer
            );

            logger.info({
                orderId,
                fulfillmentId: fulfillmentResult.fulfillmentId,
                trackingNumber: fulfillmentResult.awbBarcode,
                trackingUrl: fulfillmentResult.trackingUrl,
                status: 'fulfilled'
            }, 'Order fulfilled successfully in Shopify');

            return {
                success: true,
                fulfillmentId: fulfillmentResult.fulfillmentId,
                trackingNumber: fulfillmentResult.awbBarcode,
                trackingUrl: fulfillmentResult.trackingUrl,
                status: 'fulfilled',
                notificationSent: notifyCustomer
            };

        } catch (error) {
            logger.error({
                orderId,
                awbBarcode: awb.BarCode,
                error: error.message,
                stack: error.stack
            }, 'Failed to fulfill order in Shopify');

            // Don't throw - we want to continue even if fulfillment fails
            // The AWB was created successfully, user can manually fulfill
            return {
                success: false,
                error: error.message,
                trackingNumber: awb.BarCode,
                requiresManualFulfillment: true
            };
        }
    }

    /**
     * Check if order can be fulfilled
     * @param {string} orderId - Shopify order ID
     * @returns {Promise<boolean>}
     */
    async canFulfill(orderId) {
        try {
            const order = await this.shopifyService.getOrder(orderId);
            
            // Check if order exists and is not already fulfilled
            if (!order) {
                logger.warn({ orderId }, 'Order not found for fulfillment');
                return false;
            }

            if (order.fulfillment_status === 'fulfilled') {
                logger.warn({ orderId }, 'Order already fulfilled');
                return false;
            }

            return true;
        } catch (error) {
            logger.error({ orderId, error: error.message }, 'Error checking fulfillment eligibility');
            return false;
        }
    }
}

export default FulfillShopifyOrderAction;
