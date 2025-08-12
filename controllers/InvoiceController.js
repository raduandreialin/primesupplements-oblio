import OblioService from '../services/OblioService.js';
import ShopifyService from '../services/ShopifyService.js';
import AnafService from '../services/AnafService.js';
import { transformOrderWithAnafEnrichment, formatRomanianAddress, getCompanyNameFromOrder, logger } from '../utils/index.js';
import config from '../config/AppConfig.js';
import dotenv from 'dotenv';
dotenv.config();

class InvoiceController {
    constructor() {
        // Initialize Oblio service (singleton pattern)
        this.oblioService = new OblioService(
            process.env.OBLIO_EMAIL,
            process.env.OBLIO_API_TOKEN
        );

        // Initialize Shopify service (singleton pattern)
        this.shopifyService = new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
        
        // Initialize ANAF service for company verification
        this.anafService = new AnafService();
    }

    /**
     * Create invoice from Shopify order fulfillment
     * Always returns 200 to Shopify (webhook acknowledgment)
     */
    async createFromShopifyOrder(req, res) {
        // Always acknowledge webhook receipt first
        res.status(200).json({ received: true });
        
        try {
            const order = req.body;
            logger.info({ orderId: order.id }, 'Processing Shopify order');
            // Log discount information
            logger.info({ 
                orderId: order.id, 
                current_total_discounts: order.current_total_discounts,
                total_discounts: order.total_discounts,
                discount_applications: order.discount_applications 
            }, 'Shopify discount info');
            // Transform and create invoice with ANAF company verification (retry logic is in OblioService)
            const invoiceData = await transformOrderWithAnafEnrichment(
                order,
                this.transformShopifyOrderToOblioInvoice.bind(this),
                this.anafService
            );
            if (!invoiceData.products || invoiceData.products.length === 0) {
                throw new Error('No invoiceable items: all line items removed or non-invoiceable (e.g., free shipping).');
            }

            // Debug: log sanitized payload to help diagnose 400s
            // Clean payload: remove undefined/null values before sending to Oblio
            const cleanedInvoiceData = this.sanitizeOblioPayload(invoiceData);
            
            

            const oblioResponse = await this.oblioService.createInvoice(cleanedInvoiceData);
            
            logger.info({
                orderId: order.id,
                invoiceNumber: oblioResponse.data?.number,
                customer: order.customer?.email
            }, 'Invoice created successfully');
            
            // Tag the order and set metafields in Shopify
            try {
                // Tag the order
                await this.shopifyService.tagOrder(order.id, [
                    'oblio-invoiced',
                    `FACTURA-${oblioResponse.data?.number || 'unknown'}`
                ]);
                
                logger.info({
                    orderId: order.id,
                    tags: ['oblio-invoiced', `FACTURA-${oblioResponse.data?.number || 'unknown'}`]
                }, 'Order tagged successfully');
                
                // Set invoice metafields
                // Use the actual URL from Oblio response, or construct from response data
                const invoiceUrl = oblioResponse.data?.link || `https://www.oblio.eu/docs/invoice?cif=${process.env.OBLIO_COMPANY_CIF}&seriesName=${oblioResponse.data?.seriesName || process.env.OBLIO_INVOICE_SERIES}&number=${oblioResponse.data?.number}`;
                
                await this.shopifyService.setInvoiceMetafields(
                    order.id,
                    oblioResponse.data?.number || 'unknown',
                    invoiceUrl,
                    oblioResponse.data?.seriesName || process.env.OBLIO_INVOICE_SERIES
                );
                
                logger.info({
                    orderId: order.id,
                    invoiceNumber: oblioResponse.data?.number,
                    invoiceUrl
                }, 'Invoice metafields set successfully');
                
            } catch (shopifyError) {
                // Don't fail the whole process if Shopify updates fail
                logger.warn({
                    orderId: order.id,
                    error: shopifyError.message
                }, 'Failed to update Shopify order (invoice still created)');
            }
            
        } catch (error) {
            const orderId = req.body?.id || 'unknown';
            
            // Log final failure (after all retries in service layer)
            logger.error({
                orderId,
                error: error.message
            }, 'Invoice creation failed permanently');
            
            // Tag the order and set error metafield
            try {
                // Tag the order with error status
                await this.shopifyService.tagOrder(orderId, [
                    'EROARE FACTURARE',
                    `error-${new Date().toISOString().split('T')[0]}` // error-2025-01-07
                ]);
                
                logger.info({
                    orderId,
                    tags: ['EROARE FACTURARE', `error-${new Date().toISOString().split('T')[0]}`]
                }, 'Order tagged with error status');
                
                // Set error metafield
                const httpStatus = error.response?.status;
                const statusMessage = error.response?.data?.statusMessage || error.response?.data?.message;
                const composedMsg = `Facturare esuata: ${error.message}${httpStatus ? ` (HTTP ${httpStatus})` : ''}${statusMessage ? ` | ${statusMessage}` : ''}. Timestamp: ${new Date().toISOString()}`;

                await this.shopifyService.setErrorMetafield(orderId, composedMsg);
                
                logger.info({
                    orderId,
                    errorMessage: composedMsg
                }, 'Error metafield set successfully');
                
            } catch (shopifyError) {
                logger.warn({
                    orderId,
                    shopifyError: shopifyError.message,
                    originalError: error.message
                }, 'Failed to update Shopify order with error status');
            }
        }
    }

