import { CreateInvoiceAction } from './CreateInvoiceAction.js';
import { UpdateOrderInvoiceAction } from './UpdateOrderInvoiceAction.js';
import { ValidateCompanyAction } from './ValidateCompanyAction.js';
import { logger } from '../utils/index.js';

/**
 * Action: Retry Invoice
 * 
 * Handles retrying failed invoice creation with enhanced error handling,
 * backoff strategies, and intelligent retry logic.
 * 
 * Single Responsibility: Invoice retry orchestration and failure management
 */
export class RetryInvoiceAction {
    constructor(
        createInvoiceAction = null,
        updateOrderAction = null,
        validateCompanyAction = null
    ) {
        // Allow dependency injection for testing
        this.createInvoiceAction = createInvoiceAction || new CreateInvoiceAction();
        this.updateOrderAction = updateOrderAction || new UpdateOrderInvoiceAction();
        this.validateCompanyAction = validateCompanyAction || new ValidateCompanyAction();
    }

    /**
     * Execute invoice retry with intelligent failure handling
     * @param {Object} params - Retry parameters
     * @returns {Promise<Object>} Retry result
     */
    async execute({
        order,
        previousError = null,
        retryAttempt = 1,
        maxRetries = 3,
        retryOptions = {}
    }) {
        try {
            logger.info({ 
                orderId: order.id,
                orderName: order.name || order.order_number,
                retryAttempt,
                maxRetries,
                previousError: previousError?.message
            }, 'Starting invoice retry');

            // Check if retry is warranted
            const retryEligibility = await this._checkRetryEligibility(
                order, 
                previousError, 
                retryAttempt, 
                maxRetries
            );

            if (!retryEligibility.canRetry) {
                logger.warn({
                    orderId: order.id,
                    reason: retryEligibility.reason,
                    retryAttempt
                }, 'Invoice retry not eligible');

                return {
                    success: false,
                    skipped: true,
                    reason: retryEligibility.reason,
                    retryAttempt,
                    finalFailure: retryAttempt >= maxRetries
                };
            }

            // Apply retry strategy based on previous error
            const retryStrategy = this._determineRetryStrategy(previousError, retryAttempt);
            logger.info({
                orderId: order.id,
                retryStrategy: retryStrategy.type,
                modifications: retryStrategy.modifications
            }, 'Applying retry strategy');

            // Apply strategy modifications to order/options
            const modifiedOrder = await this._applyRetryModifications(
                order, 
                retryStrategy, 
                retryOptions
            );

            // Wait for backoff period if specified
            if (retryStrategy.backoffMs > 0) {
                logger.info({
                    orderId: order.id,
                    backoffMs: retryStrategy.backoffMs
                }, 'Applying retry backoff');
                
                await this._sleep(retryStrategy.backoffMs);
            }

            // Attempt invoice creation
            const invoiceResult = await this.createInvoiceAction.execute({
                order: modifiedOrder,
                invoiceOptions: retryStrategy.invoiceOptions,
                customClient: retryStrategy.customClient,
                anafService: retryStrategy.skipAnaf ? null : this.validateCompanyAction.anafService
            });

            if (invoiceResult.success) {
                // Success - update order and clean error information
                logger.info({
                    orderId: order.id,
                    invoiceNumber: invoiceResult.invoice?.number,
                    retryAttempt
                }, 'Invoice retry successful');

                // Update order with success information
                await this.updateOrderAction.execute({
                    orderId: order.id,
                    invoiceResult,
                    removeErrorTags: true,
                    additionalTags: [`RETRY_SUCCESS_${retryAttempt}`]
                });

                return {
                    success: true,
                    invoiceResult,
                    retryAttempt,
                    strategyUsed: retryStrategy.type
                };

            } else {
                // Still failed - update with retry error information
                logger.warn({
                    orderId: order.id,
                    error: invoiceResult.error,
                    retryAttempt,
                    willRetryAgain: retryAttempt < maxRetries
                }, 'Invoice retry failed');

                await this.updateOrderAction.updateWithError({
                    orderId: order.id,
                    error: invoiceResult,
                    retryAttempt
                });

                return {
                    success: false,
                    error: invoiceResult.error,
                    details: invoiceResult.details,
                    retryAttempt,
                    strategyUsed: retryStrategy.type,
                    retryable: retryAttempt < maxRetries && invoiceResult.retryable,
                    finalFailure: retryAttempt >= maxRetries
                };
            }

        } catch (error) {
            logger.error({
                orderId: order.id,
                error: error.message,
                stack: error.stack,
                retryAttempt
            }, 'Invoice retry execution failed');

            return {
                success: false,
                error: error.message,
                retryAttempt,
                systemError: true,
                finalFailure: retryAttempt >= maxRetries
            };
        }
    }

