import Shopify from "shopify-api-node";
import config from "../config/AppConfig.js";
import { logger } from "../utils/index.js";
import { GET_ORDER_WITH_FULFILLMENT_ORDERS, FIND_UNFULFILLED_ORDERS } from "../graphql/queries.js";
import { ORDER_UPDATE, ORDER_UPDATE_CUSTOM_ATTRIBUTES, FULFILLMENT_CREATE_V2, METAFIELDS_SET } from "../graphql/mutations.js";

export default class ShopifyService {
    constructor(shopName, accessToken) {
        this.validate(shopName, accessToken);
        this.shopify = new Shopify({
            shopName: shopName,
            accessToken: accessToken,
            apiVersion: config.shopify.apiVersion,
            maxRetries: config.shopify.maxRetries,
        });
    }

    validate(shopName, accessToken) {
        if (!shopName || !accessToken) {
            throw new Error("Shop name and access token are required");
        }
        this.shopName = shopName;
        this.accessToken = accessToken;
    }

    /**
     * Convert orderId to GraphQL ID format if needed
     * @param {string|number} orderId - Order ID in any format
     * @returns {string} GraphQL formatted order ID
     */
    toGraphQLOrderId(orderId) {
        const orderIdStr = orderId.toString();
        return orderIdStr.startsWith('gid://shopify/Order/') 
            ? orderIdStr 
            : `gid://shopify/Order/${orderIdStr}`;
    }

    async client() {
        return this.shopify;
    }

    async graphQLQuery(query, variables = {}) {
        return this.shopify.graphql(query, variables);
    }

    /**
     * Add tags to a Shopify order
     * @param {string|number} orderId - Shopify order ID
     * @param {string|array} tags - Tags to add (string or array of strings)
     * @returns {Promise<Object>} Updated order object
     */
    async tagOrder(orderId, tags) {
        try {
            // Convert tags to string if array
            const tagsString = Array.isArray(tags) ? tags.join(', ') : tags;
            
            // Extract numeric ID for REST API
            const numericOrderId = orderId.toString().includes('gid://shopify/Order/') 
                ? orderId.replace('gid://shopify/Order/', '') 
                : orderId;
            
            // Get current order to preserve existing tags
            const currentOrder = await this.shopify.order.get(numericOrderId);
            const existingTags = currentOrder.tags || '';
            
            // Replace tags completely (don't merge) to have full control
            const finalTags = Array.isArray(tags) ? tags.join(', ') : tags;
            
            // Update order with new tags
            const updatedOrder = await this.shopify.order.update(numericOrderId, {
                tags: finalTags
            });
            
            logger.info({ 
                orderId: numericOrderId, 
                newTags: finalTags, 
                previousTags: existingTags 
            }, 'Order tags updated successfully');
            
            return updatedOrder;
            
        } catch (error) {
            logger.error({ 
                orderId, 
                tags, 
                error: error.message,
                stack: error.stack 
            }, 'Failed to update order tags');
            throw error;
        }
    }

    /**
     * Get order by ID
     * @param {string|number} orderId - Shopify order ID
     * @returns {Promise<Object>} Order object
     */
    async getOrder(orderId) {
        try {
            // Extract numeric ID for REST API
            const numericOrderId = orderId.toString().includes('gid://shopify/Order/') 
                ? orderId.replace('gid://shopify/Order/', '') 
                : orderId;
                
            return await this.shopify.order.get(numericOrderId);
        } catch (error) {
            logger.error({ orderId, error: error.message }, 'Failed to get order');
            throw error;
        }
    }

