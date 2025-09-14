import CargusService from '../services/CargusService.js';
import ShopifyService from '../services/ShopifyService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

class ShippingLabelController {
    constructor() {
        this.cargusService = new CargusService(
            config.cargus.subscriptionKey,
            config.cargus.username,
            config.cargus.password
        );
        this.shopifyService = new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
    }

    /**
     * Create shipping label from extension with custom package details
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
                orderPhone
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
            // We don't need to fetch from Shopify since we have all the data we need
            const order = {
                id: numericOrderId,
                order_number: orderNumber,
                line_items: [], // We'll use package info instead
                total_price: orderTotal || insuranceValue || '0',
                email: orderEmail || customShippingAddress?.email || '',
                phone: orderPhone || customShippingAddress?.phone || ''
            };
            
            logger.info({ orderId: order.id, orderNumber: order.order_number }, 'Using order data from extension payload');

            // Convert Shopify order to Cargus AWB data with custom package info and address
            logger.info('Converting order to Cargus AWB data');
            let awbData;
            try {
                awbData = await this.convertShopifyOrderToAwbWithCustomPackage(
                    order, 
                    packageInfo, 
                    carrier, 
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
                    parcelCodes: awbData.parcelCodes?.map(pc => ({ 
                        Code: pc.Code, 
                        Weight: pc.Weight, 
                        Type: pc.Type,
                        ParcelContent: pc.ParcelContent
                    }))
                }
            }, 'Successfully converted to AWB data');
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
            
            // Create AWB with Cargus
            logger.info('Creating AWB with Cargus');
            let awb;
            try {
                awb = await this.cargusService.createAwbWithPickup(awbData);
                logger.info({ awb }, 'Successfully created AWB with Cargus');
            } catch (cargusError) {
                logger.error({ 
                    error: cargusError.message, 
                    stack: cargusError.stack,
                    awbData
                }, 'Failed to create AWB with Cargus');
                throw cargusError;
            }
            
            // Update Shopify order with shipping info
            logger.info('Updating Shopify order with shipping info');
            try {
                await this.updateShopifyOrderWithShippingInfo(numericOrderId, awb);
                logger.info('Successfully updated Shopify order');
            } catch (updateError) {
                logger.error({ 
                    error: updateError.message, 
                    stack: updateError.stack,
                    numericOrderId,
                    awb
                }, 'Failed to update Shopify order with shipping info');
                // Don't throw here - we still want to return the AWB data even if Shopify update fails
            }

            logger.info({ 
                orderId, 
                awbBarcode: awb.BarCode,
                awbId: awb.AwbId 
            }, 'Shipping label created successfully from extension');

            res.json({
                success: true,
                trackingNumber: awb.BarCode,
                labelUrl: `https://urgentcargus.ro/tracking-colet/${awb.BarCode}`,
                cost: awb.Cost || 'N/A',
                awbId: awb.AwbId,
                orderId: orderId
            });

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
     * Create shipping label from Shopify order
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async createFromShopifyOrder(req, res) {
        try {
            const { orderId } = req.body;
            
            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'Order ID is required'
                });
            }

            logger.info({ orderId }, 'Creating shipping label for Shopify order');

            // Get Shopify order details
            const order = await this.shopifyService.getOrder(orderId);
            
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Order not found'
                });
            }

            // Convert Shopify order to Cargus AWB data
            const awbData = await this.convertShopifyOrderToAwb(order);
            
            // Create AWB with Cargus
            const awb = await this.cargusService.createAwbWithPickup(awbData);
            
            // Update Shopify order with shipping info
            await this.updateShopifyOrderWithShippingInfo(orderId, awb);

            logger.info({ 
                orderId, 
                awbBarcode: awb.BarCode,
                awbId: awb.AwbId 
            }, 'Shipping label created successfully');

            res.json({
                success: true,
                data: {
                    awbBarcode: awb.BarCode,
                    awbId: awb.AwbId,
                    trackingUrl: `https://urgentcargus.ro/tracking-colet/${awb.BarCode}`,
                    orderId: orderId
                }
            });

        } catch (error) {
            logger.error({ 
                orderId: req.body?.orderId,
                error: error.message,
                stack: error.stack
            }, 'Failed to create shipping label');

            res.status(500).json({
                success: false,
                error: 'Failed to create shipping label',
                details: error.message
            });
        }
    }


    // ==================== HELPER METHODS ====================

    /**
     * Convert Shopify order to Cargus AWB data
     * @param {Object} order - Shopify order object
     * @returns {Object} Cargus AWB data
     */
    async convertShopifyOrderToAwb(order) {
        const shippingAddress = order.shipping_address;
        const billingAddress = order.billing_address;
        const address = shippingAddress || billingAddress;

        if (!address) {
            throw new Error('No shipping or billing address found in order');
        }

        // Calculate total weight (you might want to get this from product data)
        const totalWeight = order.line_items.reduce((sum, item) => {
            // Assume 0.5kg per item if no weight specified
            const itemWeight = item.grams ? item.grams / 1000 : 0.5;
            return sum + (itemWeight * item.quantity);
        }, 0);

        return {
            pickupStartDate: this.getDefaultPickupStart(),
            pickupEndDate: this.getDefaultPickupEnd(),
            sender: {
                Name: "Your Company Name", // Configure this
                CountyName: "Bucuresti", // Configure this
                LocalityName: "Bucuresti", // Configure this
                AddressText: "Your Company Address", // Configure this
                ContactPerson: "Contact Person", // Configure this
                PhoneNumber: "0723000000", // Configure this
                CodPostal: "010101", // Configure this
                Email: "contact@yourcompany.com" // Configure this
            },
            recipient: {
                Name: `${address.first_name} ${address.last_name}`,
                CountyName: this.mapProvinceToCounty(address.province),
                LocalityName: address.city,
                AddressText: `${address.address1} ${address.address2 || ''}`.trim(),
                ContactPerson: `${address.first_name} ${address.last_name}`,
                PhoneNumber: address.phone || order.phone || "0700000000",
                CodPostal: address.zip,
                Email: order.email
            },
            parcels: order.line_items.length,
            totalWeight: Math.max(totalWeight, 0.1), // Minimum 0.1kg
            serviceId: CargusService.getServiceIdByWeight(totalWeight),
            declaredValue: parseFloat(order.total_price),
            cashRepayment: order.financial_status === 'pending' ? parseFloat(order.total_price) : 0,
            observations: `Shopify Order #${order.order_number}`,
            packageContent: order.line_items.map(item => item.name).join(', ').substring(0, 100),
            parcelCodes: order.line_items.map((item, index) => ({
                Code: index.toString(),
                Type: 1,
                Weight: item.grams ? item.grams / 1000 : 0.5,
                Length: 20,
                Width: 15,
                Height: 10,
                ParcelContent: item.name.substring(0, 50)
            }))
        };
    }

