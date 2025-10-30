import InventorySyncService from '../services/InventorySyncService.js';
import { logger } from '../utils/index.js';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

async function runInventorySync() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    const skuFilter = args.find(arg => arg.startsWith('--sku='))?.split('=')[1]?.split(',');

    try {
        const syncService = new InventorySyncService();
        const results = await syncService.syncInventory({ dryRun, skuFilter });

        // Show errors if any
        if (results.errors > 0) {
            logger.warn(`⚠️  ${results.errors} errors occurred:`);
            results.details.filter(d => d.error).forEach(detail => {
                logger.error(`   ${detail.sku}: ${detail.error}`);
            });
        }

        // Show next steps
        if (dryRun && results.updated > 0) {
            logger.info('💡 To perform actual sync, run: npm run sync:inventory');
        }

    } catch (error) {
        logger.error({ error: error.message }, '❌ Inventory sync failed');
        process.exit(1);
    }
}


runInventorySync();
