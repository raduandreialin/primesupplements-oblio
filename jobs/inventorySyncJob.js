import cron from 'node-cron';
import InventorySyncService from '../services/InventorySyncService.js';
import { logger } from '../utils/index.js';

class InventorySyncJob {
    constructor() {
        this.syncService = new InventorySyncService();
    }

    /**
     * Start the hourly inventory sync cron job
     */
    start() {
        // Run every hour at minute 0
        const cronPattern = '0 * * * *';

        logger.info('🕐 Starting inventory sync cron job (hourly)');

        cron.schedule(cronPattern, async () => {
            try {
                logger.info('🔄 Starting scheduled inventory sync');

                const results = await this.syncService.syncInventory({
                    dryRun: false
                });

                logger.info({
                    checked: results.checked,
                    updated: results.updated,
                    errors: results.errors
                }, '✅ Scheduled inventory sync completed');

                // Log errors if any
                if (results.errors > 0) {
                    results.details.filter(d => d.error).forEach(detail => {
                        logger.error(`Sync error for ${detail.sku}: ${detail.error}`);
                    });
                }

            } catch (error) {
                logger.error({ error: error.message }, '❌ Scheduled inventory sync failed');
            }
        });

        logger.info('✅ Inventory sync cron job scheduled');
    }
}

export default InventorySyncJob;