    /**
     * Convert Shopify order to Cargus AWB data with custom package information
     * @param {Object} order - Shopify order object
     * @param {Object} packageInfo - Custom package information from extension
     * @param {string} carrier - Selected carrier (currently only Cargus supported)
     * @param {string} service - Selected service type
     * @param {Object} customShippingAddress - Custom shipping address from extension
     * @param {string} codAmount - Cash on Delivery amount from extension
     * @param {string} insuranceValue - Insurance value from extension
     * @param {boolean} openPackage - Allow recipient to open package before payment
     * @param {boolean} saturdayDelivery - Saturday delivery option
     * @param {boolean} morningDelivery - Morning delivery option
     * @param {string} shipmentPayer - Who pays for shipping (1: sender, 2: recipient)
     * @param {string} observations - Custom notes/observations
     * @param {number} envelopes - Number of envelopes
     * @returns {Object} Cargus AWB data
     */
    async convertShopifyOrderToAwbWithCustomPackage(order, packageInfo, carrier, service, customShippingAddress, codAmount, insuranceValue, openPackage, saturdayDelivery, morningDelivery, shipmentPayer, observations, envelopes) {
        // Use custom shipping address if provided, otherwise fall back to order address
        let address;
        if (customShippingAddress && customShippingAddress.firstName) {
            address = customShippingAddress;
        } else {
            const shippingAddress = order.shipping_address;
            const billingAddress = order.billing_address;
            address = shippingAddress || billingAddress;
        }

        if (!address) {
            throw new Error('No shipping address found');
        }

        // Use custom package weight from payload
        const totalWeight = packageInfo?.weight || 1.0; // Default to 1kg if not provided

        // Map service type to Cargus service ID
        const serviceId = this.mapServiceToCargusId(service, totalWeight);

        return {
            pickupStartDate: this.getDefaultPickupStart(),
            pickupEndDate: this.getDefaultPickupEnd(),
            sender: {
                Name: "Prime Supplements", // Configure this
                CountyName: "Bucuresti", // Configure this
                LocalityName: "Bucuresti", // Configure this
                AddressText: "Your Company Address", // Configure this
                ContactPerson: "Contact Person", // Configure this
                PhoneNumber: "0723000000", // Configure this
                CodPostal: "010101", // Configure this
                Email: "contact@primesupplements.ro" // Configure this
            },
            recipient: {
                Name: `${address.firstName || address.first_name} ${address.lastName || address.last_name}`,
                CountyName: this.mapProvinceToCounty(address.province),
                LocalityName: address.city,
                AddressText: `${address.address1} ${address.address2 || ''}`.trim(),
                ContactPerson: `${address.firstName || address.first_name} ${address.lastName || address.last_name}`,
                PhoneNumber: address.phone || order.phone || "0700000000",
                CodPostal: address.zip,
                Email: address.email || order.email
            },
            parcels: (() => {
                const envelopeCount = Math.max(envelopes || 0, 0);
                return envelopeCount > 0 ? envelopeCount : 1;
            })(), // Number of parcels matches envelopes or defaults to 1
            envelopes: envelopes || 0,
            totalWeight: Math.max(totalWeight, 0.1), // Minimum 0.1kg
            serviceId: serviceId,
            declaredValue: insuranceValue ? parseFloat(insuranceValue) : parseFloat(order.total_price),
            cashRepayment: codAmount ? parseFloat(codAmount) : 0,
            openPackage: openPackage || false,
            saturdayDelivery: saturdayDelivery || false,
            morningDelivery: morningDelivery || false,
            shipmentPayer: parseInt(shipmentPayer) || 1,
            observations: observations || `Shopify Order #${order.order_number} - Created via Extension`,
            packageContent: `Order #${order.order_number} - Package`,
            parcelCodes: (() => {
                // If envelopes > 0, create one parcel code per envelope
                // If envelopes = 0, create one parcel code for the package
                const envelopeCount = Math.max(envelopes || 0, 0);
                const parcelCount = envelopeCount > 0 ? envelopeCount : 1;
                
                return Array.from({ length: parcelCount }, (_, index) => ({
                    Code: String(index), // Start from 0 as per Cargus documentation
                    Type: 1,
                    Weight: Math.max(totalWeight / parcelCount, 0.1), // Distribute weight across parcels
                    Length: packageInfo?.length || 20,
                    Width: packageInfo?.width || 15,
                    Height: packageInfo?.height || 10,
                    ParcelContent: envelopeCount > 0 
                        ? `Order #${order.order_number} - Envelope ${index + 1}`
                        : `Order #${order.order_number} - Package`
                }));
            })()
        };
    }

