import ShopifyService from '../services/ShopifyService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

/**
 * Action: Update Order Invoice
 * 
 * Handles updating Shopify orders with invoice information,
 * metafields, tags, and custom attributes after invoice creation.
 * 
 * Single Responsibility: Shopify order invoice data updates
 */
export class UpdateOrderInvoiceAction {
    constructor(shopifyService = null) {
        // Allow dependency injection for testing
        this.shopifyService = shopifyService || new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
    }

    /**
     * Execute order update with invoice information
     * @param {Object} params - Update parameters
     * @returns {Promise<Object>} Update result
     */
    async execute({
        orderId,
        invoiceResult,
        removeErrorTags = true,
        additionalTags = []
    }) {
        try {
            logger.info({ 
                orderId, 
                invoiceNumber: invoiceResult.invoice?.number,
                invoiceSeries: invoiceResult.invoice?.series 
            }, 'Starting Shopify order update with invoice info');

            const results = await Promise.allSettled([
                this._updateInvoiceMetafields(orderId, invoiceResult),
                this._setInvoiceCustomAttributes(orderId, invoiceResult),
                this._updateInvoiceTags(orderId, invoiceResult, removeErrorTags, additionalTags)
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
                }, 'Some invoice update operations failed');
            }

            const successCount = results.filter(r => r.status === 'fulfilled').length;

            logger.info({
                orderId,
                invoiceNumber: invoiceResult.invoice?.number,
                successfulOperations: successCount,
                totalOperations: results.length
            }, 'Shopify order invoice update completed');

            return {
                success: successCount > 0,
                successfulOperations: successCount,
                totalOperations: results.length,
                failures: failures.map(f => ({ 
                    operation: f.operation, 
                    error: f.result.reason.message 
                })),
                invoiceInfo: {
                    number: invoiceResult.invoice?.number,
                    series: invoiceResult.invoice?.series,
                    url: invoiceResult.invoice?.url
                }
            };

        } catch (error) {
            logger.error({
                orderId,
                error: error.message,
                stack: error.stack
            }, 'Failed to update Shopify order with invoice info');

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update order with error information when invoice creation fails
     * @param {Object} params - Error update parameters
     * @returns {Promise<Object>} Update result
     */
    async updateWithError({
        orderId,
        error,
        retryAttempt = 0,
        preserveExistingTags = true
    }) {
        try {
            logger.info({ 
                orderId, 
                error: error.message || error,
                retryAttempt 
            }, 'Updating order with invoice error information');

            const errorTag = retryAttempt > 0 
                ? `error-${new Date().toISOString().split('T')[0]}-retry`
                : `error-${new Date().toISOString().split('T')[0]}`;

            const errorTags = ['EROARE FACTURARE', errorTag];

            // Compose error message
            const httpStatus = error.statusCode || error.response?.status;
            const statusMessage = error.details?.statusMessage || error.response?.data?.message;
            const composedMsg = `${retryAttempt > 0 ? 'Retry ' : ''}Facturare esuata: ${error.message || error}${httpStatus ? ` (HTTP ${httpStatus})` : ''}${statusMessage ? ` | ${statusMessage}` : ''}. ${retryAttempt > 0 ? 'Retry t' : 'T'}imestamp: ${new Date().toISOString()}`;

            const results = await Promise.allSettled([
                this._addErrorTags(orderId, errorTags, preserveExistingTags),
                this._setErrorMetafield(orderId, composedMsg)
            ]);

            const successCount = results.filter(r => r.status === 'fulfilled').length;

            logger.info({
                orderId,
                errorTags,
                successfulOperations: successCount,
                retryAttempt
            }, 'Order updated with error information');

            return {
                success: successCount > 0,
                errorTags,
                errorMessage: composedMsg
            };

        } catch (updateError) {
            logger.error({
                orderId,
                originalError: error.message || error,
                updateError: updateError.message,
                retryAttempt
            }, 'Failed to update order with error information');

            return {
                success: false,
                error: updateError.message
            };
        }
    }

    /**
     * Clean error tags and information from successfully invoiced order
     * @param {string} orderId - Shopify order ID
     * @param {Array} existingTags - Current order tags
     * @returns {Promise<Object>} Cleanup result
     */
    async cleanErrorInformation(orderId, existingTags = []) {
        try {
            logger.info({ orderId }, 'Cleaning error information from order');

            // Filter out error-related tags
            const cleanTags = existingTags.filter(tag => 
                !tag.includes('EROARE FACTURARE') && 
                !tag.startsWith('error-')
            );

            await this.shopifyService.tagOrder(orderId, cleanTags);

            // Remove error metafield by setting it to empty
            await this.shopifyService.setErrorMetafield(orderId, '');

            logger.info({ 
                orderId,
                removedTags: existingTags.length - cleanTags.length 
            }, 'Error information cleaned from order');

            return {
                success: true,
                cleanedTags: existingTags.length - cleanTags.length
            };

        } catch (error) {
            logger.error({
                orderId,
                error: error.message
            }, 'Failed to clean error information from order');

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update invoice metafields
     * @private
     */
    async _updateInvoiceMetafields(orderId, invoiceResult) {
        const metafields = [
            {
                namespace: 'invoice',
                key: 'number',
                value: invoiceResult.invoice?.number || 'unknown',
                type: 'single_line_text_field'
            },
            {
                namespace: 'invoice',
                key: 'series',
                value: invoiceResult.invoice?.series || process.env.OBLIO_INVOICE_SERIES,
                type: 'single_line_text_field'
            },
            {
                namespace: 'invoice',
                key: 'url',
                value: invoiceResult.invoice?.url || '',
                type: 'url'
            },
            {
                namespace: 'invoice',
                key: 'total',
                value: invoiceResult.invoice?.total?.toString() || '0',
                type: 'number_decimal'
            },
            {
                namespace: 'invoice',
                key: 'currency',
                value: invoiceResult.invoice?.currency || 'RON',
                type: 'single_line_text_field'
            },
            {
                namespace: 'invoice',
                key: 'issue_date',
                value: invoiceResult.invoice?.issueDate || new Date().toISOString().split('T')[0],
                type: 'date'
            },
            {
                namespace: 'invoice',
                key: 'created_at',
                value: new Date().toISOString(),
                type: 'date_time'
            }
        ];

        // Add client information if available
        if (invoiceResult.invoice?.clientName) {
            metafields.push({
                namespace: 'invoice',
                key: 'client_name',
                value: invoiceResult.invoice.clientName,
                type: 'single_line_text_field'
            });
        }

        if (invoiceResult.invoice?.clientCif) {
            metafields.push({
                namespace: 'invoice',
                key: 'client_cif',
                value: invoiceResult.invoice.clientCif,
                type: 'single_line_text_field'
            });
        }

        await this.shopifyService.updateOrderMetafields(orderId, metafields);
        logger.debug({ orderId, metafieldCount: metafields.length }, 'Invoice metafields updated');
    }

    /**
     * Set invoice custom attributes
     * @private
     */
    async _setInvoiceCustomAttributes(orderId, invoiceResult) {
        await this.shopifyService.setInvoiceCustomAttributes(
            orderId,
            invoiceResult.invoice?.number || 'unknown',
            invoiceResult.invoice?.url || '',
            invoiceResult.invoice?.series || process.env.OBLIO_INVOICE_SERIES
        );
        logger.debug({ orderId }, 'Invoice custom attributes updated');
    }

    /**
     * Update invoice tags
     * @private
     */
    async _updateInvoiceTags(orderId, invoiceResult, removeErrorTags, additionalTags) {
        const invoiceTags = [
            'oblio-invoiced',
            `FACTURA-${invoiceResult.invoice?.number || 'unknown'}`,
            'INVOICE_CREATED'
        ];

        // Add additional tags if provided
        if (additionalTags && additionalTags.length > 0) {
            invoiceTags.push(...additionalTags);
        }

        if (removeErrorTags) {
            // Get current tags and filter out error tags
            try {
                const order = await this.shopifyService.getOrder(orderId);
                const currentTags = order.tags ? order.tags.split(', ') : [];
                const cleanTags = currentTags.filter(tag => 
                    !tag.includes('EROARE FACTURARE') && 
                    !tag.startsWith('error-')
                );
                
                // Combine clean existing tags with new invoice tags
                const finalTags = [...new Set([...cleanTags, ...invoiceTags])];
                await this.shopifyService.tagOrder(orderId, finalTags);
                
                logger.debug({ 
                    orderId, 
                    removedErrorTags: currentTags.length - cleanTags.length,
                    totalTags: finalTags.length 
                }, 'Tags updated with error cleanup');
            } catch (error) {
                // Fallback: just add invoice tags
                logger.warn({ orderId, error: error.message }, 'Failed to clean error tags, adding invoice tags only');
                await this.shopifyService.tagOrder(orderId, invoiceTags);
            }
        } else {
            // Just add invoice tags
            await this.shopifyService.tagOrder(orderId, invoiceTags);
            logger.debug({ orderId, invoiceTags }, 'Invoice tags added');
        }
    }

    /**
     * Add error tags to order
     * @private
     */
    async _addErrorTags(orderId, errorTags, preserveExisting) {
        if (preserveExisting) {
            // Get current tags and add error tags
            try {
                const order = await this.shopifyService.getOrder(orderId);
                const currentTags = order.tags ? order.tags.split(', ') : [];
                const finalTags = [...new Set([...currentTags, ...errorTags])];
                await this.shopifyService.tagOrder(orderId, finalTags);
            } catch (error) {
                // Fallback: just add error tags
                await this.shopifyService.tagOrder(orderId, errorTags);
            }
        } else {
            await this.shopifyService.tagOrder(orderId, errorTags);
        }
    }

    /**
     * Set error metafield
     * @private
     */
    async _setErrorMetafield(orderId, errorMessage) {
        await this.shopifyService.setErrorMetafield(orderId, errorMessage);
    }

    /**
     * Get operation name by index for error reporting
     * @private
     */
    _getOperationName(index) {
        const operations = ['metafields', 'customAttributes', 'tags'];
        return operations[index] || 'unknown';
    }

    /**
     * Check if order already has invoice
     * @param {string} orderId - Shopify order ID
     * @returns {Promise<Object>} Invoice status
     */
    async checkInvoiceStatus(orderId) {
        try {
            const order = await this.shopifyService.getOrder(orderId);
            
            if (!order) {
                return {
                    hasInvoice: false,
                    error: 'Order not found'
                };
            }

            const tags = order.tags ? order.tags.split(', ') : [];
            const hasInvoiceTag = tags.some(tag => 
                tag.includes('oblio-invoiced') || 
                tag.startsWith('FACTURA-')
            );

            const hasErrorTag = tags.some(tag => 
                tag.includes('EROARE FACTURARE') || 
                tag.startsWith('error-')
            );

            // Try to get invoice metafields
            let invoiceNumber = null;
            let invoiceUrl = null;
            
            if (order.metafields) {
                const invoiceNumberField = order.metafields.find(m => 
                    m.namespace === 'invoice' && m.key === 'number'
                );
                const invoiceUrlField = order.metafields.find(m => 
                    m.namespace === 'invoice' && m.key === 'url'
                );
                
                invoiceNumber = invoiceNumberField?.value;
                invoiceUrl = invoiceUrlField?.value;
            }

            return {
                hasInvoice: hasInvoiceTag,
                hasError: hasErrorTag,
                invoiceNumber,
                invoiceUrl,
                tags,
                status: hasInvoiceTag ? 'invoiced' : (hasErrorTag ? 'error' : 'not_invoiced')
            };

        } catch (error) {
            logger.error({
                orderId,
                error: error.message
            }, 'Failed to check invoice status');

            return {
                hasInvoice: false,
                error: error.message
            };
        }
    }
}

export default UpdateOrderInvoiceAction;