    /**
     * Process order update webhook for retry logic
     * @param {Object} order - Updated Shopify order
     * @returns {Promise<Object>} Processing result
     */
    async processOrderUpdateForRetry(order) {
        try {
            logger.info({
                orderId: order.id,
                orderName: order.name
            }, 'Processing order update for invoice retry');

            // Check if order has error tag and needs retry
            const tags = order.tags ? order.tags.split(', ') : [];
            const hasErrorTag = tags.some(tag => tag.includes('EROARE FACTURARE'));
            const hasSuccessTag = tags.some(tag => 
                tag.includes('oblio-invoiced') || 
                tag.startsWith('FACTURA-')
            );

            if (!hasErrorTag) {
                logger.debug({ orderId: order.id }, 'Order has no error tag, skipping retry');
                return {
                    success: true,
                    skipped: true,
                    reason: 'No error tag present'
                };
            }

            if (hasSuccessTag) {
                logger.debug({ orderId: order.id }, 'Order already has success tags, skipping retry');
                return {
                    success: true,
                    skipped: true,
                    reason: 'Already has success tags'
                };
            }

            // Determine retry attempt number from tags
            const retryAttempt = this._extractRetryAttemptFromTags(tags);

            // Execute retry
            return await this.execute({
                order,
                retryAttempt: retryAttempt + 1,
                maxRetries: 3
            });

        } catch (error) {
            logger.error({
                orderId: order.id,
                error: error.message
            }, 'Failed to process order update for retry');

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if retry is eligible and warranted
     * @private
     */
    async _checkRetryEligibility(order, previousError, retryAttempt, maxRetries) {
        // Check max retries
        if (retryAttempt > maxRetries) {
            return {
                canRetry: false,
                reason: 'Maximum retry attempts exceeded'
            };
        }

        // Check if error is retryable
        if (previousError && !previousError.retryable) {
            return {
                canRetry: false,
                reason: 'Previous error is not retryable'
            };
        }

        // Check order status
        const invoiceStatus = await this.updateOrderAction.checkInvoiceStatus(order.id);
        
        if (invoiceStatus.hasInvoice && !invoiceStatus.hasError) {
            return {
                canRetry: false,
                reason: 'Order already has successful invoice'
            };
        }

        return {
            canRetry: true,
            reason: 'Retry is eligible'
        };
    }

    /**
     * Determine retry strategy based on error type
     * @private
     */
    _determineRetryStrategy(previousError, retryAttempt) {
        const baseStrategy = {
            type: 'standard',
            backoffMs: 0,
            modifications: [],
            invoiceOptions: {},
            customClient: null,
            skipAnaf: false
        };

        if (!previousError) {
            return baseStrategy;
        }

        const errorMessage = previousError.message || previousError.error || '';
        const errorType = previousError.errorType;
        const statusCode = previousError.statusCode;

        // Network/timeout errors - exponential backoff
        if (!statusCode || statusCode >= 500 || statusCode === 429) {
            return {
                ...baseStrategy,
                type: 'network_retry',
                backoffMs: Math.min(1000 * Math.pow(2, retryAttempt - 1), 30000), // Max 30s
                modifications: ['exponential_backoff']
            };
        }

        // ANAF validation errors - skip ANAF on retry
        if (errorMessage.includes('ANAF') || errorType === 'ANAF_ERROR') {
            return {
                ...baseStrategy,
                type: 'skip_anaf',
                skipAnaf: true,
                modifications: ['skip_anaf_validation']
            };
        }

        // Client data errors - use simplified client
        if (errorMessage.includes('client') || errorMessage.includes('address')) {
            return {
                ...baseStrategy,
                type: 'simplified_client',
                customClient: this._buildSimplifiedClient(),
                modifications: ['simplified_client_data']
            };
        }

        // Product validation errors - exclude problematic products
        if (errorMessage.includes('product') || errorMessage.includes('line item')) {
            return {
                ...baseStrategy,
                type: 'exclude_problematic_items',
                invoiceOptions: {
                    excludeShipping: true,
                    validateProducts: false
                },
                modifications: ['exclude_shipping', 'skip_product_validation']
            };
        }

        // Oblio API errors - use different series or options
        if (statusCode === 400 || statusCode === 422) {
            return {
                ...baseStrategy,
                type: 'alternative_options',
                invoiceOptions: {
                    seriesName: 'FACT', // Alternative series
                    useStock: 0, // Don't use stock
                    sendEmail: 0 // Don't send email
                },
                modifications: ['alternative_series', 'disable_stock', 'disable_email']
            };
        }

        return baseStrategy;
    }

    /**
     * Apply retry modifications to order data
     * @private
     */
    async _applyRetryModifications(order, retryStrategy, retryOptions) {
        let modifiedOrder = { ...order };

        // Apply strategy-specific modifications
        if (retryStrategy.type === 'exclude_problematic_items') {
            // Remove line items that might cause issues
            modifiedOrder.line_items = order.line_items.filter(item => 
                item.price > 0 && 
                item.quantity > 0 && 
                item.title && 
                !item.title.toLowerCase().includes('shipping')
            );
        }

        if (retryStrategy.type === 'simplified_client') {
            // Ensure we have minimal required client data
            if (!modifiedOrder.billing_address && !modifiedOrder.shipping_address) {
                modifiedOrder.billing_address = {
                    first_name: 'Customer',
                    last_name: '',
                    address1: 'Address not provided',
                    city: 'Bucuresti',
                    province: 'Bucuresti',
                    zip: '010000',
                    country: 'România',
                    phone: '',
                    company: ''
                };
            }
        }

        return modifiedOrder;
    }

    /**
     * Build simplified client for retry
     * @private
     */
    _buildSimplifiedClient() {
        return {
            name: 'Customer',
            code: 'RETRY_CLIENT',
            address: 'Bucuresti, România',
            state: 'Bucuresti',
            city: 'Bucuresti',
            country: 'România',
            iban: '',
            bank: '',
            email: '',
            phone: '',
            contact: 'Customer'
        };
    }

    /**
     * Extract retry attempt number from order tags
     * @private
     */
    _extractRetryAttemptFromTags(tags) {
        let maxRetryAttempt = 0;
        
        tags.forEach(tag => {
            if (tag.includes('error-') && tag.includes('-retry')) {
                // Try to extract retry number if present
                const match = tag.match(/retry(\d+)?$/);
                if (match) {
                    const retryNum = match[1] ? parseInt(match[1]) : 1;
                    maxRetryAttempt = Math.max(maxRetryAttempt, retryNum);
                } else {
                    maxRetryAttempt = Math.max(maxRetryAttempt, 1);
                }
            }
        });

        return maxRetryAttempt;
    }

    /**
     * Sleep utility for backoff
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Batch retry multiple failed orders
     * @param {Array} orders - Array of orders to retry
     * @param {Object} options - Retry options
     * @returns {Promise<Object>} Batch retry results
     */
    async retryBatch(orders, options = {}) {
        try {
            logger.info({ orderCount: orders.length }, 'Starting batch invoice retry');

            const results = await Promise.allSettled(
                orders.map(order => this.execute({
                    order,
                    maxRetries: options.maxRetries || 2,
                    retryOptions: options
                }))
            );

            const successful = results
                .filter(r => r.status === 'fulfilled' && r.value.success)
                .map(r => r.value);

            const failed = results
                .filter(r => r.status === 'rejected' || !r.value.success)
                .map(r => r.status === 'fulfilled' ? r.value : { 
                    success: false, 
                    error: r.reason?.message || 'Unknown error' 
                });

            logger.info({
                totalRequested: orders.length,
                successful: successful.length,
                failed: failed.length
            }, 'Batch retry completed');

            return {
                success: true,
                results: {
                    successful,
                    failed
                },
                summary: {
                    total: orders.length,
                    successCount: successful.length,
                    failureCount: failed.length,
                    successRate: (successful.length / orders.length * 100).toFixed(1)
                }
            };

        } catch (error) {
            logger.error({
                orderCount: orders.length,
                error: error.message
            }, 'Batch retry failed');

            return {
                success: false,
                error: `Batch retry failed: ${error.message}`
            };
        }
    }
}

export default RetryInvoiceAction;
