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
        
        // Default pickup point configuration from config
        this.defaultPickupPoint = config.cargus.pickupPoint;
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

        // Use custom package weight from payload, ensure it's a proper number and minimum 1kg
        const totalWeight = Math.max(Math.ceil(parseFloat(packageInfo?.weight) || 1.0), 1); // Convert to integer, minimum 1kg

        // Map service type to Cargus service ID
        const serviceId = this.mapServiceToCargusId(service, totalWeight);

        // Map the county name once to ensure consistency
        const mappedCounty = this.mapProvinceToCounty(address.province);

        return {
            pickupStartDate: this.getDefaultPickupStart(),
            pickupEndDate: this.getDefaultPickupEnd(),
            sender: {
                LocationId: this.defaultPickupPoint.LocationId,
                Name: this.defaultPickupPoint.Name,
                CountyName: this.defaultPickupPoint.CountyName,
                LocalityName: this.defaultPickupPoint.LocalityName,
                AddressText: this.defaultPickupPoint.AddressText,
                ContactPerson: this.defaultPickupPoint.ContactPerson,
                PhoneNumber: this.defaultPickupPoint.PhoneNumber,
                Email: this.defaultPickupPoint.Email
            },
            recipient: {
                Name: `${address.firstName || address.first_name} ${address.lastName || address.last_name}`,
                CountyName: mappedCounty,
                LocalityName: await this.validateAndMapLocality(address.city, mappedCounty),
                AddressText: `${address.address1} ${address.address2 || ''}`.trim(),
                ContactPerson: `${address.firstName || address.first_name} ${address.lastName || address.last_name}`,
                PhoneNumber: address.phone || order.phone || "0747866049",
                CodPostal: address.zip,
                Email: address.email || order.email
            },
            parcels: 1, // Always use 1 parcel for this service
            envelopes: 0, // Set to 0 since service doesn't allow multiple parts
            totalWeight: totalWeight, // Already converted to integer above
            serviceId: serviceId,
            declaredValue: insuranceValue ? parseFloat(insuranceValue) : parseFloat(order.total_price),
            cashRepayment: codAmount ? parseFloat(codAmount) : 0,
            openPackage: openPackage || false,
            saturdayDelivery: saturdayDelivery || false,
            morningDelivery: morningDelivery || false,
            shipmentPayer: parseInt(shipmentPayer) || 1,
            observations: observations || `Primesupplements order ${order.order_number}`,
            packageContent: `Order #${order.order_number} - Package`,
            parcelCodes: [{
                Code: "0",
                Type: 1,
                Weight: totalWeight,
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
            // Use createAwb for pickup point AWBs (not createAwbWithPickup)
            const awb = await this.cargusService.createAwb(awbData);

            // Detailed response analysis
            logger.info({
                awbResponse: awb,
                responseType: typeof awb
            }, 'AWB Creation - Using Pickup Point (Awbs endpoint)');

            // Handle AWB response - standard endpoint returns AWB ID as number/string
            let processedAwb;
            
            if (typeof awb === 'number' || typeof awb === 'string') {
                // Standard response from AwbPickup - create full AWB object
                const awbId = typeof awb === 'string' ? parseInt(awb) : awb;
                logger.info({ awbId }, 'Creating AWB object from numeric/string response');
                
                processedAwb = {
                    AwbId: awbId,
                    Id: awbId,
                    BarCode: awb.toString(),
                    Status: 'Created',
                    Cost: null,
                    TotalCost: null,
                    CreationDate: new Date().toISOString()
                };
                
                logger.info({ 
                    processedAwb,
                    barCode: processedAwb.BarCode,
                    awbId: processedAwb.AwbId
                }, 'Successfully created AWB object from Cargus response');
                
            } else if (typeof awb === 'object' && awb !== null) {
                // Unexpected object response - log it for debugging
                logger.warn({ awb, awbKeys: Object.keys(awb) }, 'Received unexpected object response from AwbPickup endpoint');
                
                // Try to extract AWB info from object if possible
                if (awb.BarCode || awb.AwbId || awb.Id) {
                    processedAwb = awb;
                    if (!processedAwb.BarCode && (processedAwb.AwbId || processedAwb.Id)) {
                        processedAwb.BarCode = (processedAwb.AwbId || processedAwb.Id).toString();
                    }
                } else {
                    throw new Error(`Unexpected object response from AwbPickup: ${JSON.stringify(awb)}`);
                }
                
            } else {
                // Completely unexpected response format
                throw new Error(`Invalid AWB response format: expected number/string, got ${typeof awb}. Response: ${JSON.stringify(awb)}`);
            }

            return processedAwb;
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
                    serviceId: awbData.serviceId,
                    recipientCounty: awbData.recipient?.CountyName,
                    recipientLocality: awbData.recipient?.LocalityName
                }
            }, 'Error creating AWB with Cargus using pickup point (Awbs endpoint)');
            
            throw new Error(`Failed to create AWB with Cargus: ${cargusError.message}`);
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
                // Force Service ID 35 (Standard Plus) for better COD support
                // instead of 34 (Economic Standard) which might not support COD
                if (weight <= 50) return 35; // Standard Plus - better COD support
                return 50; // Heavy package service
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
