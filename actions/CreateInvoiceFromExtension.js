import { logger } from '../utils/index.js';
import OblioService from '../services/OblioService.js';
import config from '../config/AppConfig.js';

/**
 * GraphQL-Native Invoice Creation Action
 * 
 * This action works directly with Shopify GraphQL order data,
 * eliminating the need for REST transformation.
 */
export class CreateInvoiceFromExtensionAction {
    constructor(oblioService = null) {
        this.oblioService = oblioService || new OblioService();
    }

    /**
     * Execute invoice creation from GraphQL order data
     * @param {Object} params - Invoice parameters
     * @returns {Promise<Object>} Invoice creation result
     */
    async execute({
        graphqlOrder,
        orderNumber,
        invoiceOptions = {},
        customClient = null
    }) {
        try {
            logger.info({ 
                orderId: graphqlOrder.id,
                orderName: graphqlOrder.name,
                orderNumber,
                customClient: !!customClient,
                invoiceOptions
            }, 'Starting GraphQL invoice creation');

            // Transform GraphQL order directly to Oblio format
            const invoiceData = this._transformGraphQLOrderToOblio(
                graphqlOrder, 
                orderNumber,
                customClient, 
                invoiceOptions
            );

            // Validate invoice data
            this._validateInvoiceData(invoiceData, graphqlOrder);

            // Clean the payload
            const cleanedInvoiceData = this._sanitizeOblioPayload(invoiceData);

            logger.info({
                orderId: graphqlOrder.id,
                orderNumber,
                productCount: cleanedInvoiceData.products?.length || 0,
                clientName: cleanedInvoiceData.client?.name,
                products: cleanedInvoiceData.products
            }, 'Sending invoice to Oblio');

            // Create invoice via Oblio API
            const oblioResponse = await this.oblioService.createInvoice(cleanedInvoiceData);

            logger.info({
                orderId: graphqlOrder.id,
                orderNumber,
                oblioResponse: {
                    status: oblioResponse.status,
                    message: oblioResponse.message,
                    hasData: !!oblioResponse.data
                }
            }, 'Oblio API response received');

            // Check if the response contains invoice data (successful response)
            if (oblioResponse && oblioResponse.id && oblioResponse.number) {
                logger.info({
                    orderId: graphqlOrder.id,
                    invoiceNumber: oblioResponse.number,
                    invoiceUrl: oblioResponse.link
                }, 'Invoice created successfully');

                return {
                    success: true,
                    invoice: {
                        number: oblioResponse.number,
                        url: oblioResponse.link,
                        series: oblioResponse.seriesName,
                        issueDate: oblioResponse.issueDate || new Date().toISOString().split('T')[0],
                        total: oblioResponse.total
                    },
                    oblioData: oblioResponse
                };
            } else {
                // Handle error response
                const errorMessage = oblioResponse.message || oblioResponse.error || 'Unknown Oblio API error';
                logger.error({
                    orderId: graphqlOrder.id,
                    orderNumber,
                    oblioResponse: oblioResponse
                }, 'Oblio API returned error response');
                
                throw new Error(errorMessage);
            }

        } catch (error) {
            logger.error({
                orderId: graphqlOrder.id,
                orderNumber,
                error: error.message,
                stack: error.stack
            }, 'GraphQL invoice creation failed');

            return {
                success: false,
                error: error.message,
                retryable: this._isRetryableError(error)
            };
        }
    }

