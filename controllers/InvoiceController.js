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
            console.log(`🛒 Processing Shopify order #${order.name} (ID: ${order.id})`);

            // Transform and create invoice with ANAF company verification (retry logic is in OblioService)
            const invoiceData = await transformOrderWithAnafEnrichment(
                order,
                this.transformShopifyOrderToOblioInvoice.bind(this),
                this.anafService
            );
            if (!invoiceData.products || invoiceData.products.length === 0) {
                throw new Error('No invoiceable items: all line items removed or non-invoiceable (e.g., free shipping).');
            }

            const cleanedInvoiceData = this.sanitizeOblioPayload(invoiceData);
            const oblioResponse = await this.oblioService.createInvoice(cleanedInvoiceData);
            
            console.log(`✅ Invoice #${oblioResponse.data?.number} created successfully for order ${order.name} - Customer: ${order.customer?.email}`);
            
            // Tag the order and set metafields in Shopify
            try {
                // Tag the order
                await this.shopifyService.tagOrder(order.id, [
                    'oblio-invoiced',
                    `FACTURA-${oblioResponse.data?.number || 'unknown'}`
                ]);
                
                console.log(`🏷️ Order ${order.name} tagged: oblio-invoiced, FACTURA-${oblioResponse.data?.number}`);
                
                // Set invoice metafields
                // Use the actual URL from Oblio response, or construct from response data
                const invoiceUrl = oblioResponse.data?.link || `https://www.oblio.eu/docs/invoice?cif=${process.env.OBLIO_COMPANY_CIF}&seriesName=${oblioResponse.data?.seriesName || process.env.OBLIO_INVOICE_SERIES}&number=${oblioResponse.data?.number}`;
                
                await this.shopifyService.setInvoiceMetafields(
                    order.id,
                    oblioResponse.data?.number || 'unknown',
                    invoiceUrl,
                    oblioResponse.data?.seriesName || process.env.OBLIO_INVOICE_SERIES
                );
                
                console.log(`📋 Invoice metafields set for order ${order.name} - URL: ${invoiceUrl}`);
                
            } catch (shopifyError) {
                // Don't fail the whole process if Shopify updates fail
                console.warn(`⚠️ Failed to update Shopify order ${order.id} (invoice still created): ${shopifyError.message}`);
            }
            
        } catch (error) {
            const orderId = req.body?.id || 'unknown';
            
            // Log final failure (after all retries in service layer)
            console.error(`❌ Invoice creation failed permanently for order ${orderId}: ${error.message}`);
            
            // Tag the order and set error metafield
            try {
                // Tag the order with error status
                await this.shopifyService.tagOrder(orderId, [
                    'EROARE FACTURARE',
                    `error-${new Date().toISOString().split('T')[0]}` // error-2025-01-07
                ]);
                
                console.log(`🚨 Order ${orderId} tagged with error status: EROARE FACTURARE, error-${new Date().toISOString().split('T')[0]}`);
                
                // Set error metafield
                const httpStatus = error.response?.status;
                const statusMessage = error.response?.data?.statusMessage || error.response?.data?.message;
                const composedMsg = `Facturare esuata: ${error.message}${httpStatus ? ` (HTTP ${httpStatus})` : ''}${statusMessage ? ` | ${statusMessage}` : ''}. Timestamp: ${new Date().toISOString()}`;

                await this.shopifyService.setErrorMetafield(orderId, composedMsg);
                
                console.log(`📝 Error metafield set for order ${orderId}: ${composedMsg}`);
                
            } catch (shopifyError) {
                console.warn(`⚠️ Failed to update Shopify order ${orderId} with error status - Shopify: ${shopifyError.message}, Original: ${error.message}`);
            }
        }
    }

    /**
     * Transform Shopify order to Oblio invoice format
     * @private
     */
    transformShopifyOrderToOblioInvoice(order) {
        const companyCif = process.env.OBLIO_COMPANY_CIF;
        
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

            // Extract VAT info from line item tax_lines
            let vatPercentage = 21; // Default Romanian standard rate
            let vatName = 'Normala'; // Default
            
            if (item.tax_lines && item.tax_lines.length > 0) {
                const taxRate = item.tax_lines[0].rate;
                vatPercentage = Math.round(taxRate * 100);
                
                // Map current Romanian VAT rates
                if (vatPercentage === 21) {
                    vatName = 'Normala';
                } else if (vatPercentage === 11) {
                    vatName = 'Redusa';
                } else if (vatPercentage === 0) {
                    vatName = 'SFDD';
                }
                
                console.log(`📊 Item "${item.title}" VAT: ${vatPercentage}% (${vatName})`);
            }

            // Add the product line
            products.push({
                name: item.title,
                code: item.sku || item.barcode || String(item.id),
                price: unitPrice,
                quantity: finalQty,
                measuringUnit: 'buc',
                currency: order.currency,
                productType: 'Marfa',
                management: config.oblio.OBLIO_MANAGEMENT,
                vatName: vatName,
                vatPercentage: vatPercentage,
                vatIncluded: order.taxes_included ? 1 : 0
            });

            // Get actual line item discount from Shopify allocations
            // Always use discount_allocations as the authoritative source
            let itemDiscount = 0;
            
            if (Array.isArray(item.discount_allocations) && item.discount_allocations.length > 0) {
                itemDiscount = item.discount_allocations.reduce((sum, alloc) => {
                    return sum + (parseFloat(alloc.amount) || 0);
                }, 0);
                console.log(`💰 Item "${item.title}" has discount: ${itemDiscount} ${order.currency}`);
            }
            
            // Add discount as separate line using Oblio discount object format
            if (itemDiscount > 0) {
                products.push({
                    name: `Discount ${item.title}`,
                    discountType: 'valoric',
                    discount: itemDiscount,
                    discountAllAbove: 0
                });
                console.log(`🎯 Added discount line: "Discount ${item.title}" - ${itemDiscount} ${order.currency}`);
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

        // Final sanitation: remove invalid/zero items (Oblio may reject them)
        // Allow negative prices for discount lines
        products = products.filter(p => {
            // Regular products need price and quantity
            const validProduct = p && typeof p.price === 'number' && !isNaN(p.price) && p.quantity > 0;
            // Discount objects need discount value (no price or quantity required)
            const validDiscount = p && typeof p.discount === 'number' && !isNaN(p.discount) && p.discount > 0;
            
            const isValid = validProduct || validDiscount;
            if (!isValid) {
                // intentionally silent per request to minimize debug logs
            }
            return isValid;
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
                  type: 'Plata card',
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
