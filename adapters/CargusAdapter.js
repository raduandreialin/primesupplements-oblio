import BaseAdapter from './BaseAdapter.js';
import CargusService from '../services/CargusService.js';
import config from '../config/AppConfig.js';
import { logger } from '../utils/index.js';

/**
 * Cargus-specific adapter for shipping operations
 * This adapter implements the BaseAdapter interface for Cargus courier service
 */
class CargusAdapter extends BaseAdapter {
    constructor() {
        super();
        this.cargusService = new CargusService(
            config.cargus.subscriptionKey,
            config.cargus.username,
            config.cargus.password
        );
    }

    /**
     * Convert Shopify order to Cargus AWB data with custom package information
     * @param {Object} order - Shopify order object
     * @param {Object} packageInfo - Custom package information from extension
     * @param {string} service - Selected service type
     * @param {Object} customShippingAddress - Custom shipping address from extension
     * @param {string} codAmount - Cash on Delivery amount from extension
     * @param {string} insuranceValue - Insurance value from extension
     * @param {boolean} openPackage - Allow recipient to open package before payment
     * @param {boolean} saturdayDelivery - Saturday delivery option
     * @param {boolean} morningDelivery - Morning delivery option
     * @param {string} shipmentPayer - Who pays for shipping (1: sender, 2: recipient)
     * @param {string} observations - Custom notes/observations
     * @param {number} envelopes - Number of envelopes
     * @returns {Object} Cargus AWB data
     */
    async convertOrderToAwbData(order, packageInfo, service, customShippingAddress, codAmount, insuranceValue, openPackage, saturdayDelivery, morningDelivery, shipmentPayer, observations, envelopes) {
        // Use custom shipping address if provided, otherwise fall back to order address
        let address;
        if (customShippingAddress && customShippingAddress.firstName) {
            address = customShippingAddress;
        } else {
            const shippingAddress = order.shipping_address;
            const billingAddress = order.billing_address;
            address = shippingAddress || billingAddress;
        }

        if (!address) {
            throw new Error('No shipping address found');
        }

        // Use custom package weight from payload
        const totalWeight = packageInfo?.weight || 1.0; // Default to 1kg if not provided

        // Map service type to Cargus service ID
        const serviceId = this.mapServiceToCargusId(service, totalWeight);

        return {
            pickupStartDate: this.getDefaultPickupStart(),
            pickupEndDate: this.getDefaultPickupEnd(),
            sender: {
                Name: config.cargus.sender.name,
                CountyName: config.cargus.sender.countyName,
                LocalityName: config.cargus.sender.localityName,
                AddressText: config.cargus.sender.addressText,
                ContactPerson: config.cargus.sender.contactPerson,
                PhoneNumber: config.cargus.sender.phoneNumber,
                CodPostal: config.cargus.sender.postalCode,
                Email: config.cargus.sender.email
            },
            recipient: {
                Name: `${address.firstName || address.first_name} ${address.lastName || address.last_name}`,
                CountyName: this.mapProvinceToCounty(address.province),
                LocalityName: await this.validateAndMapLocality(address.city, this.mapProvinceToCounty(address.province)),
                AddressText: `${address.address1} ${address.address2 || ''}`.trim(),
                ContactPerson: `${address.firstName || address.first_name} ${address.lastName || address.last_name}`,
                PhoneNumber: address.phone || order.phone || "0700000000",
                CodPostal: address.zip,
                Email: address.email || order.email
            },
            parcels: 1, // Always use 1 parcel for this service
            envelopes: 0, // Set to 0 since service doesn't allow multiple parts
            totalWeight: Math.max(totalWeight, 0.1), // Minimum 0.1kg
            serviceId: serviceId,
            declaredValue: insuranceValue ? parseFloat(insuranceValue) : parseFloat(order.total_price),
            cashRepayment: codAmount ? parseFloat(codAmount) : 0,
            openPackage: openPackage || false,
            saturdayDelivery: saturdayDelivery || false,
            morningDelivery: morningDelivery || false,
            shipmentPayer: parseInt(shipmentPayer) || 1,
            observations: observations || `Shopify Order #${order.order_number} - Created via Extension`,
            packageContent: `Order #${order.order_number} - Package`,
            parcelCodes: [{
                Code: "0",
                Type: 1,
                Weight: Math.max(totalWeight, 0.1),
                Length: packageInfo?.length || 20,
                Width: packageInfo?.width || 15,
                Height: packageInfo?.height || 10,
                ParcelContent: `Order #${order.order_number} - Package${(envelopes && envelopes > 0) ? ` + ${envelopes} envelope(s)` : ''}`
            }]
        };
    }