    /**
     * Update order metafields using GraphQL
     * @param {string|number} orderId - Shopify order ID
     * @param {Array} metafields - Array of metafield objects
     * @returns {Promise<Object>} Updated order object
     */
    async updateOrderMetafields(orderId, metafields) {
        try {
            // Convert orderId to GraphQL ID format if needed
            const gqlOrderId = this.toGraphQLOrderId(orderId);
            
            const mutation = ORDER_UPDATE;
            
            const variables = {
                input: {
                    id: gqlOrderId,
                    metafields: metafields
                }
            };
            
            logger.info({
                orderId: gqlOrderId,
                metafieldCount: metafields.length,
                metafields: metafields
            }, 'Sending metafields update to Shopify GraphQL API');

            const response = await this.graphQLQuery(mutation, variables);
            
            logger.info({
                orderId: gqlOrderId,
                response: response
            }, 'Received GraphQL response for metafields update');

            // shopify-api-node returns the data object directly, not wrapped in { data }
            const orderUpdate = response.orderUpdate || response?.data?.orderUpdate;

            if (!orderUpdate) {
                logger.error({
                    orderId: gqlOrderId,
                    response: response,
                    responseKeys: Object.keys(response || {})
                }, 'Unexpected GraphQL response shape: missing orderUpdate');
                throw new Error('Unexpected GraphQL response shape: missing orderUpdate');
            }

            if (Array.isArray(orderUpdate.userErrors) && orderUpdate.userErrors.length > 0) {
                logger.error({
                    orderId: gqlOrderId,
                    userErrors: orderUpdate.userErrors
                }, 'GraphQL metafields update returned user errors');
                throw new Error(`GraphQL errors: ${JSON.stringify(orderUpdate.userErrors)}`);
            }
            
            logger.info({ orderId, metafields: metafields.map(m => `${m.namespace}.${m.key}`) }, 'Order metafields updated successfully');
            
            return orderUpdate.order;
            
        } catch (error) {
            logger.error({ orderId, metafields, error: error.message }, 'Failed to update order metafields');
            throw error;
        }
    }

    /**
     * Set metafields using the metafieldsSet mutation (newer approach)
     * @param {string|number} orderId - Shopify order ID
     * @param {Array} metafields - Array of metafield objects
     * @returns {Promise<Object>} Metafields set result
     */
    async setOrderMetafields(orderId, metafields) {
        try {
            // Convert orderId to GraphQL ID format if needed
            const gqlOrderId = this.toGraphQLOrderId(orderId);
            
            // Transform metafields for metafieldsSet mutation
            const metafieldsInput = metafields.map(metafield => ({
                ownerId: gqlOrderId,
                namespace: metafield.namespace,
                key: metafield.key,
                value: metafield.value,
                type: metafield.type
            }));
            
            logger.info({
                orderId: gqlOrderId,
                metafieldCount: metafieldsInput.length,
                metafields: metafieldsInput
            }, 'Setting metafields using metafieldsSet mutation');

            const mutation = METAFIELDS_SET;
            const variables = {
                metafields: metafieldsInput
            };
            
            const response = await this.graphQLQuery(mutation, variables);
            
            logger.info({
                orderId: gqlOrderId,
                response: response
            }, 'Received GraphQL response for metafieldsSet');

            const metafieldsSet = response.metafieldsSet || response?.data?.metafieldsSet;

            if (!metafieldsSet) {
                logger.error({
                    orderId: gqlOrderId,
                    response: response,
                    responseKeys: Object.keys(response || {})
                }, 'Unexpected GraphQL response shape: missing metafieldsSet');
                throw new Error('Unexpected GraphQL response shape: missing metafieldsSet');
            }

            if (Array.isArray(metafieldsSet.userErrors) && metafieldsSet.userErrors.length > 0) {
                logger.error({
                    orderId: gqlOrderId,
                    userErrors: metafieldsSet.userErrors
                }, 'MetafieldsSet mutation returned user errors');
                throw new Error(`GraphQL errors: ${JSON.stringify(metafieldsSet.userErrors)}`);
            }
            
            logger.info({ 
                orderId, 
                createdMetafields: metafieldsSet.metafields?.length || 0,
                metafields: metafieldsSet.metafields?.map(m => `${m.namespace}.${m.key}`) || []
            }, 'Order metafields set successfully using metafieldsSet');
            
            return metafieldsSet.metafields;
            
        } catch (error) {
            logger.error({ orderId, metafields, error: error.message }, 'Failed to set order metafields');
            throw error;
        }
    }

