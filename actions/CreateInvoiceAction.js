import OblioService from '../services/OblioService.js';
import { transformOrderWithAnafEnrichment, logger, formatRomanianAddress, getCompanyNameFromOrder } from '../utils/index.js';
import config from '../config/AppConfig.js';

/**
 * Action: Create Invoice
 * 
 * Handles the core business logic of creating invoices with Oblio.
 * Supports both automatic (webhook) and manual (extension) invoice creation.
 * 
 * Single Responsibility: Invoice creation and Oblio integration
 */
export class CreateInvoiceAction {
    constructor(oblioService = null, anafService = null) {
        // Allow dependency injection for testing
        this.oblioService = oblioService || new OblioService(
            process.env.OBLIO_EMAIL,
            process.env.OBLIO_API_TOKEN
        );
        this.anafService = anafService;
    }

    /**
     * Execute invoice creation
     * @param {Object} params - Invoice parameters
     * @returns {Promise<Object>} Invoice creation result
     */
    async execute({
        order,
        invoiceOptions = {},
        customClient = null,
        anafService = null
    }) {
        try {
            logger.info({ 
                orderId: order.id, 
                orderName: order.name || order.order_number,
                customClient: !!customClient,
                invoiceOptions
            }, 'Starting invoice creation');

            // Use provided ANAF service or instance service
            const anafServiceToUse = anafService || this.anafService;

            // Transform order to Oblio invoice format
            let invoiceData;
            if (anafServiceToUse) {
                // Use ANAF enrichment for automatic B2B company detection
                invoiceData = await transformOrderWithAnafEnrichment(
                    order,
                    this._transformShopifyOrderToOblioInvoice.bind(this),
                    anafServiceToUse,
                    customClient,
                    invoiceOptions
                );
            } else {
                // Direct transformation without ANAF enrichment
                invoiceData = this._transformShopifyOrderToOblioInvoice(
                    order, 
                    customClient, 
                    invoiceOptions
                );
            }

            // Validate invoice data
            this._validateInvoiceData(invoiceData, order);

            // Clean the payload
            const cleanedInvoiceData = this._sanitizeOblioPayload(invoiceData);

            logger.info({
                orderId: order.id,
                clientName: invoiceData.client?.name,
                clientCif: invoiceData.client?.cif,
                productsCount: invoiceData.products?.length,
                invoiceTotal: this._calculateInvoiceTotal(invoiceData.products),
                seriesName: invoiceData.seriesName
            }, 'Invoice data prepared, creating with Oblio');

            // Create invoice with Oblio
            const oblioResponse = await this.oblioService.createInvoice(cleanedInvoiceData);

            const result = {
                success: true,
                invoice: {
                    number: oblioResponse.data?.number,
                    series: oblioResponse.data?.seriesName || invoiceData.seriesName,
                    url: oblioResponse.data?.link || this._constructInvoiceUrl(oblioResponse.data),
                    total: this._calculateInvoiceTotal(invoiceData.products),
                    currency: invoiceData.products?.[0]?.currency || 'RON',
                    issueDate: invoiceData.issueDate,
                    clientName: invoiceData.client?.name,
                    clientCif: invoiceData.client?.cif
                },
                oblioResponse: oblioResponse.data,
                invoiceData: cleanedInvoiceData
            };

            logger.info({
                orderId: order.id,
                invoiceNumber: result.invoice.number,
                invoiceUrl: result.invoice.url,
                clientName: result.invoice.clientName
            }, 'Invoice created successfully');

            return result;

        } catch (error) {
            logger.error({
                orderId: order.id,
                error: error.message,
                stack: error.stack,
                oblioError: error.response?.data,
                statusCode: error.response?.status
            }, 'Failed to create invoice');

            return {
                success: false,
                error: error.message,
                details: error.response?.data || error.details,
                statusCode: error.response?.status,
                retryable: this._isRetryableError(error)
            };
        }
    }