    /**
     * Create AWB with Cargus service
     * @param {Object} awbData - AWB data for Cargus
     * @returns {Object} AWB response from Cargus
     */
    async createAwb(awbData) {
        logger.info({ awbDataForCargus: awbData }, 'Creating AWB with Cargus - Request Data');
        
        try {
            const awb = await this.cargusService.createAwbWithPickup(awbData);

            // Detailed response analysis
            logger.info({
                rawResponse: awb,
                isNull: awb === null,
                isUndefined: awb === undefined,
                isEmpty: Object.keys(awb || {}).length === 0,
                responseType: typeof awb,
                responseKeys: Object.keys(awb || {}),
                responseJSON: JSON.stringify(awb),
                barCodeValue: awb?.BarCode,
                barCodeType: typeof awb?.BarCode,
                hasBarCode: 'BarCode' in (awb || {}),
                allFields: awb ? Object.entries(awb).map(([key, value]) => `${key}: ${value} (${typeof value})`) : []
            }, 'AWB Creation - Complete Response Analysis');

            return awb;
        } catch (cargusError) {
            logger.error({ 
                error: cargusError.message, 
                stack: cargusError.stack,
                statusCode: cargusError.response?.status,
                responseData: cargusError.response?.data,
                awbDataSummary: {
                    parcels: awbData.parcels,
                    envelopes: awbData.envelopes,
                    totalWeight: awbData.totalWeight,
                    parcelCodesCount: awbData.parcelCodes?.length,
                    serviceId: awbData.serviceId,
                    recipient: {
                        name: awbData.recipient?.Name,
                        county: awbData.recipient?.CountyName,
                        city: awbData.recipient?.LocalityName
                    }
                }
            }, 'Failed to create AWB with Cargus - detailed error info');
            throw cargusError;
        }
    }

    /**
     * Get tracking URL for Cargus AWB
     * @param {string} barcode - AWB barcode
     * @returns {string} Tracking URL
     */
    getTrackingUrl(barcode) {
        return `https://urgentcargus.ro/tracking-colet/${barcode}`;
    }

    /**
     * Get carrier name
     * @returns {string} Carrier name
     */
    getCarrierName() {
        return 'Cargus';
    }

    /**
     * Map service type to Cargus service ID
     * @param {string} service - Service type from extension
     * @param {number} weight - Package weight
     * @returns {number} Cargus service ID
     */
    mapServiceToCargusId(service, weight) {
        // For now, use the existing weight-based logic from CargusService
        // You can expand this to handle different service types
        switch (service) {
            case 'express':
                return 1; // Express service
            case 'overnight':
                return 2; // Overnight if available
            case '2day':
                return 3; // 2-day service if available
            case 'ground':
            default:
                return CargusService.getServiceIdByWeight(weight);
        }
    }