    /**
     * Set invoice success metafields on order
     * @param {string|number} orderId - Shopify order ID
     * @param {string} invoiceNumber - Invoice number
     * @param {string} invoiceUrl - Invoice URL (must start with https://)
     * @returns {Promise<Object>} Updated order object
     */
    async setInvoiceMetafields(orderId, invoiceNumber, invoiceUrl, invoiceSeries) {
        // Ensure URL starts with https://
        if (!invoiceUrl.startsWith('https://')) {
            invoiceUrl = `https://${invoiceUrl.replace(/^https?:\/\//, '')}`;
        }
        
        const metafields = [
            {
                namespace: 'custom',
                key: 'invoice_number',
                value: invoiceNumber,
                type: 'single_line_text_field'
            },
            {
                namespace: 'custom',
                key: 'invoice_series',
                value: invoiceSeries || '',
                type: 'single_line_text_field'
            },
            {
                namespace: 'custom',
                key: 'invoice_url',
                value: invoiceUrl,
                type: 'url'
            }
        ];
        
        return await this.updateOrderMetafields(orderId, metafields);
    }

    /**
     * Set error metafield on order
     * @param {string|number} orderId - Shopify order ID
     * @param {string} errorMessage - Error message
     * @returns {Promise<Object>} Updated order object
     */
    async setErrorMetafield(orderId, errorMessage) {
        const metafields = [
            {
                namespace: 'custom',
                key: 'error_message',
                value: errorMessage,
                type: 'multi_line_text_field'
            }
        ];
        
        return await this.updateOrderMetafields(orderId, metafields);
    }

    /**
     * Update order custom attributes using GraphQL
     * @param {string|number} orderId - Shopify order ID
     * @param {Array} customAttributes - Array of custom attribute objects with key and value
     * @returns {Promise<Object>} Updated order object
     */
    async updateOrderCustomAttributes(orderId, customAttributes) {
        try {
            // Convert orderId to GraphQL ID format if needed
            const gqlOrderId = this.toGraphQLOrderId(orderId);
            
            const mutation = ORDER_UPDATE_CUSTOM_ATTRIBUTES;
            
            const variables = {
                input: {
                    id: gqlOrderId,
                    customAttributes: customAttributes
                }
            };
            
            const response = await this.graphQLQuery(mutation, variables);
            const orderUpdate = response.orderUpdate || response?.data?.orderUpdate;

            if (!orderUpdate) {
                throw new Error('Unexpected GraphQL response shape: missing orderUpdate');
            }

            if (Array.isArray(orderUpdate.userErrors) && orderUpdate.userErrors.length > 0) {
                throw new Error(`GraphQL errors: ${JSON.stringify(orderUpdate.userErrors)}`);
            }
            
            logger.info({ 
                orderId, 
                customAttributes: customAttributes.map(attr => `${attr.key}: ${attr.value}`) 
            }, 'Order custom attributes updated successfully');
            
            return orderUpdate.order;
            
        } catch (error) {
            logger.error({ orderId, customAttributes, error: error.message }, 'Failed to update order custom attributes');
            throw error;
        }
    }

    /**
     * Get current order custom attributes
     * @param {string|number} orderId - Shopify order ID
     * @returns {Promise<Array>} Array of existing custom attributes
     */
    async getOrderCustomAttributes(orderId) {
        try {
            const gqlOrderId = this.toGraphQLOrderId(orderId);
            
            const query = `
                query GetOrderCustomAttributes($id: ID!) {
                    order(id: $id) {
                        id
                        customAttributes {
                            key
                            value
                        }
                    }
                }
            `;
            
            const variables = { id: gqlOrderId };
            const response = await this.graphQLQuery(query, variables);
            
            if (!response.order) {
                throw new Error(`Order ${orderId} not found`);
            }
            
            return response.order.customAttributes || [];
            
        } catch (error) {
            logger.error({ orderId, error: error.message }, 'Failed to get order custom attributes');
            throw error;
        }
    }

