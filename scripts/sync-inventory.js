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

// Show usage if help requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Inventory Sync Script

Usage:
  node scripts/sync-inventory.js [options]

Options:
  --dry-run, -d          Preview changes without updating Shopify
  --sku=SKU1,SKU2       Only sync specific SKUs (comma-separated)
  --help, -h            Show this help message

Examples:
  node scripts/sync-inventory.js --dry-run
  node scripts/sync-inventory.js --sku=BT-CUTIE-CAPSUNI,BT-ALUNE-CARAMEL
  node scripts/sync-inventory.js
    `);
    process.exit(0);
}

runInventorySync();
