import { AdapterFactory } from '../adapters/index.js';
import { logger } from '../utils/index.js';

/**
 * Action: Cancel AWB
 * 
 * Handles cancellation of shipping labels (AWBs) with courier services.
 * Processes fulfillment cancellation webhooks and manages AWB lifecycle.
 * 
 * Single Responsibility: AWB cancellation operations
 */
export class CancelAwbAction {
    constructor(shippingAdapter = null) {
        // Allow dependency injection for testing, default to Cargus
        this.shippingAdapter = shippingAdapter || 
            AdapterFactory.createAdapter(AdapterFactory.ADAPTERS.CARGUS);
    }

    /**
     * Execute AWB cancellation
     * @param {Object} params - Cancellation parameters
     * @returns {Promise<Object>} Cancellation result
     */
    async execute({
        awbBarcode,
        fulfillmentId = null,
        orderId = null,
        reason = 'Order cancellation'
    }) {
        try {
            logger.info({ 
                awbBarcode, 
                fulfillmentId, 
                orderId,
                reason 
            }, 'Starting AWB cancellation');

            // Validate input
            if (!awbBarcode) {
                throw new Error('AWB barcode is required for cancellation');
            }

            // Attempt to cancel AWB with shipping provider
            const cancellationResult = await this.shippingAdapter.cancelAwb(awbBarcode);

            if (cancellationResult) {
                logger.info({
                    awbBarcode,
                    fulfillmentId,
                    orderId,
                    carrier: this.shippingAdapter.getCarrierName()
                }, 'AWB cancelled successfully');

                return {
                    success: true,
                    awbBarcode,
                    cancellationTimestamp: new Date().toISOString(),
                    carrier: this.shippingAdapter.getCarrierName(),
                    reason
                };
            } else {
                logger.warn({
                    awbBarcode,
                    fulfillmentId,
                    orderId
                }, 'AWB cancellation failed - may have already been picked up by courier');

                return {
                    success: false,
                    awbBarcode,
                    error: 'Cancellation failed - package may have been picked up',
                    requiresManualIntervention: true,
                    reason
                };
            }

        } catch (error) {
            logger.error({
                awbBarcode,
                fulfillmentId,
                orderId,
                error: error.message,
                stack: error.stack
            }, 'Error during AWB cancellation');

            return {
                success: false,
                awbBarcode,
                error: error.message,
                requiresManualIntervention: true,
                reason
            };
        }
    }

    /**
     * Process Shopify fulfillment cancellation webhook
     * @param {Object} fulfillment - Shopify fulfillment data
     * @returns {Promise<Object>} Processing result
     */
    async processWebhookCancellation(fulfillment) {
        try {
            logger.info({
                fulfillmentId: fulfillment.id,
                orderId: fulfillment.order_id,
                status: fulfillment.status,
                trackingNumber: fulfillment.tracking_number
            }, 'Processing Shopify fulfillment cancellation webhook');

            // Validate webhook data
            if (!fulfillment.tracking_number) {
                logger.warn({ 
                    fulfillmentId: fulfillment.id 
                }, 'No tracking number found, skipping AWB cancellation');
                
                return {
                    success: true,
                    skipped: true,
                    reason: 'No tracking number'
                };
            }

            // Extract AWB barcode from tracking number
            const awbBarcode = fulfillment.tracking_number;

            // Execute cancellation
            const result = await this.execute({
                awbBarcode,
                fulfillmentId: fulfillment.id,
                orderId: fulfillment.order_id,
                reason: 'Shopify fulfillment cancelled'
            });

            // Add webhook-specific data
            result.webhookProcessed = true;
            result.fulfillmentId = fulfillment.id;
            result.shopifyOrderId = fulfillment.order_id;

            return result;

        } catch (error) {
            logger.error({
                fulfillmentData: fulfillment,
                error: error.message,
                stack: error.stack
            }, 'Error processing fulfillment cancellation webhook');

            return {
                success: false,
                error: error.message,
                webhookProcessed: false,
                fulfillmentId: fulfillment.id,
                shopifyOrderId: fulfillment.order_id
            };
        }
    }

    /**
     * Check if AWB can be cancelled
     * @param {string} awbBarcode - AWB barcode to check
     * @returns {Promise<Object>} Cancellation eligibility
     */
    async canCancel(awbBarcode) {
        try {
            // This would depend on the shipping provider's API
            // For now, we'll assume all AWBs can be cancelled unless they're in transit
            logger.info({ awbBarcode }, 'Checking AWB cancellation eligibility');

            // In a real implementation, you might check AWB status first
            // const awbStatus = await this.shippingAdapter.getAwbStatus(awbBarcode);
            // return awbStatus !== 'in_transit' && awbStatus !== 'delivered';

            return {
                canCancel: true,
                reason: 'AWB is eligible for cancellation'
            };

        } catch (error) {
            logger.error({
                awbBarcode,
                error: error.message
            }, 'Error checking cancellation eligibility');

            return {
                canCancel: false,
                reason: `Unable to verify status: ${error.message}`
            };
        }
    }

    /**
     * Get cancellation deadline for AWB
     * @param {string} awbBarcode - AWB barcode
     * @returns {Promise<Object>} Deadline information
     */
    async getCancellationDeadline(awbBarcode) {
        try {
            // This is provider-specific logic
            // Most couriers allow cancellation until pickup
            const now = new Date();
            const deadline = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now

            return {
                deadline: deadline.toISOString(),
                hoursRemaining: 24,
                canStillCancel: true
            };

        } catch (error) {
            logger.error({
                awbBarcode,
                error: error.message
            }, 'Error getting cancellation deadline');

            return {
                deadline: null,
                hoursRemaining: 0,
                canStillCancel: false,
                error: error.message
            };
        }
    }
}

export default CancelAwbAction;