    /**
     * Transform Shopify order to Oblio invoice format
     * @private
     */
    transformShopifyOrderToOblioInvoice(order) {
        const companyCif = process.env.OBLIO_COMPANY_CIF;
        
        const totalDiscounts = parseFloat(order.current_total_discounts || 0);
        
        // Calculate total order value to distribute discounts proportionally
        const totalOrderValue = order.line_items.reduce((sum, item) => {
            const qty = item.quantity || 0;
            const price = parseFloat(item.price) || 0;
            return sum + (qty * price);
        }, 0);

        // Base products from line items - use original prices and add individual discount lines
        let products = [];
        
        order.line_items.forEach(item => {
            // Base on original ordered quantity
            const baseQty = item.quantity || 0;

            // Subtract refunded quantities (if any)
            const refundedQty = (order.refunds || []).reduce((acc, refund) => {
                const match = (refund.refund_line_items || []).find(rli => rli?.line_item?.id === item.id);
                return acc + (match?.quantity || 0);
            }, 0);

            const finalQty = Math.max(0, baseQty - refundedQty);
            if (finalQty <= 0) {
                return;
            }

            // Use original unit price
            const unitPrice = parseFloat(item.price);

            // Add the product line
            products.push({
                name: item.title,
                code: item.sku || item.barcode || String(item.id),
                price: unitPrice,
                quantity: finalQty,
                measuringUnit: 'buc',
                currency: order.currency,
                productType: 'Marfa',
                management: config.oblio.OBLIO_MANAGEMENT
            });

            // Calculate proportional discount for this item
            if (totalDiscounts > 0 && totalOrderValue > 0) {
                const lineTotal = baseQty * unitPrice;
                const itemDiscount = (lineTotal / totalOrderValue) * totalDiscounts;
                
                if (itemDiscount > 0) {
                    // Add individual discount line for this product
                    products.push({
                        name: `Discount ${item.title}`,
                        price: -parseFloat(itemDiscount.toFixed(2)),
                        quantity: 1,
                        measuringUnit: 'buc',
                        currency: order.currency,
                        productType: 'Reducere comerciala acordata',
                        management: config.oblio.OBLIO_MANAGEMENT
                    });
                }
            }
        });

        // Add shipping if exists
        if (order.shipping_lines?.length > 0) {
            const s = order.shipping_lines[0];
            const shippingPrice = parseFloat((s.discounted_price ?? s.price));
            if (!isNaN(shippingPrice) && shippingPrice > 0) {
                products.push({
                    name: 'Transport',
                    price: shippingPrice,
                    quantity: 1,
                    measuringUnit: 'buc',
                    currency: order.currency,
                    productType: 'Serviciu',
                    management: config.oblio.OBLIO_MANAGEMENT
                });
            }
        }

        // Note on discounts:
        // We add individual discount lines per product as negative price items, matching the pattern from old invoices.
        // Each discount line is proportional to the product's share of total order value.

        // Final sanitation: remove invalid/zero items (Oblio may reject them)
        // Allow negative prices for discount lines
        products = products.filter(p => {
            const validProduct = p && typeof p.price === 'number' && !isNaN(p.price) && p.quantity > 0;
            if (!validProduct) {
                // intentionally silent per request to minimize debug logs
            }
            return validProduct;
        });

        // Build address fields per Oblio expected format
        const billingAddr = order.billing_address ? formatRomanianAddress(order.billing_address) : null;
        const shippingAddr = !billingAddr && order.shipping_address ? formatRomanianAddress(order.shipping_address) : null;
        const addr = billingAddr || shippingAddr || { street: '', city: '', state: '', zip: '', country: 'România' };
        const singleLineAddress = [addr.street, addr.zip, addr.country].filter(Boolean).join(', ');

        // Build client object (cif/rc will be added by ANAF enrichment if company order)
        const client = {
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

        // Determine if the order is fully paid in Shopify to mark the invoice as collected
        const isPaid = (order.financial_status || '').toLowerCase() === 'paid';

        // Prefer the date when the order was processed/paid; fallback to today
        const collectDateIso = (order.processed_at || order.closed_at || order.updated_at || new Date().toISOString());
        const collectDate = collectDateIso.split('T')[0];

        // Build collect object only for fully paid orders. Value is optional (defaults to invoice total in Oblio)
        const collect = isPaid
            ? {
                  type: 'Ordin de plata',
                  documentNumber: String(order.order_number || order.name || order.id)
              }
            : undefined;

        return {
            cif: companyCif,
            client,
            seriesName: process.env.OBLIO_INVOICE_SERIES || 'FCT',
            issueDate: new Date().toISOString().split('T')[0],
            language: 'RO',
            mentions: `Factura emisa pentru comanda ${order.name}`,
            sendEmail: 1,
            useStock: 1,
            collectDate: isPaid ? collectDate : undefined,
            collect,
            products
        };
    }

    /**
     * Remove undefined/null values from Oblio payload to avoid API errors
     * @param {Object} payload - Invoice payload
     * @returns {Object} - Cleaned payload
     */
    sanitizeOblioPayload(payload) {
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

export default new InvoiceController();
