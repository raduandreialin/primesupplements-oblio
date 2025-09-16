import { AdapterFactory } from '../adapters/index.js';
import { logger } from '../utils/index.js';

/**
 * Action: Create Shipping Label
 * 
 * Handles the core business logic of creating shipping labels
 * with shipping providers through adapters.
 * 
 * Single Responsibility: AWB creation and validation
 */
export class CreateShippingLabelAction {
    constructor(shippingAdapter = null) {
        // Allow dependency injection for testing, default to Cargus
        this.shippingAdapter = shippingAdapter || 
            AdapterFactory.createAdapter(AdapterFactory.ADAPTERS.CARGUS);
    }

    /**
     * Execute shipping label creation
     * @param {Object} params - Shipping parameters
     * @returns {Promise<Object>} AWB result with tracking info
     */
    async execute({
        order,
        packageInfo,
        service,
        customShippingAddress,
        codAmount,
        insuranceValue,
        openPackage,
        saturdayDelivery,
        morningDelivery,
        shipmentPayer,
        observations,
        envelopes
    }) {
        try {
            logger.info({ 
                orderId: order.id, 
                service, 
                packageInfo: {
                    weight: packageInfo?.weight,
                    dimensions: `${packageInfo?.length}x${packageInfo?.width}x${packageInfo?.height}`
                }
            }, 'Starting shipping label creation');

            // Convert order to AWB data format
            const awbData = await this.shippingAdapter.convertOrderToAwbData(
                order,
                packageInfo,
                service,
                customShippingAddress,
                codAmount,
                insuranceValue,
                openPackage,
                saturdayDelivery,
                morningDelivery,
                shipmentPayer,
                observations,
                envelopes
            );

            this._logAwbDataSummary(awbData, order.id);

            // Create AWB with shipping provider
            const awb = await this.shippingAdapter.createAwb(awbData);

            const result = {
                success: true,
                awb,
                trackingNumber: awb.BarCode || 'N/A',
                trackingUrl: this.shippingAdapter.getTrackingUrl(awb.BarCode || 'N/A'),
                cost: this._extractCost(awb),
                awbId: this._extractAwbId(awb),
                carrier: this.shippingAdapter.getCarrierName(),
                rawAwbData: awbData
            };

            logger.info({
                orderId: order.id,
                trackingNumber: result.trackingNumber,
                carrier: result.carrier,
                cost: result.cost
            }, 'Shipping label created successfully');

            return result;

        } catch (error) {
            logger.error({
                orderId: order.id,
                error: error.message,
                stack: error.stack,
                packageInfo,
                service
            }, 'Failed to create shipping label');

            throw new Error(`Shipping label creation failed: ${error.message}`);
        }
    }

    /**
     * Log AWB data summary for debugging
     * @private
     */
    _logAwbDataSummary(awbData, orderId) {
        logger.info({
            orderId,
            awbDataSummary: {
                parcels: awbData.parcels,
                envelopes: awbData.envelopes,
                totalWeight: awbData.totalWeight,
                parcelCodesCount: awbData.parcelCodes?.length,
                expectedParcelCodes: awbData.parcels + awbData.envelopes,
                serviceId: awbData.serviceId,
                recipient: {
                    name: awbData.recipient?.Name,
                    county: awbData.recipient?.CountyName,
                    city: awbData.recipient?.LocalityName
                }
            }
        }, 'AWB data conversion completed');
    }

    /**
     * Extract cost from AWB response (handles different response formats)
     * @private
     */
    _extractCost(awb) {
        return awb.Cost || 
               awb.TotalCost || 
               awb.GrandTotal || 
               awb.Price || 
               awb.Total || 
               awb.Amount || 
               'Contact courier for pricing';
    }

    /**
     * Extract AWB ID from response (handles different response formats)
     * @private
     */
    _extractAwbId(awb) {
        return awb.AwbId || 
               awb.Id || 
               awb.awbId || 
               awb.OrderId || 
               awb.TrackingId || 
               'Generated';
    }
}

export default CreateShippingLabelAction;