    /**
     * Transform Shopify order to Oblio invoice format
     * Enhanced version of the original method with extension support
     * @private
     */
    _transformShopifyOrderToOblioInvoice(order, customClient = null, invoiceOptions = {}) {
        const companyCif = process.env.OBLIO_COMPANY_CIF;
        
        // Build products array from line items
        let products = this._buildProductsFromLineItems(order, invoiceOptions);

        // Add shipping if exists and not excluded
        if (!invoiceOptions.excludeShipping && order.shipping_lines?.length > 0) {
            products = products.concat(this._buildShippingProducts(order));
        }

        // Filter valid products
        products = this._filterValidProducts(products);

        // Build client object - use custom client if provided, otherwise extract from order
        const client = customClient || this._buildClientFromOrder(order);

        // Build base invoice data
        const invoiceData = {
            cif: companyCif,
            client,
            seriesName: invoiceOptions.seriesName || process.env.OBLIO_INVOICE_SERIES || 'PRS',
            issueDate: invoiceOptions.issueDate || new Date().toISOString().split('T')[0],
            language: invoiceOptions.language || 'RO',
            mentions: invoiceOptions.mentions || `Factura emisa pentru comanda ${order.name || order.order_number}`,
            sendEmail: invoiceOptions.sendEmail !== undefined ? invoiceOptions.sendEmail : 1,
            useStock: invoiceOptions.useStock !== undefined ? invoiceOptions.useStock : 1,
            products
        };

        // Add collection info for paid orders
        if (invoiceOptions.markAsPaid || this._isOrderPaid(order)) {
            const collectDate = invoiceOptions.collectDate || 
                this._getOrderPaymentDate(order) || 
                new Date().toISOString().split('T')[0];

            invoiceData.collectDate = collectDate;
            invoiceData.collect = {
                type: invoiceOptions.paymentMethod || 'Card',
                documentNumber: String(order.order_number || order.name || order.id)
            };
        }

        return invoiceData;
    }

    /**
     * Build products array from line items
     * @private
     */
    _buildProductsFromLineItems(order, invoiceOptions = {}) {
        const products = [];
        const selectedItems = invoiceOptions.selectedLineItems;

        order.line_items.forEach(item => {
            // Skip if specific items selected and this isn't one of them
            if (selectedItems && !selectedItems.includes(item.id)) {
                return;
            }

            // Calculate final quantity after refunds
            const baseQty = item.quantity || 0;
            const refundedQty = this._getRefundedQuantity(order, item.id);
            const finalQty = Math.max(0, baseQty - refundedQty);

            if (finalQty <= 0) return;

            // Get VAT information
            const vatInfo = this._extractVatInfo(item);
            
            // Add product
            products.push({
                name: item.title,
                code: item.sku || item.barcode || String(item.id),
                price: parseFloat(item.price),
                quantity: finalQty,
                measuringUnit: 'buc',
                currency: order.currency,
                productType: 'Marfa',
                management: config.oblio.OBLIO_MANAGEMENT,
                vatName: vatInfo.name,
                vatPercentage: vatInfo.percentage,
                vatIncluded: order.taxes_included ? 1 : 0
            });

            // Add discount if exists
            const itemDiscount = this._getItemDiscount(item);
            if (itemDiscount > 0) {
                products.push({
                    name: `Discount ${item.title}`,
                    discountType: 'valoric',
                    discount: itemDiscount,
                    discountAllAbove: 0
                });
            }
        });

        return products;
    }

    /**
     * Build shipping products
     * @private
     */
    _buildShippingProducts(order) {
        const shippingProducts = [];
        
        order.shipping_lines.forEach(shipping => {
            const shippingPrice = parseFloat(shipping.discounted_price ?? shipping.price);
            if (!isNaN(shippingPrice) && shippingPrice > 0) {
                shippingProducts.push({
                    name: shipping.title || 'Transport',
                    price: shippingPrice,
                    quantity: 1,
                    measuringUnit: 'buc',
                    currency: order.currency,
                    productType: 'Serviciu',
                    management: config.oblio.OBLIO_MANAGEMENT
                });
            }
        });

        return shippingProducts;
    }

