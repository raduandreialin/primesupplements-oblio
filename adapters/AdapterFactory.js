import CargusAdapter from './CargusAdapter.js';

/**
 * Factory class for creating shipping adapters
 * This makes it easy to add support for new couriers in the future
 */
class AdapterFactory {
    /**
     * Available shipping adapters
     */
    static ADAPTERS = {
        CARGUS: 'cargus',
        // Future adapters can be added here:
        // FAN_COURIER: 'fan_courier',
        // DPD: 'dpd',
        // GLS: 'gls'
    };

    /**
     * Create a shipping adapter instance
     * @param {string} adapterType - Type of adapter to create
     * @returns {BaseAdapter} Adapter instance
     */
    static createAdapter(adapterType) {
        switch (adapterType.toLowerCase()) {
            case this.ADAPTERS.CARGUS:
                return new CargusAdapter();
            
            // Future adapters:
            // case this.ADAPTERS.FAN_COURIER:
            //     return new FanCourierAdapter();
            // case this.ADAPTERS.DPD:
            //     return new DpdAdapter();
            // case this.ADAPTERS.GLS:
            //     return new GlsAdapter();
            
            default:
                throw new Error(`Unsupported adapter type: ${adapterType}. Available adapters: ${Object.values(this.ADAPTERS).join(', ')}`);
        }
    }

    /**
     * Get list of available adapters
     * @returns {string[]} Array of available adapter types
     */
    static getAvailableAdapters() {
        return Object.values(this.ADAPTERS);
    }

    /**
     * Check if adapter type is supported
     * @param {string} adapterType - Adapter type to check
     * @returns {boolean} True if supported
     */
    static isSupported(adapterType) {
        return Object.values(this.ADAPTERS).includes(adapterType.toLowerCase());
    }
}

export default AdapterFactory;
