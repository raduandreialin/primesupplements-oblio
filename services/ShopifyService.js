import Shopify from "shopify-api-node";
import config from "../config/AppConfig.js";

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
            
            console.log('✅ Order tagged successfully:', {
                orderId,
                newTags: tagsString,
                allTags: updatedOrder.tags
            });
            
            return updatedOrder;
            
        } catch (error) {
            console.error('❌ Failed to tag order:', {
                orderId,
                tags,
                error: error.message
            });
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
            console.error('❌ Failed to get order:', {
                orderId,
                error: error.message
            });
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
            
            console.log('✅ Order metafields updated successfully:', {
                orderId,
                metafields: metafields.map(m => `${m.namespace}.${m.key}`)
            });
            
            return orderUpdate.order;
            
        } catch (error) {
            console.error('❌ Failed to update order metafields:', {
                orderId,
                metafields,
                error: error.message
            });
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
    async setInvoiceMetafields(orderId, invoiceNumber, invoiceUrl) {
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
}

// const shopName = config.shopify.B2C_SHOPIFY_SHOPNAME;
// const accessToken = config.shopify.B2C_SHOPIFY_ACCESS_TOKEN;
// console.log(shopName, accessToken); 
// const shopifyService = new ShopifyService(shopName, accessToken);

// shopifyService.graphQLQuery(`
//     query {
//         shop {
//             name
//         }
//     }
// `)
// .then((res) => console.log(res))
// .catch((err) => console.log(err));
