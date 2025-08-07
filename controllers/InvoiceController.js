import OblioService from '../services/OblioService.js';
import ShopifyService from '../services/ShopifyService.js';
import AnafService from '../services/AnafService.js';
import { transformOrderWithAnafEnrichment, formatRomanianAddress } from '../utils/index.js';
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
            
            // Transform and create invoice with ANAF company verification (retry logic is in OblioService)
            const invoiceData = await transformOrderWithAnafEnrichment(
                order,
                this.transformShopifyOrderToOblioInvoice.bind(this),
                this.anafService
            );
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
                    invoiceUrl
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
                await this.shopifyService.setErrorMetafield(
                    orderId,
                    `Facturare esuata: ${error.message}. Timestamp: ${new Date().toISOString()}`
                );
                
                console.log('📝 Error metafield set successfully:', {
                    orderId,
                    errorMessage: error.message
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
        const products = order.line_items
            .filter(item => {
                const fulfillableQty = item.fulfillable_quantity || 0;
                if (fulfillableQty <= 0) {
                    console.log('🚫 Skipping removed/unfulfillable item:', {
                        id: item.id,
                        title: item.title,
                        originalQuantity: item.quantity,
                        fulfillableQuantity: fulfillableQty
                    });
                    return false;
                }
                return true;
            })
            .map(item => {
                const fulfillableQty = item.fulfillable_quantity || item.quantity;
                
                return {
                    name: item.title,
                    code: item.sku || item.barcode,
                    price: parseFloat(item.price),
                    quantity: fulfillableQty, // Use fulfillable quantity, not original quantity
                    measuringUnit: 'buc',
                    currency: order.currency,
                };
            });

        // Add shipping if exists
        if (order.shipping_lines?.length > 0) {
            products.push({
                name: 'Transport',
                price: parseFloat(order.shipping_lines[0].price),
                quantity: 1,
                measuringUnit: 'buc',
                currency: order.currency,
            });
        }

        // Add discounts if they exist
        if (order.discount_applications?.length > 0) {
            order.discount_applications.forEach(discount => {
                let discountName = discount.title || 'Discount';
                let discountValue = parseFloat(discount.value);
                let discountType = 'valoric'; // Default to fixed amount
                
                // Determine discount type based on Shopify discount type
                if (discount.type === 'percentage') {
                    discountType = 'procentual';
                    // For percentage discounts, use the percentage value
                    discountValue = parseFloat(discount.value);
                } else if (discount.type === 'fixed_amount') {
                    discountType = 'valoric';
                    // For fixed amount, use the actual discount amount
                    discountValue = parseFloat(discount.value);
                }
                
                products.push({
                    name: discountName,
                    discount: discountValue,
                    discountType: discountType
                });
            });
        }

        return {
            cif: companyCif,
            client: {
                name: `${order.billing_address?.first_name || ''} ${order.billing_address?.last_name || ''}`.trim() || order.customer?.email,
                address: order.billing_address ? formatRomanianAddress(order.billing_address) : null,
                email: order.customer?.email,
                phone: order.billing_address?.phone
            },
            seriesName: process.env.OBLIO_INVOICE_SERIES || 'FCT',
            issueDate: new Date().toISOString().split('T')[0],
            language: 'RO',
            products
        };
    }
}

export default new InvoiceController();
