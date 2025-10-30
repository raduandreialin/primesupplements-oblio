import {
    CreateInvoiceAction,
    ValidateCompanyAction,
    UpdateOrderInvoiceAction,
    RetryInvoiceAction
} from '../actions/index.js';
import { logger } from '../utils/index.js';

/**
 * Invoice Controller
 * 
 * Orchestrates invoice operations using action classes.
 * This controller is now focused on HTTP request/response handling
 * and coordinating actions, following the Single Responsibility Principle.
 * 
 * Responsibilities:
 * - HTTP request/response handling
 * - Input validation and sanitization
 * - Action orchestration
 * - Error handling and logging
 */
class InvoiceController {
    constructor() {
        // Initialize actions
        this.createInvoiceAction = new CreateInvoiceAction();
        this.validateCompanyAction = new ValidateCompanyAction();
        this.updateOrderAction = new UpdateOrderInvoiceAction();
        this.retryInvoiceAction = new RetryInvoiceAction();
    }

    /**
     * Create invoice from Shopify order fulfillment (webhook)
     * Always returns 200 to Shopify (webhook acknowledgment)
     */
    async createFromShopifyOrder(req, res) {
        // Always acknowledge webhook receipt first
        res.status(200).json({ received: true });
        
        try {
            const order = req.body;
            logger.info(`📥 Invoice webhook: Order ${order.name || order.id}`);

            // Create invoice using action
            const invoiceResult = await this.createInvoiceAction.execute({
                order,
                anafService: this.validateCompanyAction.anafService
            });

            if (invoiceResult.success) {
                logger.info(`✅ Invoice ${invoiceResult.invoice.number} created for order ${order.name || order.id}`);

                // Update order with invoice information
                await this.updateOrderAction.execute({
                    orderId: order.id,
                    invoiceResult,
                    removeErrorTags: true
                });

            } else {
                logger.error(`❌ Invoice failed for order ${order.name || order.id}: ${invoiceResult.error}`);

                // Update order with error information
                await this.updateOrderAction.updateWithError({
                    orderId: order.id,
                    error: invoiceResult
                });
            }

        } catch (error) {
            const orderId = req.body?.id || 'unknown';
            logger.error(`❌ Webhook error for order ${orderId}: ${error.message}`);

            // Update order with system error
            try {
                await this.updateOrderAction.updateWithError({
                    orderId,
                    error: { message: `System error: ${error.message}` }
                });
            } catch (updateError) {
                logger.error(`⚠️ Failed to update order ${orderId} with error`);
            }
        }
    }

    /**
     * Retry invoice creation from Shopify order update (webhook)
     * Only processes orders with "EROARE FACTURARE" tag
     * Always returns 200 to Shopify (webhook acknowledgment)
     */
    async retryFromShopifyOrderUpdate(req, res) {
        // Always acknowledge webhook receipt first
        res.status(200).json({ received: true });
        
        try {
            const order = req.body;

            // Process retry using action
            const retryResult = await this.retryInvoiceAction.processOrderUpdateForRetry(order);

            if (retryResult.success && !retryResult.skipped) {
                logger.info(`🔄 Invoice retry success for order ${order.name || order.id}: ${retryResult.invoiceResult?.invoice?.number}`);
            } else if (!retryResult.skipped && retryResult.finalFailure) {
                logger.warn(`⚠️ Invoice retry final failure for order ${order.name || order.id}`);
            }

        } catch (error) {
            logger.error(`❌ Retry webhook error: ${error.message}`);
        }
    }