    /**
     * Transform GraphQL order directly to Oblio invoice format
     * @private
     */
    _transformGraphQLOrderToOblio(graphqlOrder, orderNumber, customClient = null, invoiceOptions = {}) {
        const companyCif = process.env.OBLIO_COMPANY_CIF;
        
        // Build products array from GraphQL line items
        let products = this._buildProductsFromGraphQLLineItems(graphqlOrder, invoiceOptions);

        // Add shipping if exists and not excluded
        if (!invoiceOptions.excludeShipping && graphqlOrder.shippingLines?.edges?.length > 0) {
            products = products.concat(this._buildShippingProductsFromGraphQL(graphqlOrder));
        }

        // Filter valid products
        products = this._filterValidProducts(products);

        // Build client object - use custom client if provided, otherwise extract from GraphQL order
        const client = customClient || this._buildClientFromGraphQLOrder(graphqlOrder);

        // Build base invoice data
        const invoiceData = {
            cif: companyCif,
            client,
            seriesName: invoiceOptions.seriesName || process.env.OBLIO_INVOICE_SERIES || 'PRS',
            issueDate: invoiceOptions.issueDate || new Date().toISOString().split('T')[0],
            language: invoiceOptions.language || 'RO',
            mentions: invoiceOptions.mentions || `Factura emisa pentru comanda ${graphqlOrder.name || orderNumber}`,
            sendEmail: invoiceOptions.sendEmail !== undefined ? invoiceOptions.sendEmail : 1,
            useStock: invoiceOptions.useStock !== undefined ? invoiceOptions.useStock : 1,
            products
        };

        // Add collection info for paid orders
        if (invoiceOptions.markAsPaid && this._isOrderPaid(graphqlOrder)) {
            invoiceData.collect = {
                type: invoiceOptions.paymentMethod || 'Card',
                date: invoiceOptions.collectDate || new Date().toISOString().split('T')[0]
            };
        }

        return invoiceData;
    }