    /**
     * Map Shopify province to Romanian county
     * @param {string} province - Shopify province
     * @returns {string} Romanian county name
     */
    mapProvinceToCounty(province) {
        const mapping = {
            'Bucuresti': 'Bucuresti',
            'Alba': 'Alba',
            'Arad': 'Arad',
            'Arges': 'Arges',
            'Bacau': 'Bacau',
            'Bihor': 'Bihor',
            'Bistrita-Nasaud': 'Bistrita-Nasaud',
            'Botosani': 'Botosani',
            'Braila': 'Braila',
            'Brasov': 'Brasov',
            'Buzau': 'Buzau',
            'Calarasi': 'Calarasi',
            'Caras-Severin': 'Caras-Severin',
            'Cluj': 'Cluj',
            'Constanta': 'Constanta',
            'Covasna': 'Covasna',
            'Dambovita': 'Dambovita',
            'Dolj': 'Dolj',
            'Galati': 'Galati',
            'Giurgiu': 'Giurgiu',
            'Gorj': 'Gorj',
            'Harghita': 'Harghita',
            'Hunedoara': 'Hunedoara',
            'Ialomita': 'Ialomita',
            'Iasi': 'Iasi',
            'Ilfov': 'Ilfov',
            'Maramures': 'Maramures',
            'Mehedinti': 'Mehedinti',
            'Mures': 'Mures',
            'Neamt': 'Neamt',
            'Olt': 'Olt',
            'Prahova': 'Prahova',
            'Salaj': 'Salaj',
            'Satu-Mare': 'Satu-Mare',
            'Sibiu': 'Sibiu',
            'Suceava': 'Suceava',
            'Teleorman': 'Teleorman',
            'Timis': 'Timis',
            'Tulcea': 'Tulcea',
            'Valcea': 'Valcea',
            'Vaslui': 'Vaslui',
            'Vrancea': 'Vrancea'
        };

        return mapping[province] || province || 'Bucuresti';
    }

    /**
     * Get default pickup start time (next business day 9 AM)
     * @returns {string} ISO datetime string
     */
    getDefaultPickupStart() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
    }

    /**
     * Get default pickup end time (next business day 5 PM)
     * @returns {string} ISO datetime string
     */
    getDefaultPickupEnd() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(17, 0, 0, 0);
        return tomorrow.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
    }

    /**
     * Validate and map locality name against Cargus database
     * @param {string} cityName - City name from address
     * @param {string} countyName - County name
     * @returns {Promise<string>} Validated locality name
     */
    async validateAndMapLocality(cityName, countyName) {
        if (!cityName) {
            throw new Error('City name is required');
        }

        try {
            // First, try to get the county ID for the county name
            const countries = await this.cargusService.getCountries();
            const romania = countries.find(c => c.Abbreviation === 'RO' || c.CountryName === 'Romania');

            if (!romania) {
                logger.warn('Romania not found in countries list, using default locality');
                return cityName; // Fallback to original city name
            }

            const counties = await this.cargusService.getCounties(romania.CountryId);
            const county = counties.find(c =>
                c.Name === countyName ||
                c.Abbreviation === countyName ||
                c.Name.toLowerCase() === countyName.toLowerCase()
            );

            if (!county) {
                logger.warn({ cityName, countyName }, 'County not found, using original city name');
                return cityName;
            }

            // Get localities for this county
            const localities = await this.cargusService.getLocalities(romania.CountryId, county.CountyId);

            // Try exact match first
            let locality = localities.find(l => l.Name.toLowerCase() === cityName.toLowerCase());

            // If no exact match, try partial match
            if (!locality) {
                locality = localities.find(l =>
                    l.Name.toLowerCase().includes(cityName.toLowerCase()) ||
                    cityName.toLowerCase().includes(l.Name.toLowerCase())
                );
            }

            if (locality) {
                logger.info({ originalCity: cityName, mappedCity: locality.Name }, 'Successfully mapped locality');
                return locality.Name;
            } else {
                logger.warn({ cityName, countyName, availableLocalities: localities.slice(0, 5).map(l => l.Name) }, 'Locality not found in Cargus database, using original name');
                return cityName;
            }

        } catch (error) {
            logger.error({ error: error.message, cityName, countyName }, 'Failed to validate locality, using original name');
            return cityName; // Fallback to original city name
        }
    }
}

export default CargusAdapter;