    /**
     * Create invoice from admin extension
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
                orderData,
                invoiceOptions,
                customClient,
                validateCompany,
                skipAnaf
            } = requestData;

            logger.info(`📝 Manual invoice: Order ${orderData.name || orderData.order_number}`);

            // Step 1: Validate company if B2B and not skipped
            let validatedClient = customClient;
            if (validateCompany && customClient?.cif && !skipAnaf) {
                try {
                    const companyValidation = await this.validateCompanyAction.execute({
                        cif: customClient.cif,
                        includeInactiveCompanies: invoiceOptions.allowInactiveCompanies
                    });

                    if (companyValidation.success) {
                        validatedClient = await this.validateCompanyAction.enrichClientData(
                            customClient, 
                            customClient.cif
                        );
                        logger.info(`✅ Company validated: ${companyValidation.company.name}`);
                    } else {
                        // Return validation error to user
                        if (companyValidation.errorType === 'NOT_FOUND' || 
                            companyValidation.errorType === 'INACTIVE') {
                            return res.status(400).json({
                                success: false,
                                error: companyValidation.error,
                                errorType: companyValidation.errorType,
                                companyData: companyValidation.companyData
                            });
                        }
                    }
                } catch (validationError) {
                    logger.warn(`⚠️ Company validation failed, continuing without ANAF enrichment`);
                }
            }

            // Step 2: Create invoice
            const invoiceResult = await this.createInvoiceAction.execute({
                order: orderData,
                invoiceOptions,
                customClient: validatedClient,
                anafService: skipAnaf ? null : this.validateCompanyAction.anafService
            });

            if (invoiceResult.success) {
                logger.info(`✅ Manual invoice ${invoiceResult.invoice.number} created`);

                // Step 3: Update order with invoice information
                try {
                    await this.updateOrderAction.execute({
                        orderId,
                        invoiceResult,
                        removeErrorTags: true,
                        additionalTags: ['MANUAL_INVOICE']
                    });
                } catch (updateError) {
                    logger.warn(`⚠️ Order update failed, but invoice was created`);
                }

                return res.json({
                    success: true,
                    invoice: invoiceResult.invoice,
                    message: 'Invoice created successfully'
                });

            } else {
                logger.error(`❌ Manual invoice failed: ${invoiceResult.error}`);

                // Update order with error information
                try {
                    await this.updateOrderAction.updateWithError({
                        orderId,
                        error: invoiceResult
                    });
                } catch (updateError) {
                    // Silent fail
                }

                return res.status(400).json({
                    success: false,
                    error: invoiceResult.error,
                    details: invoiceResult.details,
                    retryable: invoiceResult.retryable
                });
            }

        } catch (error) {
            logger.error(`❌ Extension invoice error: ${error.message}`);

            res.status(500).json({
                success: false,
                error: 'Failed to create invoice',
                details: error.message
            });
        }
    }

    /**
     * Retry invoice creation from admin extension
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async retryFromExtension(req, res) {
        try {
            const { orderId, orderData, retryOptions = {} } = req.body;

            if (!orderId || !orderData) {
                return res.status(400).json({
                    success: false,
                    error: 'Order ID and order data are required'
                });
            }

            logger.info(`🔄 Manual retry: Order ${orderData.name || orderData.order_number}`);

            // Execute retry using action
            const retryResult = await this.retryInvoiceAction.execute({
                order: orderData,
                retryAttempt: retryOptions.retryAttempt || 1,
                maxRetries: retryOptions.maxRetries || 3,
                retryOptions
            });

            if (retryResult.success) {
                logger.info(`✅ Retry success: Invoice ${retryResult.invoiceResult?.invoice?.number}`);

                return res.json({
                    success: true,
                    invoice: retryResult.invoiceResult?.invoice,
                    retryAttempt: retryResult.retryAttempt,
                    strategyUsed: retryResult.strategyUsed,
                    message: 'Invoice created successfully on retry'
                });

            } else {
                logger.warn(`⚠️ Retry failed: ${retryResult.error}`);

                return res.status(400).json({
                    success: false,
                    error: retryResult.error,
                    retryAttempt: retryResult.retryAttempt,
                    retryable: retryResult.retryable,
                    finalFailure: retryResult.finalFailure,
                    strategyUsed: retryResult.strategyUsed
                });
            }

        } catch (error) {
            logger.error(`❌ Manual retry error: ${error.message}`);

            res.status(500).json({
                success: false,
                error: 'Failed to retry invoice creation',
                details: error.message
            });
        }
    }

    /**
     * Get invoice status for order
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getInvoiceStatus(req, res) {
        try {
            const { orderId } = req.params;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    error: 'Order ID is required'
                });
            }

            const invoiceStatus = await this.updateOrderAction.checkInvoiceStatus(orderId);

            return res.json({
                success: true,
                status: invoiceStatus
            });

        } catch (error) {
            logger.error(`❌ Status check failed for order ${req.params?.orderId}: ${error.message}`);

            res.status(500).json({
                success: false,
                error: 'Failed to get invoice status',
                details: error.message
            });
        }
    }

    /**
     * Validate company with ANAF
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async validateCompany(req, res) {
        try {
            const { cif, includeInactiveCompanies = false } = req.body;

            if (!cif) {
                return res.status(400).json({
                    success: false,
                    error: 'CIF is required'
                });
            }

            const validation = await this.validateCompanyAction.execute({
                cif,
                includeInactiveCompanies
            });

            if (validation.success) {
                logger.info(`✅ ANAF validated: ${cif}`);
            } else {
                logger.warn(`⚠️ ANAF validation failed: ${cif}`);
            }

            return res.json(validation);

        } catch (error) {
            logger.error(`❌ ANAF validation error for ${req.body?.cif}: ${error.message}`);

            res.status(500).json({
                success: false,
                error: 'Failed to validate company',
                details: error.message
            });
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
            orderData,
            invoiceOptions = {},
            customClient = null,
            validateCompany = false,
            skipAnaf = false
        } = body;

        return {
            orderId,
            orderData,
            invoiceOptions: {
                seriesName: invoiceOptions.seriesName,
                issueDate: invoiceOptions.issueDate,
                language: invoiceOptions.language || 'RO',
                mentions: invoiceOptions.mentions,
                sendEmail: invoiceOptions.sendEmail,
                useStock: invoiceOptions.useStock,
                markAsPaid: invoiceOptions.markAsPaid,
                paymentMethod: invoiceOptions.paymentMethod,
                collectDate: invoiceOptions.collectDate,
                excludeShipping: invoiceOptions.excludeShipping,
                selectedLineItems: invoiceOptions.selectedLineItems,
                allowInactiveCompanies: invoiceOptions.allowInactiveCompanies
            },
            customClient,
            validateCompany,
            skipAnaf
        };
    }

    /**
     * Validate request data
     * @private
     */
    _validateRequestData({ orderId, orderData }) {
        if (!orderId) {
            return 'Order ID is required';
        }

        if (!orderData) {
            return 'Order data is required';
        }

        if (!orderData.line_items || !Array.isArray(orderData.line_items)) {
            return 'Order must have line items';
        }

        return null; // No validation errors
    }
}

export default new InvoiceController();