    /**
     * Merge custom attributes with existing ones (preserves existing data)
     * @param {string|number} orderId - Shopify order ID
     * @param {Array} newCustomAttributes - Array of new custom attribute objects with key and value
     * @returns {Promise<Object>} Updated order object
     */
    async mergeOrderCustomAttributes(orderId, newCustomAttributes) {
        try {
            // Get existing custom attributes
            const existingAttributes = await this.getOrderCustomAttributes(orderId);
            
            // Create a map of existing attributes for easy lookup
            const existingMap = new Map();
            existingAttributes.forEach(attr => {
                existingMap.set(attr.key, attr.value);
            });
            
            // Add/update with new attributes
            newCustomAttributes.forEach(attr => {
                existingMap.set(attr.key, attr.value);
            });
            
            // Convert back to array format
            const mergedAttributes = Array.from(existingMap.entries()).map(([key, value]) => ({
                key,
                value
            }));
            
            logger.info({ 
                orderId, 
                existingCount: existingAttributes.length,
                newCount: newCustomAttributes.length,
                mergedCount: mergedAttributes.length
            }, 'Merging custom attributes');
            
            // Update with merged attributes
            return await this.updateOrderCustomAttributes(orderId, mergedAttributes);
            
        } catch (error) {
            logger.error({ orderId, newCustomAttributes, error: error.message }, 'Failed to merge order custom attributes');
            throw error;
        }
    }

    /**
     * Set shipping custom attributes on order (AWB number and courier name)
     * @param {string|number} orderId - Shopify order ID
     * @param {string} awbNumber - AWB tracking number
     * @param {string} courierName - Courier company name
     * @returns {Promise<Object>} Updated order object
     */
    async setShippingCustomAttributes(orderId, awbNumber, courierName) {
        const customAttributes = [
            {
                key: 'AWB_NUMBER',
                value: awbNumber
            },
            {
                key: 'COURIER_NAME',
                value: courierName
            }
        ];
        
        return await this.mergeOrderCustomAttributes(orderId, customAttributes);
    }

    /**
     * Set invoice custom attributes on order (invoice number and invoice URL)
     * @param {string|number} orderId - Shopify order ID
     * @param {string} invoiceNumber - Invoice number
     * @param {string} invoiceUrl - Invoice URL
     * @param {string} invoiceSeries - Invoice series (optional)
     * @returns {Promise<Object>} Updated order object
     */
    async setInvoiceCustomAttributes(orderId, invoiceNumber, invoiceUrl, invoiceSeries) {
        const customAttributes = [
            {
                key: 'INVOICE_NUMBER',
                value: invoiceNumber
            },
            {
                key: 'INVOICE_URL',
                value: invoiceUrl
            }
        ];

        // Add invoice series if provided
        if (invoiceSeries) {
            customAttributes.push({
                key: 'INVOICE_SERIES',
                value: invoiceSeries
            });
        }
        
        return await this.mergeOrderCustomAttributes(orderId, customAttributes);
    }

    /**
     * Get order with fulfillment orders for fulfillment processing
     * @param {string|number} orderId - Shopify order ID
     * @returns {Promise<Object>} Order with fulfillment orders
     */
    async getOrderWithFulfillmentOrders(orderId) {
        try {
            const gqlOrderId = this.toGraphQLOrderId(orderId);
            
            const query = GET_ORDER_WITH_FULFILLMENT_ORDERS;
            
            const variables = { id: gqlOrderId };
            const response = await this.graphQLQuery(query, variables);
            
            if (!response.order) {
                throw new Error(`Order ${orderId} not found`);
            }
            
            logger.info({ orderId, fulfillmentOrdersCount: response.order.fulfillmentOrders.edges.length }, 'Retrieved order with fulfillment orders');
            
            return response.order;
            
        } catch (error) {
            logger.error({ orderId, error: error.message }, 'Failed to get order with fulfillment orders');
            throw error;
        }
    }

