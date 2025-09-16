import ShopifyService from '../services/ShopifyService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

/**
 * Action: Update Shopify Order
 * 
 * Handles updating Shopify orders with shipping information,
 * metafields, tags, and custom attributes.
 * 
 * Single Responsibility: Shopify order data updates
 */
export class UpdateShopifyOrderAction {
    constructor(shopifyService = null) {
        // Allow dependency injection for testing
        this.shopifyService = shopifyService || new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
    }

    /**
     * Execute order update with shipping information
     * @param {Object} params - Update parameters
     * @returns {Promise<Object>} Update result
     */
    async execute({
        orderId,
        awb,
        carrier,
        trackingUrl,
        additionalData = {}
    }) {
        try {
            logger.info({ 
                orderId, 
                trackingNumber: awb.BarCode,
                carrier 
            }, 'Starting Shopify order update with shipping info');

            const results = await Promise.allSettled([
                this._updateMetafields(orderId, awb, carrier, trackingUrl),
                this._setCustomAttributes(orderId, awb, carrier),
                this._addShippingTags(orderId, carrier),
                this._updateAdditionalData(orderId, additionalData)
            ]);

            // Check results and log any failures
            const failures = results
                .map((result, index) => ({ result, operation: this._getOperationName(index) }))
                .filter(({ result }) => result.status === 'rejected');

            if (failures.length > 0) {
                logger.warn({
                    orderId,
                    failures: failures.map(f => ({ 
                        operation: f.operation, 
                        error: f.result.reason.message 
                    }))
                }, 'Some order update operations failed');
            }

            const successCount = results.filter(r => r.status === 'fulfilled').length;

            logger.info({
                orderId,
                successfulOperations: successCount,
                totalOperations: results.length,
                trackingNumber: awb.BarCode
            }, 'Shopify order update completed');

            return {
                success: successCount > 0, // Success if at least one operation succeeded
                successfulOperations: successCount,
                totalOperations: results.length,
                failures: failures.map(f => ({ 
                    operation: f.operation, 
                    error: f.result.reason.message 
                }))
            };

        } catch (error) {
            logger.error({
                orderId,
                error: error.message,
                stack: error.stack
            }, 'Failed to update Shopify order');

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update order metafields with shipping information
     * @private
     */
    async _updateMetafields(orderId, awb, carrier, trackingUrl) {
        const metafields = [
            {
                namespace: 'shipping',
                key: 'awb_number',
                value: awb.BarCode || 'N/A',
                type: 'single_line_text_field'
            },
            {
                namespace: 'shipping',
                key: 'courier_company',
                value: carrier,
                type: 'single_line_text_field'
            },
            {
                namespace: 'shipping',
                key: 'tracking_url',
                value: trackingUrl,
                type: 'url'
            },
            {
                namespace: 'shipping',
                key: 'awb_created_at',
                value: new Date().toISOString(),
                type: 'date_time'
            }
        ];

        await this.shopifyService.updateOrderMetafields(orderId, metafields);
        logger.debug({ orderId, metafieldCount: metafields.length }, 'Metafields updated');
    }

    /**
     * Set shipping custom attributes
     * @private
     */
    async _setCustomAttributes(orderId, awb, carrier) {
        await this.shopifyService.setShippingCustomAttributes(
            orderId,
            awb.BarCode || 'N/A',
            carrier
        );
        logger.debug({ orderId }, 'Custom attributes updated');
    }

    /**
     * Add shipping-related tags to order
     * @private
     */
    async _addShippingTags(orderId, carrier) {
        const tags = [
            'SHIPPING_LABEL_CREATED',
            `${carrier.toUpperCase()}_SHIPMENT`,
            'AWB_GENERATED'
        ];

        for (const tag of tags) {
            await this.shopifyService.tagOrder(orderId, tag);
        }

        logger.debug({ orderId, tags }, 'Shipping tags added');
    }

    /**
     * Update additional shipping data as metafields
     * @private
     */
    async _updateAdditionalData(orderId, additionalData) {
        if (!additionalData || Object.keys(additionalData).length === 0) {
            return;
        }

        const additionalMetafields = [];

        // Add package dimensions if available
        if (additionalData.weight) {
            additionalMetafields.push({
                namespace: 'shipping',
                key: 'package_weight',
                value: additionalData.weight.toString(),
                type: 'number_decimal'
            });
        }

        // Add service options
        const serviceOptions = [
            'service', 'codAmount', 'insuranceValue', 'envelopes',
            'openPackage', 'saturdayDelivery', 'morningDelivery',
            'shipmentPayer', 'observations'
        ];

        serviceOptions.forEach(option => {
            if (additionalData[option] !== undefined && additionalData[option] !== null) {
                additionalMetafields.push({
                    namespace: 'shipping',
                    key: option,
                    value: additionalData[option].toString(),
                    type: 'single_line_text_field'
                });
            }
        });

        if (additionalMetafields.length > 0) {
            await this.shopifyService.updateOrderMetafields(orderId, additionalMetafields);
            logger.debug({ orderId, additionalFieldsCount: additionalMetafields.length }, 'Additional data updated');
        }
    }

    /**
     * Get operation name by index for error reporting
     * @private
     */
    _getOperationName(index) {
        const operations = ['metafields', 'customAttributes', 'tags', 'additionalData'];
        return operations[index] || 'unknown';
    }

    /**
     * Add cancellation metadata to order
     * @param {string} orderId - Shopify order ID
     * @param {string} awbBarcode - AWB barcode that was cancelled
     * @returns {Promise<Object>}
     */
    async addCancellationInfo(orderId, awbBarcode) {
        try {
            await Promise.allSettled([
                this.shopifyService.updateOrderMetafields(orderId, [{
                    namespace: 'shipping',
                    key: 'awb_cancelled',
                    value: new Date().toISOString(),
                    type: 'date_time'
                }]),
                this.shopifyService.tagOrder(orderId, 'AWB_CANCELLED')
            ]);

            logger.info({ orderId, awbBarcode }, 'Cancellation info added to order');
            return { success: true };

        } catch (error) {
            logger.error({ orderId, awbBarcode, error: error.message }, 'Failed to add cancellation info');
            return { success: false, error: error.message };
        }
    }

    /**
     * Mark order as having failed AWB cancellation
     * @param {string} orderId - Shopify order ID
     * @returns {Promise<Object>}
     */
    async markCancellationFailed(orderId) {
        try {
            await this.shopifyService.tagOrder(orderId, 'AWB_CANCELLATION_FAILED');
            logger.info({ orderId }, 'Order marked as cancellation failed');
            return { success: true };

        } catch (error) {
            logger.error({ orderId, error: error.message }, 'Failed to mark cancellation failed');
            return { success: false, error: error.message };
        }
    }
}

export default UpdateShopifyOrderAction;
