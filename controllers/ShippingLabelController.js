import { AdapterFactory } from '../adapters/index.js';
import ShopifyService from '../services/ShopifyService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

class ShippingLabelController {
    constructor() {
        // Default to Cargus adapter, but this can be made configurable
        this.shippingAdapter = AdapterFactory.createAdapter(AdapterFactory.ADAPTERS.CARGUS);
        this.shopifyService = new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
    }

    /**
     * Create shipping label from extension with custom package details and fulfill the order
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async createFromExtension(req, res) {
        try {
            logger.info({ body: req.body }, 'Received shipping label request from extension');
            
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
            } = req.body;
            
            if (!orderId || !orderNumber) {
                logger.warn({ orderId, orderNumber }, 'Missing required fields');
                return res.status(400).json({
                    success: false,
                    error: 'Order ID and order number are required'
                });
            }

            logger.info({ orderId, orderNumber, carrier, service, packageInfo, customShippingAddress }, 'Creating shipping label from extension');

            // Extract numeric order ID from Shopify GID
            const numericOrderId = orderId.split('/').pop();
            logger.info({ numericOrderId }, 'Extracted numeric order ID');

            // Create a minimal order object from the payload data
            const order = {
                id: numericOrderId,
                order_number: orderNumber,
                line_items: [], // We'll use package info instead
                total_price: orderTotal || insuranceValue || '0',
                email: orderEmail || customShippingAddress?.email || '',
                phone: orderPhone || customShippingAddress?.phone || ''
            };
            
            logger.info({ orderId: order.id, orderNumber: order.order_number }, 'Using order data from extension payload');

            // Convert Shopify order to shipping provider AWB data with custom package info and address
            logger.info('Converting order to shipping provider AWB data');
            let awbData;
            try {
                awbData = await this.shippingAdapter.convertOrderToAwbData(
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
                logger.info({ 
                    awbData: {
                        parcels: awbData.parcels,
                        envelopes: awbData.envelopes,
                        totalWeight: awbData.totalWeight,
                        parcelCodesCount: awbData.parcelCodes?.length,
                        expectedParcelCodes: awbData.parcels + awbData.envelopes,
                        parcelCodes: awbData.parcelCodes?.map(pc => ({ 
                            Code: pc.Code, 
                            Weight: pc.Weight, 
                            Type: pc.Type,
                            ParcelContent: pc.ParcelContent
                        }))
                    }
                }, 'Successfully converted to AWB data - parcelCodes should equal parcels + envelopes');
            } catch (conversionError) {
                logger.error({ 
                    error: conversionError.message, 
                    stack: conversionError.stack,
                    orderId: order.id,
                    packageInfo,
                    customShippingAddress
                }, 'Failed to convert order to AWB data');
                throw conversionError;
            }
            
            // Create AWB with shipping provider
            let awb;
            try {
                awb = await this.shippingAdapter.createAwb(awbData);
            } catch (shippingError) {
                logger.error({ 
                    error: shippingError.message, 
                    stack: shippingError.stack,
                    statusCode: shippingError.response?.status,
                    responseData: shippingError.response?.data,
                    awbDataSummary: {
                        parcels: awbData.parcels,
                        envelopes: awbData.envelopes,
                        totalWeight: awbData.totalWeight,
                        parcelCodesCount: awbData.parcelCodes?.length,
                        serviceId: awbData.serviceId,
                        recipient: {
                            name: awbData.recipient?.Name,
                            county: awbData.recipient?.CountyName,
                            city: awbData.recipient?.LocalityName
                        }
                    }
                }, 'Failed to create AWB with shipping provider - detailed error info');
                throw shippingError;
            }
            
            // Fulfill the order in Shopify with shipping tracking
            logger.info('Fulfilling order in Shopify with shipping tracking');
            let fulfillmentResult;
            try {
                fulfillmentResult = await this.shopifyService.fulfillOrderWithCargus(numericOrderId, awb, notifyCustomer);
                logger.info({
                    orderId: numericOrderId,
                    fulfillmentId: fulfillmentResult.fulfillmentId,
                    awbBarcode: fulfillmentResult.awbBarcode,
                    trackingUrl: fulfillmentResult.trackingUrl
                }, 'Order fulfilled successfully with shipping provider');
            } catch (fulfillmentError) {
                logger.error({
                    error: fulfillmentError.message,
                    stack: fulfillmentError.stack,
                    numericOrderId,
                    awb
                }, 'Failed to fulfill order in Shopify, but AWB was created successfully');
                // Don't throw here - we still want to return the AWB data even if fulfillment fails
                // The user can manually fulfill or we can retry later
            }

            // Update Shopify order with additional shipping info
            logger.info('Updating Shopify order with shipping info');
            try {
                const additionalData = {
                    weight: awbData.totalWeight,
                    length: packageInfo?.length,
                    width: packageInfo?.width,
                    height: packageInfo?.height,
                    service: service,
                    codAmount: codAmount,
                    insuranceValue: insuranceValue,
                    envelopes: envelopes,
                    openPackage: openPackage,
                    saturdayDelivery: saturdayDelivery,
                    morningDelivery: morningDelivery,
                    shipmentPayer: shipmentPayer,
                    observations: observations
                };

                await this.updateShopifyOrderWithShippingInfo(numericOrderId, awb, additionalData);
                logger.info('Successfully updated Shopify order with shipping info');
            } catch (updateError) {
                logger.error({
                    error: updateError.message,
                    stack: updateError.stack,
                    numericOrderId,
                    awb
                }, 'Failed to update Shopify order with shipping info');
                // Don't throw here - we still want to return the AWB data even if update fails
            }

            // Prepare response data
            const responseData = {
                success: true,
                trackingNumber: awb.BarCode || 'N/A',
                labelUrl: this.shippingAdapter.getTrackingUrl(awb.BarCode || 'N/A'),
                cost: awb.Cost || awb.TotalCost || awb.GrandTotal || awb.Price || awb.Total || awb.Amount || 'Contact courier for pricing',
                awbId: awb.AwbId || awb.Id || awb.awbId || awb.OrderId || awb.TrackingId || 'Generated',
                orderId: orderId,
                carrier: this.shippingAdapter.getCarrierName()
            };

            // Add fulfillment data if successful
            if (fulfillmentResult) {
                responseData.fulfillment = {
                    id: fulfillmentResult.fulfillmentId,
                    status: 'fulfilled',
                    trackingUrl: fulfillmentResult.trackingUrl
                };
            }

            logger.info({
                orderId,
                awbBarcode: awb.BarCode,
                awbId: awb.AwbId || awb.Id || awb.awbId || awb.OrderId || 'N/A',
                fulfillmentId: fulfillmentResult?.fulfillmentId || 'N/A',
                responseToFrontend: responseData,
                rawAwbFields: {
                    BarCode: awb.BarCode,
                    Cost: awb.Cost,
                    TotalCost: awb.TotalCost,
                    GrandTotal: awb.GrandTotal,
                    AwbId: awb.AwbId,
                    Id: awb.Id
                }
            }, 'Shipping label created and order fulfilled successfully - Response Debug');

            res.json(responseData);

        } catch (error) {
            logger.error({ 
                orderId: req.body?.orderId,
                error: error.message,
                stack: error.stack
            }, 'Failed to create shipping label from extension');

            res.status(500).json({
                success: false,
                error: 'Failed to create shipping label',
                details: error.message
            });
        }
    }

    /**
     * Update Shopify order with shipping information
     * @param {string} orderId - Shopify order ID
     * @param {Object} awb - Cargus AWB response
     * @param {Object} additionalData - Additional shipping data
     */
    async updateShopifyOrderWithShippingInfo(orderId, awb, additionalData = {}) {
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
                value: this.shippingAdapter.getCarrierName(),
                type: 'single_line_text_field'
            },
            {
                namespace: 'shipping',
                key: 'tracking_url',
                value: this.shippingAdapter.getTrackingUrl(awb.BarCode || 'N/A'),
                type: 'url'
            }
        ];

        await this.shopifyService.updateOrderMetafields(orderId, metafields);

        // Add shipping tags for better organization
        const tags = [
            'SHIPPING_LABEL_CREATED',
            `${this.shippingAdapter.getCarrierName().toUpperCase()}_SHIPMENT`
        ];

        for (const tag of tags) {
            await this.shopifyService.tagOrder(orderId, tag);
        }
    }
}

export default new ShippingLabelController();