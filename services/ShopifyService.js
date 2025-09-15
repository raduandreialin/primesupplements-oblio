import Shopify from "shopify-api-node";
import config from "../config/AppConfig.js";
import { logger } from "../utils/index.js";

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
            
            // Get current order to preserve existing tags
            const currentOrder = await this.shopify.order.get(orderId);
            const existingTags = currentOrder.tags || '';
            
            // Merge existing tags with new tags
            const allTags = existingTags 
                ? `${existingTags}, ${tagsString}` 
                : tagsString;
            
            // Update order with new tags
            const updatedOrder = await this.shopify.order.update(orderId, {
                tags: allTags
            });
            
            logger.info({ orderId, newTags: tagsString, allTags: updatedOrder.tags }, 'Order tagged successfully');
            
            return updatedOrder;
            
        } catch (error) {
            logger.error({ orderId, tags, error: error.message }, 'Failed to tag order');
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
            return await this.shopify.order.get(orderId);
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
            // Convert numeric orderId to GraphQL ID format
            const gqlOrderId = `gid://shopify/Order/${orderId}`;
            
            const mutation = `
                mutation OrderUpdate($input: OrderInput!) {
                    orderUpdate(input: $input) {
                        order {
                            id
                            metafields(first: 10) {
                                edges {
                                    node {
                                        namespace
                                        key
                                        value
                                        type
                                    }
                                }
                            }
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;
            
            const variables = {
                input: {
                    id: gqlOrderId,
                    metafields: metafields
                }
            };
            
            const response = await this.graphQLQuery(mutation, variables);
            // shopify-api-node returns the data object directly, not wrapped in { data }
            const orderUpdate = response.orderUpdate || response?.data?.orderUpdate;

            if (!orderUpdate) {
                throw new Error('Unexpected GraphQL response shape: missing orderUpdate');
            }

            if (Array.isArray(orderUpdate.userErrors) && orderUpdate.userErrors.length > 0) {
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
     * Get order with fulfillment orders for fulfillment processing
     * @param {string|number} orderId - Shopify order ID
     * @returns {Promise<Object>} Order with fulfillment orders
     */
    async getOrderWithFulfillmentOrders(orderId) {
        try {
            const gqlOrderId = `gid://shopify/Order/${orderId}`;
            
            const query = `
                query GetOrderWithFulfillmentOrders($id: ID!) {
                    order(id: $id) {
                        id
                        name
                        email
                        phone
                        displayFulfillmentStatus
                        fulfillable
                        fulfillments(first: 10) {
                            id
                            status
                            trackingInfo(first: 5) {
                                company
                                number
                                url
                            }
                        }
                        lineItems(first: 50) {
                            edges {
                                node {
                                    id
                                    name
                                    quantity
                                    unfulfilledQuantity
                                    requiresShipping
                                    fulfillmentStatus
                                }
                            }
                        }
                        fulfillmentOrders(first: 10) {
                            edges {
                                node {
                                    id
                                    status
                                    requestStatus
                                    supportedActions {
                                        action
                                    }
                                    destination {
                                        address1
                                        address2
                                        city
                                        countryCode
                                        email
                                        firstName
                                        lastName
                                        phone
                                        province
                                        zip
                                    }
                                    lineItems(first: 50) {
                                        edges {
                                            node {
                                                id
                                                totalQuantity
                                                remainingQuantity
                                                lineItem {
                                                    id
                                                    name
                                                    quantity
                                                    sku
                                                    variant {
                                                        id
                                                        title
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    assignedLocation {
                                        name
                                        location {
                                            id
                                            name
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            
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
            const mutation = `
                mutation FulfillmentCreateV2($fulfillment: FulfillmentV2Input!) {
                    fulfillmentCreateV2(fulfillment: $fulfillment) {
                        fulfillment {
                            id
                            status
                            trackingInfo(first: 10) {
                                company
                                number
                                url
                            }
                        }
                        userErrors {
                            field
                            message
                        }
                    }
                }
            `;
            
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
            const query = `
                query FindUnfulfilledOrders($first: Int!) {
                    orders(first: $first, query: "fulfillment_status:unfulfilled") {
                        edges {
                            node {
                                id
                                name
                                displayFulfillmentStatus
                                fulfillable
                                createdAt
                                lineItems(first: 5) {
                                    edges {
                                        node {
                                            name
                                            quantity
                                            unfulfilledQuantity
                                            requiresShipping
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;
            
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