    /**
     * Build products array from GraphQL line items
     * @private
     */
    _buildProductsFromGraphQLLineItems(graphqlOrder, invoiceOptions = {}) {
        const products = [];
        const selectedItems = invoiceOptions.selectedLineItems;

        if (!graphqlOrder.lineItems?.edges) {
            logger.warn({ orderId: graphqlOrder.id }, 'No line items found in GraphQL order');
            return products;
        }

        graphqlOrder.lineItems.edges.forEach(edge => {
            const item = edge.node;
            
            // Skip if specific items selected and this isn't one of them
            if (selectedItems && !selectedItems.includes(item.id)) {
                return;
            }

            // Calculate final quantity (handle refunds if needed)
            const finalQty = item.quantity || 0;
            if (finalQty <= 0) return;

            // Extract price from GraphQL structure
            const unitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || '0');
            if (unitPrice <= 0) {
                logger.warn({ 
                    orderId: graphqlOrder.id, 
                    itemId: item.id, 
                    itemTitle: item.title 
                }, 'Skipping item with zero or invalid price');
                return;
            }

            // Get VAT information from tax lines
            const vatInfo = this._extractVatInfoFromGraphQL(item);
            
            // Add product
            products.push({
                name: item.title,
                code: item.sku || String(item.id).replace('gid://shopify/LineItem/', ''),
                price: unitPrice,
                quantity: finalQty,
                measuringUnit: 'buc',
                currency: graphqlOrder.totalPriceSet?.shopMoney?.currencyCode || 'RON',
                productType: 'Marfa',
                management: config.oblio.OBLIO_MANAGEMENT,
                vatName: vatInfo.name,
                vatPercentage: vatInfo.percentage,
                vatIncluded: graphqlOrder.taxesIncluded ? 1 : 0
            });

            // Add discount if exists
            const itemDiscount = this._getItemDiscountFromGraphQL(item);
            if (itemDiscount > 0) {
                logger.info({
                    orderId: graphqlOrder.id,
                    itemTitle: item.title,
                    discountAmount: itemDiscount,
                    discountAllocations: item.discountAllocations
                }, 'Adding discount for item');
                
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
     * Build shipping products from GraphQL shipping lines
     * @private
     */
    _buildShippingProductsFromGraphQL(graphqlOrder) {
        const shippingProducts = [];

        if (!graphqlOrder.shippingLines?.edges) {
            return shippingProducts;
        }

        graphqlOrder.shippingLines.edges.forEach(edge => {
            const shippingLine = edge.node;
            const shippingPrice = parseFloat(shippingLine.originalPriceSet?.shopMoney?.amount || '0');
            
            if (shippingPrice > 0) {
                shippingProducts.push({
                    name: shippingLine.title || 'Transport',
                    price: shippingPrice,
                    quantity: 1,
                    measuringUnit: 'buc',
                    currency: graphqlOrder.totalPriceSet?.shopMoney?.currencyCode || 'RON',
                    productType: 'Serviciu',
                    management: config.oblio.OBLIO_MANAGEMENT
                });
            }
        });

        return shippingProducts;
    }

    /**
     * Build client data from GraphQL order
     * @private
     */
    _buildClientFromGraphQLOrder(graphqlOrder) {
        const billingAddr = graphqlOrder.billingAddress;
        const shippingAddr = graphqlOrder.shippingAddress;
        const addr = billingAddr || shippingAddr;

        if (!addr) {
            return {
                name: 'Customer',
                address: 'Address not provided',
                state: '',
                city: 'Bucuresti',
                country: 'România',
                email: graphqlOrder.email || graphqlOrder.customer?.email || '',
                phone: '',
                contact: 'Customer'
            };
        }

        const fullName = `${addr.firstName || ''} ${addr.lastName || ''}`.trim();
        const clientName = addr.company || fullName || graphqlOrder.customer?.email || 'Customer';

        return {
            name: clientName,
            cif: this._extractCifFromCompany(addr.company),
            address: this._buildAddressString(addr),
            state: addr.province || '',
            city: addr.city || 'Bucuresti',
            country: addr.country || 'România',
            email: graphqlOrder.email || graphqlOrder.customer?.email || '',
            phone: addr.phone || '',
            contact: fullName || 'Customer'
        };
    }

    /**
     * Extract VAT info from GraphQL tax lines
     * @private
     */
    _extractVatInfoFromGraphQL(item) {
        let vatPercentage = 21; // Default Romanian standard rate (matches original)
        let vatName = 'Normala';
        
        if (item.taxLines && item.taxLines.length > 0) {
            const taxRate = item.taxLines[0].rate;
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

    /**
     * Get item discount from GraphQL discount allocations
     * @private
     */
    _getItemDiscountFromGraphQL(item) {
        if (!item.discountAllocations || item.discountAllocations.length === 0) {
            return 0;
        }

        return item.discountAllocations.reduce((total, allocation) => {
            const amount = parseFloat(allocation.allocatedAmountSet?.shopMoney?.amount || '0');
            return total + amount;
        }, 0);
    }

    /**
     * Check if GraphQL order is paid
     * @private
     */
    _isOrderPaid(graphqlOrder) {
        return graphqlOrder.displayFinancialStatus?.toLowerCase() === 'paid';
    }

    /**
     * Extract CIF from company name
     * @private
     */
    _extractCifFromCompany(company) {
        if (!company) return undefined;
        
        const cifMatch = company.match(/\b(?:CIF|CUI|J\d+\/\d+)\s*:?\s*([A-Z0-9]+)/i);
        return cifMatch ? cifMatch[1] : undefined;
    }

    /**
     * Build address string from GraphQL address
     * @private
     */
    _buildAddressString(addr) {
        const parts = [
            addr.address1,
            addr.address2
        ].filter(Boolean);

        return parts.join(', ') || 'Address not provided';
    }

    /**
     * Filter valid products
     * @private
     */
    _filterValidProducts(products) {
        return products.filter(product => {
            // Discount products don't have price/quantity, only discount amount
            const isDiscount = product.discountType && product.discount !== undefined;
            const isValidProduct = product.name && product.price > 0 && product.quantity > 0;
            const isValid = isDiscount || isValidProduct;
            
            if (!isValid) {
                logger.warn({ product }, 'Filtering out invalid product');
            }
            
            return isValid;
        });
    }

    /**
     * Validate invoice data
     * @private
     */
    _validateInvoiceData(invoiceData, graphqlOrder) {
        if (!invoiceData.products || invoiceData.products.length === 0) {
            throw new Error('No invoiceable items: all line items removed or non-invoiceable (e.g., free shipping).');
        }

        if (!invoiceData.client || !invoiceData.client.name) {
            throw new Error('Invalid client data: client name is required');
        }

        if (!invoiceData.cif) {
            throw new Error('Company CIF is required for invoice creation');
        }
    }

    /**
     * Check if error is retryable
     * @private
     */
    _isRetryableError(error) {
        const retryableMessages = [
            'timeout',
            'network',
            'connection',
            'rate limit',
            '429',
            '500',
            '502',
            '503',
            '504'
        ];

        return retryableMessages.some(msg => 
            error.message.toLowerCase().includes(msg)
        );
    }

    /**
     * Remove undefined/null values from Oblio payload
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

export default CreateInvoiceFromExtensionAction;
