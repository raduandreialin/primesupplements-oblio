/**
 * Base adapter interface for shipping providers
 * This class defines the contract that all shipping adapters must implement
 */
class BaseAdapter {
    /**
     * Convert order data to shipping provider's AWB format
     * @param {Object} order - Shopify order object
     * @param {Object} packageInfo - Package information
     * @param {string} service - Service type
     * @param {Object} customShippingAddress - Custom shipping address
     * @param {string} codAmount - Cash on Delivery amount
     * @param {string} insuranceValue - Insurance value
     * @param {boolean} openPackage - Allow recipient to open package before payment
     * @param {boolean} saturdayDelivery - Saturday delivery option
     * @param {boolean} morningDelivery - Morning delivery option
     * @param {string} shipmentPayer - Who pays for shipping
     * @param {string} observations - Custom notes
     * @param {number} envelopes - Number of envelopes
     * @returns {Promise<Object>} AWB data for the shipping provider
     */
    async convertOrderToAwbData(order, packageInfo, service, customShippingAddress, codAmount, insuranceValue, openPackage, saturdayDelivery, morningDelivery, shipmentPayer, observations, envelopes) {
        throw new Error('convertOrderToAwbData method must be implemented by shipping adapter');
    }

    /**
     * Create AWB with shipping provider
     * @param {Object} awbData - AWB data for the provider
     * @returns {Promise<Object>} AWB response from provider
     */
    async createAwb(awbData) {
        throw new Error('createAwb method must be implemented by shipping adapter');
    }

    /**
     * Get tracking URL for AWB
     * @param {string} trackingNumber - Tracking number/barcode
     * @returns {string} Tracking URL
     */
    getTrackingUrl(trackingNumber) {
        throw new Error('getTrackingUrl method must be implemented by shipping adapter');
    }

    /**
     * Get carrier name
     * @returns {string} Carrier name
     */
    getCarrierName() {
        throw new Error('getCarrierName method must be implemented by shipping adapter');
    }
}

export default BaseAdapter;