    /**
     * Build client object from order
     * @private
     */
    _buildClientFromOrder(order) {
        // Build address
        const billingAddr = order.billing_address ? formatRomanianAddress(order.billing_address) : null;
        const shippingAddr = !billingAddr && order.shipping_address ? formatRomanianAddress(order.shipping_address) : null;
        const addr = billingAddr || shippingAddr || { street: '', city: '', state: '', zip: '', country: 'România' };
        const singleLineAddress = [addr.street, addr.zip, addr.country].filter(Boolean).join(', ');

        return {
            name: (order.billing_address?.company && (getCompanyNameFromOrder(order) || order.billing_address.company))
                || `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim()
                || order.customer?.email,
            code: String(order.customer?.id || order.customer?.email || order.id),
            address: singleLineAddress,
            state: addr.state,
            city: addr.city,
            country: addr.country,
            iban: '',
            bank: '',
            email: order.customer?.email || '',
            phone: order.billing_address?.phone || order.shipping_address?.phone || '',
            contact: `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim()
        };
    }

    /**
     * Helper methods for data extraction
     * @private
     */
    _getRefundedQuantity(order, lineItemId) {
        return (order.refunds || []).reduce((acc, refund) => {
            const match = (refund.refund_line_items || []).find(rli => rli?.line_item?.id === lineItemId);
            return acc + (match?.quantity || 0);
        }, 0);
    }

    _extractVatInfo(item) {
        let vatPercentage = 21; // Default Romanian standard rate
        let vatName = 'Normala';
        
        if (item.tax_lines && item.tax_lines.length > 0) {
            const taxRate = item.tax_lines[0].rate;
            vatPercentage = Math.round(taxRate * 100);
            
            if (vatPercentage === 21) {
                vatName = 'Normala';
            } else if (vatPercentage === 11) {
                vatName = 'Redusa';
            } else if (vatPercentage === 0) {
                vatName = 'SFDD';
            }
        }

        return { percentage: vatPercentage, name: vatName };
    }

    _getItemDiscount(item) {
        if (!Array.isArray(item.discount_allocations)) return 0;
        
        return item.discount_allocations.reduce((sum, alloc) => {
            return sum + (parseFloat(alloc.amount) || 0);
        }, 0);
    }

    _isOrderPaid(order) {
        return (order.financial_status || '').toLowerCase() === 'paid';
    }

    _getOrderPaymentDate(order) {
        return (order.processed_at || order.closed_at || order.updated_at || new Date().toISOString()).split('T')[0];
    }

    _filterValidProducts(products) {
        return products.filter(p => {
            const validProduct = p && typeof p.price === 'number' && !isNaN(p.price) && p.quantity > 0;
            const validDiscount = p && typeof p.discount === 'number' && !isNaN(p.discount) && p.discount > 0;
            return validProduct || validDiscount;
        });
    }

    _calculateInvoiceTotal(products) {
        if (!products || !Array.isArray(products)) return 0;
        
        return products.reduce((total, product) => {
            if (product.discount) {
                return total - product.discount; // Subtract discounts
            }
            return total + (product.price * product.quantity);
        }, 0);
    }

    _validateInvoiceData(invoiceData, order) {
        if (!invoiceData.products || invoiceData.products.length === 0) {
            throw new Error('No invoiceable items: all line items removed or non-invoiceable (e.g., free shipping).');
        }

        if (!invoiceData.client || !invoiceData.client.name) {
            throw new Error('Client information is missing or incomplete.');
        }

        if (!invoiceData.cif) {
            throw new Error('Company CIF is required for invoice creation.');
        }
    }

    _constructInvoiceUrl(oblioData) {
        if (!oblioData) return '';
        
        return `https://www.oblio.eu/docs/invoice?cif=${process.env.OBLIO_COMPANY_CIF}&seriesName=${oblioData.seriesName || process.env.OBLIO_INVOICE_SERIES}&number=${oblioData.number}`;
    }

    _isRetryableError(error) {
        // Network errors, timeouts, and 5xx errors are retryable
        if (!error.response) return true; // Network error
        
        const status = error.response.status;
        return status >= 500 || status === 429; // Server errors or rate limiting
    }

    /**
     * Remove undefined/null values from Oblio payload to avoid API errors
     * @private
     */
    _sanitizeOblioPayload(payload) {
        const sanitize = (obj) => {
            if (Array.isArray(obj)) {
                return obj.map(sanitize);
            }
            if (obj && typeof obj === 'object') {
                const cleaned = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (value !== undefined && value !== null) {
                        cleaned[key] = sanitize(value);
                    }
                }
                return cleaned;
            }
            return obj;
        };
        
        return sanitize(payload);
    }
}

export default CreateInvoiceAction;
