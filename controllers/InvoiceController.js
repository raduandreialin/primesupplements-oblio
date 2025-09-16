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
            logger.info({ 
                orderId: order.id, 
                orderName: order.name,
                customerEmail: order.customer?.email 
            }, 'Processing Shopify order fulfillment webhook for invoice creation');

            // Create invoice using action
            const invoiceResult = await this.createInvoiceAction.execute({
                order,
                anafService: this.validateCompanyAction.anafService
            });

            if (invoiceResult.success) {
                logger.info({ 
                    orderId: order.id,
                    invoiceNumber: invoiceResult.invoice.number,
                    customerEmail: order.customer?.email 
                }, 'Invoice created successfully from webhook');

                // Update order with invoice information
                await this.updateOrderAction.execute({
                    orderId: order.id,
                    invoiceResult,
                    removeErrorTags: true
                });

            } else {
                logger.error({ 
                    orderId: order.id,
                    error: invoiceResult.error,
                    details: invoiceResult.details 
                }, 'Invoice creation failed from webhook');

                // Update order with error information
                await this.updateOrderAction.updateWithError({
                    orderId: order.id,
                    error: invoiceResult
                });
            }

        } catch (error) {
            const orderId = req.body?.id || 'unknown';
            
            logger.error({ 
                orderId,
                error: error.message,
                stack: error.stack 
            }, 'Webhook processing failed');

            // Update order with system error
            try {
                await this.updateOrderAction.updateWithError({
                    orderId,
                    error: { message: `System error: ${error.message}` }
                });
            } catch (updateError) {
                logger.error({ 
                    orderId,
                    updateError: updateError.message 
                }, 'Failed to update order with system error');
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
            logger.info({ 
                orderId: order.id, 
                orderName: order.name 
            }, 'Processing Shopify order update webhook for invoice retry');

            // Process retry using action
            const retryResult = await this.retryInvoiceAction.processOrderUpdateForRetry(order);

            if (retryResult.success && !retryResult.skipped) {
                logger.info({ 
                    orderId: order.id,
                    invoiceNumber: retryResult.invoiceResult?.invoice?.number,
                    retryAttempt: retryResult.retryAttempt 
                }, 'Invoice retry successful from webhook');

            } else if (retryResult.skipped) {
                logger.debug({ 
                    orderId: order.id,
                    reason: retryResult.reason 
                }, 'Invoice retry skipped');

            } else {
                logger.warn({ 
                    orderId: order.id,
                    error: retryResult.error,
                    retryAttempt: retryResult.retryAttempt,
                    finalFailure: retryResult.finalFailure 
                }, 'Invoice retry failed from webhook');
            }

        } catch (error) {
            const orderId = req.body?.id || 'unknown';
            
            logger.error({ 
                orderId,
                error: error.message,
                stack: error.stack 
            }, 'Webhook retry processing failed');
        }
    }

    /**
     * Create invoice from admin extension
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async createFromExtension(req, res) {
        try {
            logger.info({ body: req.body }, 'Received invoice creation request from extension');
            
            // Extract and validate request data
            const requestData = this._extractRequestData(req.body);
            const validationError = this._validateRequestData(requestData);
            
            if (validationError) {
                logger.warn({ requestData, validationError }, 'Invalid request data');
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

            logger.info({ 
                orderId, 
                orderName: orderData.name || orderData.order_number,
                invoiceOptions,
                customClient: !!customClient 
            }, 'Processing invoice creation from extension');

            // Step 1: Validate company if B2B and not skipped
            let validatedClient = customClient;
            if (validateCompany && customClient?.cif && !skipAnaf) {
                try {
                    const companyValidation = await this.validateCompanyAction.execute({
                        cif: customClient.cif,
                        includeInactiveCompanies: invoiceOptions.allowInactiveCompanies
                    });

                    if (companyValidation.success) {
                        // Enrich client data with ANAF information
                        validatedClient = await this.validateCompanyAction.enrichClientData(
                            customClient, 
                            customClient.cif
                        );
                        logger.info({ 
                            orderId, 
                            cif: customClient.cif,
                            companyName: companyValidation.company.name 
                        }, 'Company validated successfully with ANAF');
                    } else {
                        logger.warn({ 
                            orderId, 
                            cif: customClient.cif,
                            error: companyValidation.error 
                        }, 'Company validation failed');

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
                    logger.warn({ 
                        orderId, 
                        error: validationError.message 
                    }, 'Company validation failed, proceeding without ANAF enrichment');
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
                logger.info({ 
                    orderId, 
                    invoiceNumber: invoiceResult.invoice.number,
                    invoiceUrl: invoiceResult.invoice.url 
                }, 'Invoice created successfully from extension');

                // Step 3: Update order with invoice information
                try {
                    await this.updateOrderAction.execute({
                        orderId,
                        invoiceResult,
                        removeErrorTags: true,
                        additionalTags: ['MANUAL_INVOICE']
                    });
                } catch (updateError) {
                    logger.warn({ 
                        orderId, 
                        error: updateError.message 
                    }, 'Failed to update order, but invoice was created successfully');
                }

                // Return success response
                return res.json({
                    success: true,
                    invoice: invoiceResult.invoice,
                    message: 'Invoice created successfully'
                });

            } else {
                logger.error({ 
                    orderId, 
                    error: invoiceResult.error,
                    details: invoiceResult.details 
                }, 'Invoice creation failed from extension');

                // Update order with error information
                try {
                    await this.updateOrderAction.updateWithError({
                        orderId,
                        error: invoiceResult
                    });
                } catch (updateError) {
                    logger.warn({ 
                        orderId, 
                        error: updateError.message 
                    }, 'Failed to update order with error information');
                }

                return res.status(400).json({
                    success: false,
                    error: invoiceResult.error,
                    details: invoiceResult.details,
                    retryable: invoiceResult.retryable
                });
            }

        } catch (error) {
            logger.error({ 
                orderId: req.body?.orderId,
                error: error.message,
                stack: error.stack
            }, 'Failed to create invoice from extension');

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
            logger.info({ body: req.body }, 'Received invoice retry request from extension');
            
            const { orderId, orderData, retryOptions = {} } = req.body;

            if (!orderId || !orderData) {
                return res.status(400).json({
                    success: false,
                    error: 'Order ID and order data are required'
                });
            }

            logger.info({ 
                orderId, 
                orderName: orderData.name || orderData.order_number 
            }, 'Processing invoice retry from extension');

            // Execute retry using action
            const retryResult = await this.retryInvoiceAction.execute({
                order: orderData,
                retryAttempt: retryOptions.retryAttempt || 1,
                maxRetries: retryOptions.maxRetries || 3,
                retryOptions
            });

            if (retryResult.success) {
                logger.info({ 
                    orderId, 
                    invoiceNumber: retryResult.invoiceResult?.invoice?.number,
                    retryAttempt: retryResult.retryAttempt 
                }, 'Invoice retry successful from extension');

                return res.json({
                    success: true,
                    invoice: retryResult.invoiceResult?.invoice,
                    retryAttempt: retryResult.retryAttempt,
                    strategyUsed: retryResult.strategyUsed,
                    message: 'Invoice created successfully on retry'
                });

            } else {
                logger.warn({ 
                    orderId, 
                    error: retryResult.error,
                    retryAttempt: retryResult.retryAttempt,
                    finalFailure: retryResult.finalFailure 
                }, 'Invoice retry failed from extension');

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
            logger.error({ 
                orderId: req.body?.orderId,
                error: error.message,
                stack: error.stack
            }, 'Failed to retry invoice from extension');

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

            logger.debug({ orderId }, 'Getting invoice status');

            const invoiceStatus = await this.updateOrderAction.checkInvoiceStatus(orderId);

            return res.json({
                success: true,
                status: invoiceStatus
            });

        } catch (error) {
            logger.error({ 
                orderId: req.params?.orderId,
                error: error.message
            }, 'Failed to get invoice status');

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

            logger.debug({ cif }, 'Validating company with ANAF');

            const validation = await this.validateCompanyAction.execute({
                cif,
                includeInactiveCompanies
            });

            return res.json(validation);

        } catch (error) {
            logger.error({ 
                cif: req.body?.cif,
                error: error.message
            }, 'Failed to validate company');

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
