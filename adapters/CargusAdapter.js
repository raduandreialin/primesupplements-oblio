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

        // Map the county name once to ensure consistency
        const mappedCounty = this.mapProvinceToCounty(address.province);

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
                CountyName: mappedCounty,
                LocalityName: await this.validateAndMapLocality(address.city, mappedCounty),
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
        if (!province) return 'Bucuresti';

        // Normalize the province name first (remove diacritics, etc.)
        const normalizedProvince = this.normalizeLocalityName(province);
        
        const mapping = {
            // Standard mappings
            'bucuresti': 'Bucuresti',
            'alba': 'Alba',
            'arad': 'Arad',
            'arges': 'Arges',
            'bacau': 'Bacau',
            'bihor': 'Bihor',
            'bistrita-nasaud': 'Bistrita-Nasaud',
            'botosani': 'Botosani',
            'braila': 'Braila',
            'brasov': 'Brasov',
            'buzau': 'Buzau',
            'calarasi': 'Calarasi',
            'caras-severin': 'Caras-Severin',
            'cluj': 'Cluj',
            'constanta': 'Constanta',
            'covasna': 'Covasna',
            'dambovita': 'Dambovita',
            'dolj': 'Dolj',
            'galati': 'Galati',
            'giurgiu': 'Giurgiu',
            'gorj': 'Gorj',
            'harghita': 'Harghita',
            'hunedoara': 'Hunedoara',
            'ialomita': 'Ialomita',
            'iasi': 'Iasi',
            'ilfov': 'Ilfov',
            'maramures': 'Maramures',
            'mehedinti': 'Mehedinti',
            'mures': 'Mures',
            'neamt': 'Neamt',
            'olt': 'Olt',
            'prahova': 'Prahova',
            'salaj': 'Salaj',
            'satu-mare': 'Satu Mare',
            'sibiu': 'Sibiu',
            'suceava': 'Suceava',
            'teleorman': 'Teleorman',
            'timis': 'Timis',
            'tulcea': 'Tulcea',
            'valcea': 'Valcea',
            'vaslui': 'Vaslui',
            'vrancea': 'Vrancea',
            
            // Common variations with diacritics
            'brasov': 'Brasov', // Brașov -> Brasov
            'timisoara': 'Timis', // Timișoara -> Timis
            'cluj-napoca': 'Cluj', // Cluj-Napoca -> Cluj
            'targu-mures': 'Mures', // Târgu-Mureș -> Mures
            'satu mare': 'Satu Mare', // Handle both hyphen and space
            
            // English variations
            'bucharest': 'Bucuresti',
            'transylvania': 'Cluj', // Common mistake
        };

        // Try normalized mapping first
        const mapped = mapping[normalizedProvince];
        if (mapped) {
            logger.info({ originalProvince: province, normalizedProvince, mappedCounty: mapped }, 'County mapped successfully');
            return mapped;
        }

        // If no mapping found, try exact match with available counties
        const availableCounties = [
            'Alba', 'Arad', 'Arges', 'Bacau', 'Bihor', 'Bistrita-Nasaud', 
            'Botosani', 'Braila', 'Brasov', 'Buzau', 'Calarasi', 'Caras-Severin', 
            'Cluj', 'Constanta', 'Covasna', 'Dambovita', 'Dolj', 'Galati', 
            'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara', 'Ialomita', 'Iasi', 
            'Ilfov', 'Maramures', 'Mehedinti', 'Mures', 'Neamt', 'Olt', 
            'Prahova', 'Salaj', 'Satu Mare', 'Sibiu', 'Suceava', 'Teleorman', 
            'Timis', 'Tulcea', 'Valcea', 'Vaslui', 'Vrancea', 'Bucuresti'
        ];

        // Try to find exact match in available counties
        const exactMatch = availableCounties.find(county => 
            this.normalizeLocalityName(county) === normalizedProvince
        );

        if (exactMatch) {
            logger.info({ originalProvince: province, foundCounty: exactMatch }, 'County found by exact match');
            return exactMatch;
        }

        logger.warn({ 
            originalProvince: province, 
            normalizedProvince, 
            availableCounties: availableCounties.slice(0, 10) 
        }, 'County not found, using Bucuresti as fallback');
        
        return 'Bucuresti'; // Safe fallback
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

        logger.info({ cityName, countyName }, 'Starting locality validation');

        try {
            // First, try to get the county ID for the county name
            const countries = await this.cargusService.getCountries();
            const romania = countries.find(c => c.Abbreviation === 'RO' || c.CountryName === 'Romania');

            if (!romania) {
                logger.error('Romania not found in countries list');
                throw new Error(`Romania not found in Cargus countries database`);
            }

            const counties = await this.cargusService.getCounties(romania.CountryId);
            logger.info({ countyName, availableCounties: counties.slice(0, 5).map(c => c.Name) }, 'Searching for county');
            
            const county = counties.find(c =>
                c.Name === countyName ||
                c.Abbreviation === countyName ||
                c.Name.toLowerCase() === countyName.toLowerCase()
            );

            if (!county) {
                logger.error({ 
                    cityName, 
                    countyName, 
                    availableCounties: counties.map(c => c.Name) 
                }, 'County not found in Cargus database');
                throw new Error(`County '${countyName}' not found in Cargus database. Available counties: ${counties.map(c => c.Name).join(', ')}`);
            }

            logger.info({ countyName, foundCounty: county.Name, countyId: county.CountyId }, 'County found, getting localities');

            // Get localities for this county
            const localities = await this.cargusService.getLocalities(romania.CountryId, county.CountyId);
            logger.info({ 
                cityName, 
                countyName, 
                localitiesCount: localities.length,
                sampleLocalities: localities.slice(0, 10).map(l => l.Name)
            }, 'Retrieved localities for county');

            // Normalize city name for better matching
            const normalizedCityName = this.normalizeLocalityName(cityName);
            
            // Try exact match first
            let locality = localities.find(l => 
                this.normalizeLocalityName(l.Name) === normalizedCityName
            );

            // If no exact match, try partial match
            if (!locality) {
                locality = localities.find(l => {
                    const normalizedLocality = this.normalizeLocalityName(l.Name);
                    return normalizedLocality.includes(normalizedCityName) ||
                           normalizedCityName.includes(normalizedLocality);
                });
            }

            // If still no match, try more fuzzy matching
            if (!locality) {
                locality = localities.find(l => {
                    const normalizedLocality = this.normalizeLocalityName(l.Name);
                    // Remove common prefixes/suffixes
                    const cleanCity = normalizedCityName.replace(/^(municipiul|orasul|comuna)\s+/i, '');
                    const cleanLocality = normalizedLocality.replace(/^(municipiul|orasul|comuna)\s+/i, '');
                    
                    return cleanLocality === cleanCity ||
                           cleanLocality.includes(cleanCity) ||
                           cleanCity.includes(cleanLocality);
                });
            }

            if (locality) {
                logger.info({ 
                    originalCity: cityName, 
                    mappedCity: locality.Name,
                    localityId: locality.LocalityId 
                }, 'Successfully mapped locality');
                return locality.Name;
            } else {
                logger.error({ 
                    cityName, 
                    countyName, 
                    normalizedCityName,
                    availableLocalities: localities.slice(0, 20).map(l => l.Name),
                    totalLocalities: localities.length
                }, 'Locality not found in Cargus database');
                
                throw new Error(`Locality '${cityName}' not found in county '${countyName}'. Available localities: ${localities.slice(0, 10).map(l => l.Name).join(', ')}${localities.length > 10 ? ` (and ${localities.length - 10} more)` : ''}`);
            }

        } catch (error) {
            logger.error({ 
                error: error.message, 
                cityName, 
                countyName,
                stack: error.stack 
            }, 'Failed to validate locality');
            throw new Error(`Address validation failed: ${error.message}`);
        }
    }

    /**
     * Normalize locality name for better matching
     * @param {string} name - Locality name to normalize
     * @returns {string} Normalized name
     */
    normalizeLocalityName(name) {
        if (!name) return '';
        
        return name
            .toLowerCase()
            .trim()
            // Remove diacritics
            .replace(/ă/g, 'a')
            .replace(/â/g, 'a')
            .replace(/î/g, 'i')
            .replace(/ș/g, 's')
            .replace(/ț/g, 't')
            // Remove extra spaces
            .replace(/\s+/g, ' ')
            // Remove common prefixes that might cause mismatches
            .replace(/^(municipiul|orasul|comuna|satul)\s+/i, '');
    }
}

export default CargusAdapter;
