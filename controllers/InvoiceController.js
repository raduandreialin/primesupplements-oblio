import OblioService from '../services/OblioService.js';
import ShopifyService from '../services/ShopifyService.js';
import AnafService from '../services/AnafService.js';
import { transformOrderWithAnafEnrichment, formatRomanianAddress, getCompanyNameFromOrder } from '../utils/index.js';
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
            console.log('✅ Processing Shopify order:', order.id);
            // console.log('Order:', order);
            
            // Transform and create invoice with ANAF company verification (retry logic is in OblioService)
            const invoiceData = await transformOrderWithAnafEnrichment(
                order,
                this.transformShopifyOrderToOblioInvoice.bind(this),
                this.anafService
            );
            // Safety: do not call Oblio if no valid products
            if (!invoiceData.products || invoiceData.products.length === 0) {
                throw new Error('No invoiceable items: all line items removed or non-invoiceable (e.g., free shipping).');
            }

            // Debug: log sanitized payload to help diagnose 400s
            console.log('🧪 Oblio invoice payload (sanitized):', {
                cif: invoiceData.cif,
                seriesName: invoiceData.seriesName,
                issueDate: invoiceData.issueDate,
                client: {
                    name: invoiceData.client?.name,
                    cif: invoiceData.client?.cif,
                    rc: invoiceData.client?.rc,
                    code: invoiceData.client?.code,
                    address: invoiceData.client?.address,
                    state: invoiceData.client?.state,
                    city: invoiceData.client?.city,
                    country: invoiceData.client?.country,
                    iban: invoiceData.client?.iban,
                    bank: invoiceData.client?.bank,
                    email: invoiceData.client?.email,
                    phone: invoiceData.client?.phone,
                    contact: invoiceData.client?.contact,
                    vatPayer: invoiceData.client?.vatPayer,
                },
                products: invoiceData.products?.map(p => ({
                    name: p.name,
                    code: p.code,
                    price: p.price,
                    quantity: p.quantity,
                    measuringUnit: p.measuringUnit,
                    currency: p.currency,
                    vatName: p.vatName
                }))
            });

            const oblioResponse = await this.oblioService.createInvoice(invoiceData);
            
            console.log('🎉 Invoice created successfully:', {
                orderId: order.id,
                invoiceNumber: oblioResponse.data?.number,
                customer: order.customer?.email
            });
            
            // Tag the order and set metafields in Shopify
            try {
                // Tag the order
                await this.shopifyService.tagOrder(order.id, [
                    'oblio-invoiced',
                    `FACTURA-${oblioResponse.data?.number || 'unknown'}`
                ]);
                
                console.log('🏷️ Order tagged successfully:', {
                    orderId: order.id,
                    tags: ['oblio-invoiced', `FACTURA-${oblioResponse.data?.number || 'unknown'}`]
                });
                
                // Set invoice metafields
                // Use the actual URL from Oblio response, or construct from response data
                const invoiceUrl = oblioResponse.data?.link || `https://www.oblio.eu/docs/invoice?cif=${process.env.OBLIO_COMPANY_CIF}&seriesName=${oblioResponse.data?.seriesName || process.env.OBLIO_INVOICE_SERIES}&number=${oblioResponse.data?.number}`;
                
                await this.shopifyService.setInvoiceMetafields(
                    order.id,
                    oblioResponse.data?.number || 'unknown',
                    invoiceUrl,
                    oblioResponse.data?.seriesName || process.env.OBLIO_INVOICE_SERIES
                );
                
                console.log('📝 Invoice metafields set successfully:', {
                    orderId: order.id,
                    invoiceNumber: oblioResponse.data?.number,
                    invoiceUrl
                });
                
            } catch (shopifyError) {
                // Don't fail the whole process if Shopify updates fail
                console.warn('⚠️ Failed to update Shopify order (invoice still created):', {
                    orderId: order.id,
                    error: shopifyError.message
                });
            }
            
        } catch (error) {
            const orderId = req.body?.id || 'unknown';
            
            // Log final failure (after all retries in service layer)
            console.error('❌ Invoice creation failed permanently:', {
                orderId,
                error: error.message
            });
            
            // Tag the order and set error metafield
            try {
                // Tag the order with error status
                await this.shopifyService.tagOrder(orderId, [
                    'EROARE FACTURARE',
                    `error-${new Date().toISOString().split('T')[0]}` // error-2025-01-07
                ]);
                
                console.log('🏷️ Order tagged with error status:', {
                    orderId,
                    tags: ['EROARE FACTURARE', `error-${new Date().toISOString().split('T')[0]}`]
                });
                
                // Set error metafield
                const httpStatus = error.response?.status;
                const statusMessage = error.response?.data?.statusMessage || error.response?.data?.message;
                const composedMsg = `Facturare esuata: ${error.message}${httpStatus ? ` (HTTP ${httpStatus})` : ''}${statusMessage ? ` | ${statusMessage}` : ''}. Timestamp: ${new Date().toISOString()}`;

                await this.shopifyService.setErrorMetafield(orderId, composedMsg);
                
                console.log('📝 Error metafield set successfully:', {
                    orderId,
                    errorMessage: composedMsg
                });
                
            } catch (shopifyError) {
                console.warn('⚠️ Failed to update Shopify order with error status:', {
                    orderId,
                    shopifyError: shopifyError.message,
                    originalError: error.message
                });
            }
        }
    }

    /**
     * Transform Shopify order to Oblio invoice format
     * @private
     */
    transformShopifyOrderToOblioInvoice(order) {
        const companyCif = process.env.OBLIO_COMPANY_CIF;
        
        // Base products from line items - only include items that can be fulfilled
        // Use fulfillable_quantity to handle edited orders where items were removed
        let products = order.line_items
            .map(item => {
                // Base on original ordered quantity
                const baseQty = item.quantity || 0;

                // Subtract refunded quantities (if any)
                const refundedQty = (order.refunds || []).reduce((acc, refund) => {
                    const match = (refund.refund_line_items || []).find(rli => rli?.line_item?.id === item.id);
                    return acc + (match?.quantity || 0);
                }, 0);

                const finalQty = Math.max(0, baseQty - refundedQty);
                if (finalQty <= 0) {
                    console.log('🚫 Skipping item with non-positive invoice quantity (after refunds):', {
                        id: item.id,
                        title: item.title,
                        orderedQuantity: baseQty,
                        refundedQuantity: refundedQty,
                        resultingQuantity: finalQty
                    });
                    return null;
                }

                return {
                    name: item.title,
                    code: item.sku || item.barcode || String(item.id),
                    price: parseFloat(item.price),
                    quantity: finalQty, // Use original quantity minus any refunds
                    measuringUnit: 'buc',
                    currency: order.currency,
                    management: config.oblio.OBLIO_MANAGEMENT
                };
            })
            .filter(Boolean);

        // Add shipping if exists
        if (order.shipping_lines?.length > 0) {
            const shippingPrice = parseFloat(order.shipping_lines[0].price);
            if (!isNaN(shippingPrice) && shippingPrice > 0) {
                products.push({
                    name: 'Transport',
                    price: shippingPrice,
                    quantity: 1,
                    measuringUnit: 'buc',
                    currency: order.currency,
                    vatName: process.env.OBLIO_DEFAULT_VAT_NAME || 'Normala',
                    management: config.oblio.OBLIO_MANAGEMENT
                });
            } else {
                console.log('🚫 Skipping shipping line (free or invalid price):', {
                    title: order.shipping_lines[0]?.title,
                    price: order.shipping_lines[0]?.price
                });
            }
        }

        // Note on discounts:
        // Oblio items should not be standalone discount-only lines without price/quantity.
        // Applying order-level discounts requires a different payload not implemented here.
        // To avoid 400 responses, we skip adding discount-only pseudo-lines and rely on product prices already reflecting discounts.
        if (order.discount_applications?.length > 0) {
            console.log('ℹ️ Detected discount applications on order. Skipping standalone discount lines to avoid invalid Oblio payload.', {
                count: order.discount_applications.length
            });
        }

        // Final sanitation: remove invalid/zero items (Oblio may reject them)
        products = products.filter(p => {
            const valid = p && typeof p.price === 'number' && !isNaN(p.price) && p.price > 0 && p.quantity > 0;
            if (!valid) {
                console.log('🚫 Skipping non-invoiceable product line:', p);
            }
            return valid;
        });

        // Build address fields per Oblio expected format
        const billingAddr = order.billing_address ? formatRomanianAddress(order.billing_address) : null;
        const shippingAddr = !billingAddr && order.shipping_address ? formatRomanianAddress(order.shipping_address) : null;
        const addr = billingAddr || shippingAddr || { street: '', city: '', state: '', zip: '', country: 'România' };
        const singleLineAddress = [addr.street, addr.zip, addr.country].filter(Boolean).join(', ');

        return {
            cif: companyCif,
            client: {
                // Prefer company name (cleaned) if present; fallback to full name/email
                name: (order.billing_address?.company && (getCompanyNameFromOrder(order) || order.billing_address.company))
                    || `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim()
                    || order.customer?.email,
                // Buyer identification fields expected by Oblio
                cif: undefined, // will be set by ANAF enrichment if CUI present
                rc: undefined,  // will be set by ANAF enrichment if available
                code: String(order.customer?.id || order.customer?.email || order.id),
                address: singleLineAddress,
                state: addr.state,
                city: addr.city,
                country: addr.country,
                iban: '',
                bank: '',
                email: order.customer?.email || '',
                phone: order.billing_address?.phone || order.shipping_address?.phone || '',
                contact: `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim(),
                vatPayer: undefined // may be set by ANAF enrichment
            },
            seriesName: process.env.OBLIO_INVOICE_SERIES || 'FCT',
            issueDate: new Date().toISOString().split('T')[0],
            language: 'RO',
            products
        };
    }
}

export default new InvoiceController();