    /**
     * Map service type to Cargus service ID
     * @param {string} service - Service type from extension
     * @param {number} weight - Package weight
     * @returns {number} Cargus service ID
     */
    mapServiceToCargusId(service, weight) {
        // For now, use the existing weight-based logic from CargusService
        // You can expand this to handle different service types
        switch (service) {
            case 'express':
                return 1; // Express service
            case 'overnight':
                return 2; // Overnight if available
            case '2day':
                return 3; // 2-day service if available
            case 'ground':
            default:
                return CargusService.getServiceIdByWeight(weight);
        }
    }

    /**
     * Update Shopify order with shipping information
     * @param {string} orderId - Shopify order ID
     * @param {Object} awb - Cargus AWB response
     */
    async updateShopifyOrderWithShippingInfo(orderId, awb) {
        const metafields = [
            {
                namespace: 'shipping',
                key: 'awb_barcode',
                value: awb.BarCode,
                type: 'single_line_text_field'
            },
            {
                namespace: 'shipping',
                key: 'awb_id',
                value: awb.AwbId.toString(),
                type: 'single_line_text_field'
            },
            {
                namespace: 'shipping',
                key: 'tracking_url',
                value: `https://urgentcargus.ro/tracking-colet/${awb.BarCode}`,
                type: 'url'
            },
            {
                namespace: 'shipping',
                key: 'courier_service',
                value: 'Cargus',
                type: 'single_line_text_field'
            }
        ];

        await this.shopifyService.updateOrderMetafields(orderId, metafields);
        
        // Add shipping tag
        await this.shopifyService.tagOrder(orderId, 'SHIPPING_LABEL_CREATED');
    }