    /**
     * Create fulfillment for order with Cargus tracking information
     * @param {string|number} orderId - Shopify order ID
     * @param {Object} trackingInfo - Tracking information from Cargus
     * @param {string} trackingInfo.barcode - AWB barcode
     * @param {string} trackingInfo.trackingUrl - Tracking URL
     * @param {boolean} notifyCustomer - Whether to notify customer
     * @returns {Promise<Object>} Created fulfillment
     */
    async createFulfillmentWithTracking(orderId, trackingInfo, notifyCustomer = true) {
        try {
            logger.info({ orderId, trackingInfo, notifyCustomer }, 'Creating fulfillment with tracking using 2025-07 API');
            
            // Step 1: Check if order has fulfillment orders using GraphQL
            const orderWithFulfillmentOrders = await this.getOrderWithFulfillmentOrders(orderId);
            
            if (orderWithFulfillmentOrders.fulfillmentOrders.edges.length === 0) {
                logger.warn({ orderId }, 'No fulfillment orders found - this order may be from a legacy system or store configuration issue');
                
                // For orders without fulfillment orders, we cannot use the 2025-07 fulfillment API
                // This requires store configuration changes or using a different approach
                throw new Error(`Cannot fulfill order ${orderId}: No fulfillment orders found. This order may be from a legacy system. Please check your store's fulfillment configuration or contact Shopify support.`);
            }
            
            // Step 2: Filter fulfillment orders that support CREATE_FULFILLMENT
            const fulfillableFulfillmentOrders = orderWithFulfillmentOrders.fulfillmentOrders.edges.filter(edge => {
                const actions = edge.node.supportedActions.map(action => action.action);
                return actions.includes('CREATE_FULFILLMENT') && edge.node.status === 'OPEN';
            });
            
            if (fulfillableFulfillmentOrders.length === 0) {
                throw new Error(`No fulfillable fulfillment orders found for order ${orderId}. Order may already be fulfilled or not ready for fulfillment.`);
            }
            
            // Step 3: Create fulfillment using GraphQL fulfillmentCreateV2 (2025-07 API)
            const mutation = FULFILLMENT_CREATE_V2;
            
            const variables = {
                fulfillment: {
                    notifyCustomer: notifyCustomer,
                    trackingInfo: {
                        company: "Cargus",
                        number: trackingInfo.barcode,
                        url: trackingInfo.trackingUrl
                    },
                    lineItemsByFulfillmentOrder: fulfillableFulfillmentOrders.map(edge => ({
                        fulfillmentOrderId: edge.node.id
                        // If fulfillmentOrderLineItems aren't provided, it fulfills all remaining line items
                    }))
                }
            };
            
            logger.info({ orderId, variables }, 'Creating fulfillment with 2025-07 GraphQL API');
            const response = await this.graphQLQuery(mutation, variables);
            const fulfillmentCreateV2 = response.fulfillmentCreateV2 || response?.data?.fulfillmentCreateV2;
            
            if (!fulfillmentCreateV2) {
                throw new Error('Unexpected GraphQL response shape: missing fulfillmentCreateV2');
            }
            
            if (Array.isArray(fulfillmentCreateV2.userErrors) && fulfillmentCreateV2.userErrors.length > 0) {
                throw new Error(`GraphQL errors: ${JSON.stringify(fulfillmentCreateV2.userErrors)}`);
            }
            
            logger.info({ 
                orderId, 
                fulfillmentId: fulfillmentCreateV2.fulfillment.id,
                trackingNumber: trackingInfo.barcode,
                status: fulfillmentCreateV2.fulfillment.status
            }, 'Fulfillment created successfully with 2025-07 API');
            
            return fulfillmentCreateV2.fulfillment;
            
        } catch (error) {
            logger.error({ orderId, trackingInfo, error: error.message }, 'Failed to create fulfillment');
            throw error;
        }
    }


