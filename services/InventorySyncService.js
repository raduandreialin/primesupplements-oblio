import ShopifyService from './ShopifyService.js';
import OblioService from './OblioService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';
import { INVENTORY_SET_QUANTITIES } from '../graphql/mutations.js';

export default class InventorySyncService {
    constructor() {
        this.shopifyService = new ShopifyService(
            config.shopify.B2C_SHOPIFY_SHOPNAME,
            config.shopify.B2C_SHOPIFY_ACCESS_TOKEN
        );
        this.oblioService = new OblioService();
        this.companyCif = config.oblio.OBLIO_COMPANY_CIF;
    }

    /**
     * Synchronize inventory between Oblio and Shopify
     * @param {Object} options - Sync options
     * @param {boolean} options.dryRun - If true, only log changes without updating Shopify
     * @param {Array} options.skuFilter - Only sync specific SKUs
     * @returns {Promise<Object>} Sync results
     */
    async syncInventory(options = {}) {
        const { dryRun = false, skuFilter = null } = options;
        
        logger.info(`🔄 Starting sync ${dryRun ? '(DRY RUN)' : '(LIVE)'} ${skuFilter ? `- SKUs: ${skuFilter.join(',')}` : ''}`);

        const syncResults = {
            totalProcessed: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            details: []
        };

        try {
            // Step 1: Get Shopify products
            const shopifyProducts = await this.shopifyService.getAllProducts();
            
            // Step 2: Get Oblio products (filtered by management) - handle pagination
            const oblioProducts = await this.getAllOblioProducts();
            
            if (!oblioProducts.data || oblioProducts.data.length === 0) {
                throw new Error('No products found in Oblio');
            }

            // Step 3: Create SKU mapping from Oblio
            const oblioStockMap = this.createOblioStockMap(oblioProducts.data);
            
            logger.info(`📊 Data: ${shopifyProducts.length} Shopify products, ${Object.keys(oblioStockMap).length} Oblio SKUs from "${config.oblio.OBLIO_MANAGEMENT}"`);

            // Step 4: Process each Shopify product
            for (const product of shopifyProducts) {
                if (!product.variants?.edges) continue;

                for (const variantEdge of product.variants.edges) {
                    const variant = variantEdge.node;
                    if (!variant.sku) continue;

                    // Filter by SKUs if specified
                    if (skuFilter && !skuFilter.includes(variant.sku)) {
                        continue;
                    }

                    syncResults.totalProcessed++;

                    try {
                        const syncResult = await this.syncVariantInventory(
                            product,
                            variant,
                            oblioStockMap,
                            dryRun
                        );

                        if (syncResult.updated) {
                            syncResults.updated++;
                            // Only log actual changes
                            if (syncResult.currentQuantity !== syncResult.oblioQuantity) {
                                const action = dryRun ? '🔍' : '✅';
                                const change = syncResult.oblioQuantity - syncResult.currentQuantity;
                                logger.info(`${action} ${syncResult.sku}: ${syncResult.currentQuantity} → ${syncResult.oblioQuantity} (${change > 0 ? '+' : ''}${change})`);
                            }
                        } else {
                            syncResults.skipped++;
                        }

                        syncResults.details.push(syncResult);

                    } catch (error) {
                        syncResults.errors++;
                        syncResults.details.push({
                            sku: variant.sku,
                            productTitle: product.title,
                            variantTitle: variant.title,
                            error: error.message,
                            updated: false
                        });
                        logger.error(`❌ ${variant.sku}: ${error.message}`);
                    }

                    // Small delay to respect rate limits
                    await this.sleep(100);
                }
            }

            // Compact summary
            logger.info(`🎉 Sync complete: ${syncResults.updated} updated, ${syncResults.skipped} skipped, ${syncResults.errors} errors`);
            return syncResults;

        } catch (error) {
            logger.error(`❌ Sync failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Sync inventory for a single variant
     */
    async syncVariantInventory(product, variant, oblioStockMap, dryRun) {
        const sku = variant.sku;
        const oblioStock = oblioStockMap[sku];

        const result = {
            sku,
            productTitle: product.title,
            variantTitle: variant.title,
            currentQuantity: variant.inventoryQuantity,
            oblioQuantity: oblioStock?.totalStock || 0,
            updated: false,
            reason: ''
        };

        if (!oblioStock) {
            result.reason = 'SKU not found in Oblio';
            return result;
        }

        const quantityDifference = oblioStock.totalStock - variant.inventoryQuantity;

        if (quantityDifference === 0) {
            result.reason = 'Quantities already match';
            return result;
        }

        if (dryRun) {
            result.reason = `Would update: ${variant.inventoryQuantity} → ${oblioStock.totalStock} (${quantityDifference > 0 ? '+' : ''}${quantityDifference})`;
            result.updated = true;
            return result;
        }

        // Update Shopify inventory
        await this.updateShopifyInventory(variant, oblioStock.totalStock);
        
        result.updated = true;
        result.reason = `Updated: ${variant.inventoryQuantity} → ${oblioStock.totalStock} (${quantityDifference > 0 ? '+' : ''}${quantityDifference})`;

        return result;
    }

    /**
     * Update Shopify inventory for a variant
     */
    async updateShopifyInventory(variant, newQuantity) {
        if (!variant.inventoryItem?.id) {
            throw new Error('Variant has no inventory item ID');
        }

        if (!variant.inventoryItem.inventoryLevels?.edges?.[0]?.node?.location?.id) {
            throw new Error('No inventory location found for variant');
        }

        const locationId = variant.inventoryItem.inventoryLevels.edges[0].node.location.id;
        const inventoryItemId = variant.inventoryItem.id;

        const input = {
            reason: 'correction',
            name: 'on_hand',
            quantities: [{
                inventoryItemId,
                locationId,
                quantity: newQuantity,
                compareQuantity: variant.inventoryQuantity
            }]
        };

        const response = await this.shopifyService.graphQLQuery(INVENTORY_SET_QUANTITIES, { input });

        if (response.inventorySetQuantities?.userErrors?.length > 0) {
            const errors = response.inventorySetQuantities.userErrors.map(e => e.message).join(', ');
            throw new Error(`Shopify inventory update failed: ${errors}`);
        }

        return response;
    }

    /**
     * Create a map of SKU -> stock data from Oblio products
     * Products are already filtered by management via API parameter
     */
    createOblioStockMap(oblioProducts) {
        const stockMap = {};

        oblioProducts.forEach(product => {
            if (!product.code || !product.code.trim()) return; // Skip products without SKU

            const sku = product.code;
            let quantity = 0;

            // When using management parameter, products still have stock array
            // but only contain the stock entry for the specified management
            if (product.stock && Array.isArray(product.stock) && product.stock.length > 0) {
                quantity = product.stock[0].quantity || 0;
            }

            stockMap[sku] = {
                productName: product.name,
                totalStock: quantity,
                management: config.oblio.OBLIO_MANAGEMENT,
                oblioProduct: product
            };
        });

        logger.debug(`Loaded products from management: "${config.oblio.OBLIO_MANAGEMENT}"`);
        return stockMap;
    }

    /**
     * Get all Oblio products with pagination support
     */
    async getAllOblioProducts() {
        const allProducts = [];
        let offset = 0;
        const limit = 250;
        let hasMoreProducts = true;

        while (hasMoreProducts) {
            const response = await this.oblioService.getProducts(this.companyCif, {
                management: config.oblio.OBLIO_MANAGEMENT,
                offset,
                limit
            });

            if (response.data && response.data.length > 0) {
                allProducts.push(...response.data);
                offset += limit;
                
                // If we got less than the limit, we've reached the end
                if (response.data.length < limit) {
                    hasMoreProducts = false;
                }
            } else {
                hasMoreProducts = false;
            }
        }

        logger.debug(`Fetched ${allProducts.length} total products from Oblio with pagination`);
        
        return {
            data: allProducts
        };
    }

    /**
     * Get sync preview without making changes
     */
    async getSyncPreview(skuFilter = null) {
        logger.info({ skuFilter }, 'Generating sync preview');
        return await this.syncInventory({ dryRun: true, skuFilter });
    }

    /**
     * Sleep utility for rate limiting
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