    /**
     * Map Shopify province to Romanian county
     * @param {string} province - Shopify province
     * @returns {string} Romanian county name
     */
    mapProvinceToCounty(province) {
        const mapping = {
            'Bucuresti': 'Bucuresti',
            'Alba': 'Alba',
            'Arad': 'Arad',
            'Arges': 'Arges',
            'Bacau': 'Bacau',
            'Bihor': 'Bihor',
            'Bistrita-Nasaud': 'Bistrita-Nasaud',
            'Botosani': 'Botosani',
            'Braila': 'Braila',
            'Brasov': 'Brasov',
            'Buzau': 'Buzau',
            'Calarasi': 'Calarasi',
            'Caras-Severin': 'Caras-Severin',
            'Cluj': 'Cluj',
            'Constanta': 'Constanta',
            'Covasna': 'Covasna',
            'Dambovita': 'Dambovita',
            'Dolj': 'Dolj',
            'Galati': 'Galati',
            'Giurgiu': 'Giurgiu',
            'Gorj': 'Gorj',
            'Harghita': 'Harghita',
            'Hunedoara': 'Hunedoara',
            'Ialomita': 'Ialomita',
            'Iasi': 'Iasi',
            'Ilfov': 'Ilfov',
            'Maramures': 'Maramures',
            'Mehedinti': 'Mehedinti',
            'Mures': 'Mures',
            'Neamt': 'Neamt',
            'Olt': 'Olt',
            'Prahova': 'Prahova',
            'Salaj': 'Salaj',
            'Satu-Mare': 'Satu-Mare',
            'Sibiu': 'Sibiu',
            'Suceava': 'Suceava',
            'Teleorman': 'Teleorman',
            'Timis': 'Timis',
            'Tulcea': 'Tulcea',
            'Valcea': 'Valcea',
            'Vaslui': 'Vaslui',
            'Vrancea': 'Vrancea'
        };

        return mapping[province] || province || 'Bucuresti';
    }

    /**
     * Get default pickup start time (next business day 9 AM)
     * @returns {string} ISO datetime string
     */
    getDefaultPickupStart() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
    }

    /**
     * Get default pickup end time (next business day 5 PM)
     * @returns {string} ISO datetime string
     */
    getDefaultPickupEnd() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(17, 0, 0, 0);
        return tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
    }

}

export default new ShippingLabelController();