    /**
     * Set shipping/fulfillment metafields on order
     * @param {string|number} orderId - Shopify order ID
     * @param {string} awbBarcode - AWB barcode
     * @param {string} trackingUrl - Tracking URL
     * @param {string} fulfillmentId - Shopify fulfillment ID
     * @returns {Promise<Object>} Updated order object
     */
    async setShippingMetafields(orderId, awbBarcode, trackingUrl, fulfillmentId) {
        const metafields = [
            {
                namespace: 'custom',
                key: 'awb_barcode',
                value: awbBarcode,
                type: 'single_line_text_field'
            },
            {
                namespace: 'custom',
                key: 'tracking_url',
                value: trackingUrl,
                type: 'url'
            },
            {
                namespace: 'custom',
                key: 'fulfillment_id',
                value: fulfillmentId,
                type: 'single_line_text_field'
            },
            {
                namespace: 'custom',
                key: 'shipping_carrier',
                value: 'Cargus',
                type: 'single_line_text_field'
            }
        ];
        
        return await this.updateOrderMetafields(orderId, metafields);
    }

    /**
     * Find unfulfilled orders for testing purposes
     * @param {number} first - Number of orders to retrieve
     * @returns {Promise<Array>} List of unfulfilled orders
     */
    async findUnfulfilledOrders(first = 10) {
        try {
            const query = FIND_UNFULFILLED_ORDERS;
            
            const variables = { first };
            const response = await this.graphQLQuery(query, variables);
            
            const orders = response.orders.edges.map(edge => ({
                id: edge.node.id.replace('gid://shopify/Order/', ''),
                gqlId: edge.node.id,
                name: edge.node.name,
                displayFulfillmentStatus: edge.node.displayFulfillmentStatus,
                fulfillable: edge.node.fulfillable,
                createdAt: edge.node.createdAt,
                lineItems: edge.node.lineItems.edges.map(lineEdge => lineEdge.node)
            }));
            
            logger.info({ count: orders.length }, 'Found unfulfilled orders');
            
            return orders;
            
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to find unfulfilled orders');
            throw error;
        }
    }

    /**
     * Fulfill order with Cargus AWB - Complete fulfillment process
     * @param {string|number} orderId - Shopify order ID
     * @param {Object} awbData - AWB data from Cargus
     * @param {boolean} notifyCustomer - Whether to notify customer
     * @returns {Promise<Object>} Fulfillment result
     */
    async fulfillOrderWithCargus(orderId, awbData, notifyCustomer = true) {
        try {
            logger.info({ orderId, awbBarcode: awbData.BarCode }, 'Starting Shopify order fulfillment with Cargus');
            
            const trackingInfo = {
                barcode: awbData.BarCode,
                trackingUrl: `https://www.cargus.ro/personal/urmareste-coletul/?tracking_number=${awbData.BarCode}`
            };
            
            // Create fulfillment with tracking
            const fulfillment = await this.createFulfillmentWithTracking(orderId, trackingInfo, notifyCustomer);
            
            // Set shipping metafields
            const fulfillmentId = fulfillment.id || `fulfillment-${fulfillment.id}`;
            await this.setShippingMetafields(orderId, awbData.BarCode, trackingInfo.trackingUrl, fulfillmentId);
            
            // Set shipping custom attributes (AWB and courier name)
            await this.setShippingCustomAttributes(orderId, awbData.BarCode, 'Cargus');
            
            // Tag order as fulfilled with Cargus
            await this.tagOrder(orderId, 'Fulfilled with Cargus');
            
            logger.info({ 
                orderId, 
                fulfillmentId,
                awbBarcode: awbData.BarCode,
                trackingUrl: trackingInfo.trackingUrl
            }, 'Order fulfillment with Cargus completed successfully');
            
            return {
                fulfillment: fulfillment,
                awbBarcode: awbData.BarCode,
                trackingUrl: trackingInfo.trackingUrl,
                awbId: awbData.AwbId || awbData.Id || awbData.awbId || awbData.OrderId
            };
            
        } catch (error) {
            logger.error({ orderId, awbData, error: error.message }, 'Failed to fulfill order with Cargus');
            
            // Set error metafield for debugging
            try {
                await this.setErrorMetafield(orderId, `Fulfillment failed: ${error.message}`);
            } catch (metafieldError) {
                logger.error({ orderId, error: metafieldError.message }, 'Failed to set error metafield');
            }
            
            throw error;
        }
    }
}
