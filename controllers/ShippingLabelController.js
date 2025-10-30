import { 
    CreateShippingLabelAction,
    FulfillShopifyOrderAction,
    UpdateOrderShippingAction,
    CancelAwbAction
} from '../actions/index.js';
import { logger } from '../utils/index.js';

/**
 * Shipping Label Controller
 * 
 * Orchestrates shipping operations using action classes.
 * This controller is now focused on HTTP request/response handling
 * and coordinating actions, following the Single Responsibility Principle.
 * 
 * Responsibilities:
 * - HTTP request/response handling
 * - Input validation and sanitization
 * - Action orchestration
 * - Error handling and logging
 */
class ShippingLabelController {
    constructor() {
        // Initialize actions
        this.createShippingLabelAction = new CreateShippingLabelAction();
        this.fulfillOrderAction = new FulfillShopifyOrderAction();
        this.updateOrderAction = new UpdateOrderShippingAction();
        this.cancelAwbAction = new CancelAwbAction();
    }

    /**
     * Create shipping label from extension with custom package details and fulfill the order
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async createFromExtension(req, res) {
        try {
            // Extract and validate request data
            const requestData = this._extractRequestData(req.body);
            const validationError = this._validateRequestData(requestData);
            
            if (validationError) {
                return res.status(400).json({
                    success: false,
                    error: validationError
                });
            }

            const { 
                orderId, 
                orderNumber, 
                numericOrderId,
                order,
                packageInfo,
                service,
                customShippingAddress,
                codAmount,
                insuranceValue,
                shippingOptions,
                notifyCustomer
            } = requestData;

            logger.info(`📦 AWB request: Order ${orderNumber}`);

            // Check if AWB already exists
            const existingAwb = await this._checkExistingAwb(order);
            if (existingAwb.exists) {
                logger.warn(`⚠️ AWB already exists: ${existingAwb.awbNumber}`);

                return res.status(409).json({
                    success: false,
                    error: 'AWB already created',
                    message: `Shipping label already exists for this order. AWB Number: ${existingAwb.awbNumber}`,
                    existingAwb: {
                        awbNumber: existingAwb.awbNumber,
                        createdAt: existingAwb.createdAt
                    }
                });
            }

            // Step 1: Create shipping label
            const labelResult = await this.createShippingLabelAction.execute({
                order,
                packageInfo,
                service,
                customShippingAddress,
                codAmount,
                insuranceValue,
                ...shippingOptions
            });

            if (!labelResult.success) {
                throw new Error(`Shipping label creation failed: ${labelResult.error}`);
            }

            // Step 2: Fulfill order in Shopify (non-blocking)
            let fulfillmentResult = null;
            try {
                fulfillmentResult = await this.fulfillOrderAction.execute({
                    orderId: numericOrderId,
                    awb: labelResult.awb,
                    notifyCustomer,
                    carrier: labelResult.carrier
                });

                if (!fulfillmentResult.success) {
                    logger.warn(`⚠️ Fulfillment failed, but AWB ${labelResult.trackingNumber} created`);
                }
            } catch (fulfillmentError) {
                logger.warn(`⚠️ Fulfillment error, but AWB ${labelResult.trackingNumber} created`);
            }

            // Step 3: Update Shopify order with shipping info (non-blocking)
            try {
                const additionalData = this._buildAdditionalData(requestData);
                
                await this.updateOrderAction.execute({
                    orderId: numericOrderId,
                    awb: labelResult.awb,
                    carrier: labelResult.carrier,
                    trackingUrl: labelResult.trackingUrl,
                    additionalData
                });
            } catch (updateError) {
                // Silent fail - AWB was still created
            }

            // Step 4: Prepare and send response
            const responseData = this._buildResponse(labelResult, fulfillmentResult, orderId);
            
            logger.info(`✅ AWB ${labelResult.trackingNumber} created for order ${orderNumber}`);

            res.json(responseData);

        } catch (error) {
            logger.error(`❌ AWB creation failed: ${error.message}`);

            res.status(500).json({
                success: false,
                error: 'Failed to create shipping label',
                details: error.message
            });
        }
    }

    /**
     * Handle Shopify fulfillment cancellation webhook
     * Cancels corresponding AWB in shipping provider
     */
    async handleFulfillmentCancellation(req, res) {
        // Always acknowledge webhook receipt first
        res.status(200).json({ received: true });
        
        try {
            const fulfillment = req.body;
            logger.info(`🚫 AWB cancellation: ${fulfillment.tracking_number || fulfillment.id}`);

            // Process cancellation using action
            const cancellationResult = await this.cancelAwbAction.processWebhookCancellation(fulfillment);

            if (cancellationResult.success) {
                if (!cancellationResult.skipped) {
                    await this.updateOrderAction.addCancellationInfo(
                        fulfillment.order_id, 
                        cancellationResult.awbBarcode
                    );
                    logger.info(`✅ AWB ${cancellationResult.awbBarcode} cancelled`);
                }
            } else {
                await this.updateOrderAction.markCancellationFailed(fulfillment.order_id);
                logger.error(`❌ AWB cancellation failed`);
            }

        } catch (error) {
            logger.error(`❌ Cancellation webhook error: ${error.message}`);
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Extract and structure request data
     * @private
     */
    _extractRequestData(body) {
        const { 
            orderId, 
            orderNumber, 
            carrier, 
            service, 
            package: packageInfo, 
            insurance, 
            insuranceValue, 
            customShippingAddress, 
            codAmount,
            openPackage,
            saturdayDelivery,
            morningDelivery,
            shipmentPayer,
            observations,
            envelopes,
            orderTotal,
            orderEmail,
            orderPhone,
            notifyCustomer = true
        } = body;

        // Extract numeric order ID from Shopify GID
        const numericOrderId = orderId ? orderId.split('/').pop() : null;

        // Create minimal order object from payload data
        const order = {
            id: numericOrderId,
            order_number: orderNumber,
            line_items: [], // We'll use package info instead
            total_price: orderTotal || insuranceValue || '0',
            email: orderEmail || customShippingAddress?.email || '',
            phone: orderPhone || customShippingAddress?.phone || ''
        };

        // Group shipping options
        const shippingOptions = {
            openPackage,
            saturdayDelivery,
            morningDelivery,
            shipmentPayer,
            observations,
            envelopes
        };

        return {
            orderId,
            orderNumber,
            numericOrderId,
            order,
            carrier,
            service,
            packageInfo,
            insurance,
            insuranceValue,
            customShippingAddress,
            codAmount,
            shippingOptions,
            orderTotal,
            orderEmail,
            orderPhone,
            notifyCustomer
        };
    }

    /**
     * Validate request data
     * @private
     */
    _validateRequestData({ orderId, orderNumber, numericOrderId }) {
        if (!orderId || !orderNumber) {
            return 'Order ID and order number are required';
        }

        if (!numericOrderId) {
            return 'Invalid order ID format';
        }

        return null; // No validation errors
    }

    /**
     * Build additional data object for order updates
     * @private
     */
    _buildAdditionalData({ 
        packageInfo, 
        service, 
        codAmount, 
        insuranceValue, 
        shippingOptions 
    }) {
        return {
            weight: packageInfo?.weight,
            length: packageInfo?.length,
            width: packageInfo?.width,
            height: packageInfo?.height,
            service,
            codAmount,
            insuranceValue,
            ...shippingOptions
        };
    }

    /**
     * Build response data
     * @private
     */
    _buildResponse(labelResult, fulfillmentResult, orderId) {
        const responseData = {
            success: true,
            trackingNumber: labelResult.trackingNumber,
            labelUrl: labelResult.trackingUrl,
            cost: labelResult.cost,
            awbId: labelResult.awbId,
            orderId: orderId,
            carrier: labelResult.carrier
        };

        // Add fulfillment data if successful
        if (fulfillmentResult && fulfillmentResult.success) {
            responseData.fulfillment = {
                id: fulfillmentResult.fulfillmentId,
                status: 'fulfilled',
                trackingUrl: fulfillmentResult.trackingUrl
            };
        }

        return responseData;
    }

    /**
     * Check if AWB already exists for an order
     * @private
     */
    async _checkExistingAwb(order) {
        try {
            // Check custom attributes (note_attributes) for AWB_NUMBER
            if (order.note_attributes && Array.isArray(order.note_attributes)) {
                const awbAttribute = order.note_attributes.find(attr => attr.name === 'AWB_NUMBER');
                
                if (awbAttribute && awbAttribute.value) {
                    return {
                        exists: true,
                        awbNumber: awbAttribute.value,
                        createdAt: null
                    };
                }
            }

            // Additional check: Look for fulfillments with tracking numbers
            if (order.fulfillments && order.fulfillments.length > 0) {
                const fulfillmentWithTracking = order.fulfillments.find(f => 
                    f.tracking_number && f.tracking_number.trim() !== ''
                );
                
                if (fulfillmentWithTracking) {
                    return {
                        exists: true,
                        awbNumber: fulfillmentWithTracking.tracking_number,
                        createdAt: fulfillmentWithTracking.created_at
                    };
                }
            }

            return {
                exists: false,
                awbNumber: null,
                createdAt: null
            };

        } catch (error) {
            // In case of error, assume no AWB exists to avoid blocking legitimate requests
            return {
                exists: false,
                awbNumber: null,
                createdAt: null
            };
        }
    }
}

export default new ShippingLabelController();