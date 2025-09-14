import axios from "axios";
import config from "../config/AppConfig.js";
import { logger } from "../utils/index.js";

/**
 * Cargus API v3 Service
 * Handles integration with Cargus courier services
 * 
 * Features:
 * - Authentication and token management
 * - Geography (countries, counties, localities, streets)
 * - Pickup location management
 * - Rate calculation
 * - AWB (transport waybill) management
 * - Order management and tracking
 * - Cash on Delivery tracking
 * - Invoice management
 */
export default class CargusService {
    constructor(subscriptionKey, username, password) {
        if (!subscriptionKey || !username || !password) {
            throw new Error('CargusService requires subscriptionKey, username, and password');
        }
        
        this.subscriptionKey = subscriptionKey;
        this.username = username;
        this.password = password;
        this.baseURL = "https://urgentcargus.azure-api.net/api";
        this.token = null;
        this.tokenExpiry = null;
        
        this.api = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Ocp-Apim-Subscription-Key': this.subscriptionKey,
                'Ocp-Apim-Trace': 'true',
                'Content-Type': 'application/json'
            }
        });
        
        // Auto-authenticate requests (except for LoginUser)
        this.api.interceptors.request.use(async (config) => {
            if (config.url !== '/LoginUser') {
                await this.ensureToken();
                config.headers.Authorization = `Bearer ${this.token}`;
            }
            return config;
        });
        
        // Auto-retry on auth failure
        this.api.interceptors.response.use(
            response => response,
            async (error) => {
                if (error.response?.status === 401 && !error.config._retry) {
                    error.config._retry = true;
                    this.token = null;
                    await this.ensureToken();
                    error.config.headers.Authorization = `Bearer ${this.token}`;
                    return this.api(error.config);
                }
                return Promise.reject(error);
            }
        );
    }

    // ==================== AUTHENTICATION ====================

    /**
     * Login and obtain authentication token (valid for 24 hours)
     * @returns {Promise<string>} Authentication token
     */
    async login() {
        try {
            logger.info({ 
                username: this.username,
                baseURL: this.baseURL,
                subscriptionKeyLength: this.subscriptionKey?.length || 0
            }, 'Attempting Cargus authentication');
            
            const response = await this.api.post('/LoginUser', {
                UserName: this.username,
                Password: this.password
            });
            
            this.token = response.data;
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
            
            logger.info({ username: this.username }, 'Cargus authentication successful');
            return this.token;
            
        } catch (error) {
            const errorDetails = {
                username: this.username,
                baseURL: this.baseURL,
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                headers: error.response?.headers,
                responseData: error.response?.data
            };
            
            logger.error(errorDetails, 'Cargus authentication failed');
            
            // Provide more helpful error messages
            if (error.response?.status === 503) {
                throw new Error('Cargus API service is temporarily unavailable (503). Please try again later.');
            } else if (error.response?.status === 401) {
                throw new Error('Invalid Cargus credentials. Please check your subscription key, username, and password.');
            } else if (error.response?.status === 403) {
                throw new Error('Access forbidden. Please check your API subscription and permissions.');
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error('Cannot connect to Cargus API. Please check the base URL and network connectivity.');
            }
            
            throw error;
        }
    }

    /**
     * Verify if the current token is valid
     * @returns {Promise<boolean>} Token validity status
     */
    async verifyToken() {
        try {
            const response = await this.api.get('/TokenVerification');
            return response.data === true;
        } catch (error) {
            logger.warn({ error: error.message }, 'Token verification failed');
            return false;
        }
    }

    /**
     * Ensure we have a valid token, refresh if needed
     * @private
     */
    async ensureToken() {
        if (this.token && Date.now() < this.tokenExpiry) {
            return;
        }
        
        await this.login();
    }

    // ==================== GEOGRAPHY ====================

    /**
     * Get list of countries
     * @returns {Promise<Array>} List of countries with CountryId, CountryName, Abbreviation
     */
    async getCountries() {
        return this.request('GET', '/Countries');
    }

    /**
     * Get counties in a country
     * @param {number} countryId - Country ID
     * @returns {Promise<Array>} List of counties
     */
    async getCounties(countryId) {
        return this.request('GET', `/Counties?countryId=${countryId}`);
    }

    /**
     * Get localities in a county
     * @param {number} countryId - Country ID
     * @param {number} countyId - County ID
     * @returns {Promise<Array>} List of localities
     */
    async getLocalities(countryId, countyId) {
        return this.request('GET', `/Localities?countryId=${countryId}&countyId=${countyId}`);
    }

    /**
     * Get streets in a locality
     * @param {number} localityId - Locality ID
     * @returns {Promise<Array>} List of streets
     */
    async getStreets(localityId) {
        return this.request('GET', `/Streets?localityId=${localityId}`);
    }

    // ==================== PICKUP LOCATIONS ====================

    /**
     * Get pickup locations for client
     * @returns {Promise<Array>} List of pickup locations
     */
    async getPickupLocations() {
        return this.request('GET', '/PickupLocations/GetForClient');
    }

    /**
     * Get active pickup points for user
     * @returns {Promise<Array>} List of active pickup points
     */
    async getActivePickupPoints() {
        return this.request('GET', '/PickupLocations');
    }

    /**
     * Add pickup location
     * @param {Object} locationData - Pickup location data
     * @returns {Promise<Object>} Created pickup location
     */
    async addPickupLocation(locationData) {
        const data = {
            AutomaticEOD: locationData.automaticEOD || "17:30",
            LocationId: "",
            Name: locationData.name,
            CountyId: locationData.countyId,
            CountyName: locationData.countyName,
            LocalityId: locationData.localityId,
            LocalityName: locationData.localityName,
            StreetId: locationData.streetId || 0,
            StreetName: locationData.streetName,
            BuildingNumber: locationData.buildingNumber,
            AddressText: locationData.addressText,
            ContactPerson: locationData.contactPerson,
            PhoneNumber: locationData.phoneNumber,
            CodPostal: locationData.postalCode,
            Email: locationData.email
        };
        
        return this.request('POST', '/PickupLocations', data);
    }

    /**
     * Modify pickup location
     * @param {Object} locationData - Updated pickup location data
     * @returns {Promise<Object>} Updated pickup location
     */
    async updatePickupLocation(locationData) {
        return this.request('PUT', '/PickupLocations', locationData);
    }

    /**
     * Assign pickup point to user
     * @param {number} locationId - Location ID to assign
     * @returns {Promise<number>} 1 if successful
     */
    async assignPickupPointToUser(locationId) {
        return this.request('POST', `/PickupLocations/AssignToUser?LocationId=${locationId}`);
    }

    // ==================== SHIP & GO CENTERS ====================
    // Note: Ship & Go (PUDO) functionality removed as it's not commonly used
    // and the endpoint may not be available for all accounts

    // ==================== ADDRESS BOOK ====================

    /**
     * Get address book recipients
     * @returns {Promise<Array>} List of recipients
     */
    async getRecipients() {
        return this.request('GET', '/Recipients');
    }

    // ==================== RATES ====================

    /**
     * Get contracted price tables
     * @returns {Promise<Array>} List of price tables
     */
    async getPriceTables() {
        return this.request('GET', '/PriceTables');
    }

    /**
     * Calculate shipping price
     * @param {Object} calculationData - Shipping calculation parameters
     * @returns {Promise<Object>} Price calculation result
     */
    async calculateShipping(calculationData) {
        const data = {
            FromLocalityId: calculationData.fromLocalityId,
            ToLocalityId: calculationData.toLocalityId,
            FromCountyName: calculationData.fromCountyName,
            FromLocalityName: calculationData.fromLocalityName,
            ToCountyName: calculationData.toCountyName,
            ToLocalityName: calculationData.toLocalityName,
            Parcels: calculationData.parcels || 0,
            Envelopes: calculationData.envelopes || 0,
            TotalWeight: calculationData.totalWeight,
            ServiceId: calculationData.serviceId, // 34: ≤31kg, 35: 31-50kg, 50: >50kg
            DeclaredValue: calculationData.declaredValue || 0,
            CashRepayment: calculationData.cashRepayment || 0,
            BankRepayment: calculationData.bankRepayment || 0,
            OtherRepayment: calculationData.otherRepayment || "",
            PaymentInstrumentId: calculationData.paymentInstrumentId, // 1: cheque, 2: BO, 3: other
            PaymentInstrumentValue: calculationData.paymentInstrumentValue || 0,
            OpenPackage: calculationData.openPackage || false,
            ShipmentPayer: calculationData.shipmentPayer || 1, // 1: sender, 2: recipient
            PriceTableId: calculationData.priceTableId || 0
        };
        
        return this.request('POST', '/ShippingCalculation', data);
    }

    // ==================== AWB MANAGEMENT ====================

    /**
     * Create AWB with pickup from another location
     * @param {Object} awbData - AWB creation data
     * @returns {Promise<Object>} Created AWB
     */
    async createAwbWithPickup(awbData) {
        const data = {
            PickupStartDate: awbData.pickupStartDate,
            PickupEndDate: awbData.pickupEndDate,
            SenderClientId: awbData.senderClientId || null,
            TertiaryClientId: awbData.tertiaryClientId || null,
            Sender: awbData.sender,
            Recipient: awbData.recipient,
            Parcels: awbData.parcels,
            Envelopes: awbData.envelopes || 0,
            TotalWeight: awbData.totalWeight,
            ServiceId: awbData.serviceId,
            DeclaredValue: awbData.declaredValue || 0,
            CashRepayment: awbData.cashRepayment || 0,
            BankRepayment: awbData.bankRepayment || 0,
            OtherRepayment: awbData.otherRepayment || "",
            OpenPackage: awbData.openPackage || false,
            PriceTableId: awbData.priceTableId || 0,
            ShipmentPayer: awbData.shipmentPayer || 1,
            SaturdayDelivery: awbData.saturdayDelivery || false,
            MorningDelivery: awbData.morningDelivery || false,
            Observations: awbData.observations || "",
            PackageContent: awbData.packageContent || "",
            CustomString: awbData.customString || "",
            ParcelCodes: awbData.parcelCodes || []
        };
        
        return this.request('POST', '/AwbPickup', data);
    }

    /**
     * Create AWB from pickup location
     * @param {Object} awbData - AWB creation data
     * @returns {Promise<Object>} Created AWB
     */
    async createAwb(awbData) {
        return this.request('POST', '/Awbs', awbData);
    }

    // Ship & Go AWB creation removed - not commonly used

    /**
     * Delete AWB (only if no checkpoints)
     * @param {string} barCode - AWB barcode
     * @returns {Promise<Object>} Deletion result
     */
    async deleteAwb(barCode) {
        return this.request('DELETE', `/Awbs?barCode=${barCode}`);
    }

    /**
     * Get AWB information by barcode
     * @param {string} barCode - AWB barcode
     * @returns {Promise<Object>} AWB information
     */
    async getAwbByBarcode(barCode) {
        return this.request('GET', `/Awbs?barCode=${barCode}`);
    }

    /**
     * Get AWB information by order ID
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} AWB information
     */
    async getAwbByOrderId(orderId) {
        return this.request('GET', `/Awbs?orderId=${orderId}`);
    }

    /**
     * Get AWBs by date range
     * @param {string} fromDate - Start date (mm-dd-yyyy)
     * @param {string} toDate - End date (mm-dd-yyyy)
     * @param {number} pageNumber - Page number (optional)
     * @param {number} itemsPerPage - Items per page (optional)
     * @returns {Promise<Array>} List of AWBs
     */
    async getAwbsByDate(fromDate, toDate, pageNumber = 1, itemsPerPage = 50) {
        return this.request('GET', `/Awbs/GetByDate?FromDate=${fromDate}&ToDate=${toDate}&pageNumber=${pageNumber}&itemsPerPage=${itemsPerPage}`);
    }

    /**
     * Get routing details by address
     * @param {Object} routingData - Routing calculation data
     * @returns {Promise<Object>} Routing details
     */
    async getRoutingByAddress(routingData) {
        const data = {
            TotalWeight: routingData.totalWeight,
            Sender: {
                CountyName: routingData.sender.countyName,
                LocalityName: routingData.sender.localityName,
                ZipCode: routingData.sender.zipCode
            },
            Recipient: {
                CountyName: routingData.recipient.countyName,
                LocalityName: routingData.recipient.localityName,
                AddressText: routingData.recipient.addressText,
                ZipCode: routingData.recipient.zipCode
            }
        };
        
        return this.request('POST', '/GetRoutingAddress', data);
    }

    // ==================== AWB DOCUMENTS & TRACKING ====================

    /**
     * Print AWB documents
     * @param {Array} barCodes - Array of barcodes
     * @param {string} type - Document type (PDF or HTML)
     * @param {number} format - Format (0: A4, 1: Label 10x14)
     * @param {number} printMainOnce - Print option (0: twice, 1: once, 2: once label format)
     * @returns {Promise<string>} Base64 encoded document
     */
    async printAwbDocuments(barCodes, type = 'PDF', format = 0, printMainOnce = 0) {
        const barCodesJson = JSON.stringify(barCodes);
        return this.request('GET', `/AwbDocuments?barCodes=${encodeURIComponent(barCodesJson)}&type=${type}&format=${format}&printMainOnce=${printMainOnce}`);
    }

    /**
     * Track shipments with redirected AWBs
     * @param {Array} barCodes - Array of barcodes
     * @returns {Promise<Array>} Tracking information
     */
    async trackShipmentsWithRedirect(barCodes) {
        const barCodesJson = JSON.stringify(barCodes);
        return this.request('GET', `/AwbTrace/WithRedirect?barCode=${encodeURIComponent(barCodesJson)}`);
    }

    /**
     * Get returning AWBs for a specific date
     * @param {string} date - Date (yyyy-mm-dd)
     * @returns {Promise<Array>} List of returning AWBs
     */
    async getReturningAwbs(date) {
        return this.request('GET', `/AwbRetur?data=${date}`);
    }

    /**
     * Get delta events from date interval
     * @param {string} fromDate - Start date (mm-dd-yyyy)
     * @param {string} toDate - End date (mm-dd-yyyy)
     * @returns {Promise<Array>} List of events
     */
    async getDeltaEvents(fromDate, toDate) {
        return this.request('GET', `/AwbTrace/GetDeltaEvents?FromDate=${fromDate}&ToDate=${toDate}`);
    }

    /**
     * Get confirmation picture (scan)
     * @param {string} barCode - AWB barcode
     * @returns {Promise<string>} Base64 encoded image
     */
    async getConfirmationPicture(barCode) {
        return this.request('GET', `/AwbScan?barCodes=${barCode}`);
    }

    // ==================== ORDER MANAGEMENT ====================

    /**
     * Launch or cancel order for pickup point
     * @param {number} locationId - Location ID (0 for headquarters)
     * @param {number} action - Action (0: cancel, 1: validate)
     * @param {string} pickupStartDate - Pickup start date
     * @param {string} pickupEndDate - Pickup end date
     * @returns {Promise<Object>} Order result
     */
    async manageOrder(locationId, action, pickupStartDate, pickupEndDate) {
        return this.request('PUT', `/Orders?locationId=${locationId}&action=${action}&PickupStartDate=${pickupStartDate}&PickupEndDate=${pickupEndDate}`);
    }

    /**
     * Launch or cancel all orders
     * @param {number} action - Action (0: cancel, 1: validate)
     * @param {string} pickupStartDate - Pickup start date
     * @param {string} pickupEndDate - Pickup end date
     * @returns {Promise<Object>} Order result
     */
    async manageAllOrders(action, pickupStartDate, pickupEndDate) {
        return this.request('PUT', `/Orders/PutAll?action=${action}&PickupStartDate=${pickupStartDate}&PickupEndDate=${pickupEndDate}`);
    }

    /**
     * Get order information for pickup point
     * @param {number} locationId - Location ID
     * @param {number} status - Status (0: current orders, 1: validated orders)
     * @param {number} pageNumber - Page number (optional)
     * @param {number} itemsPerPage - Items per page (optional)
     * @returns {Promise<Array>} List of orders
     */
    async getOrdersByLocation(locationId, status, pageNumber = 1, itemsPerPage = 50) {
        return this.request('GET', `/Orders?locationId=${locationId}&status=${status}&pageNumber=${pageNumber}&itemsPerPage=${itemsPerPage}`);
    }

    /**
     * Get orders by date range
     * @param {string} fromDate - Start date (yyyy-mm-dd)
     * @param {string} toDate - End date (yyyy-mm-dd)
     * @param {number} pageNumber - Page number (optional)
     * @param {number} itemsPerPage - Items per page (optional)
     * @returns {Promise<Array>} List of orders
     */
    async getOrdersByDate(fromDate, toDate, pageNumber = 1, itemsPerPage = 50) {
        return this.request('GET', `/Orders/GetByDate?FromDate=${fromDate}&ToDate=${toDate}&pageNumber=${pageNumber}&itemsPerPage=${itemsPerPage}`);
    }

    /**
     * Get order by ID
     * @param {string} orderId - Order ID
     * @returns {Promise<Object>} Order information
     */
    async getOrderById(orderId) {
        return this.request('GET', `/Orders/GetByOrderId?orderId=${orderId}`);
    }

    // ==================== CASH ON DELIVERY ====================

    /**
     * Get COD by date range
     * @param {string} fromDate - Start date (yyyy-mm-dd)
     * @param {string} toDate - End date (yyyy-mm-dd)
     * @returns {Promise<Array>} COD information
     */
    async getCodByDate(fromDate, toDate) {
        return this.request('GET', `/CashAccount/GetByDate?FromDate=${fromDate}&ToDate=${toDate}`);
    }

    /**
     * Get refunds after date
     * @param {string} deductionDate - Deduction date (yyyy-mm-dd)
     * @returns {Promise<Array>} Refund information
     */
    async getRefundsByDate(deductionDate) {
        return this.request('GET', `/CashAccount/GetByDeductionDate?DeductionDate=${deductionDate}`);
    }

    /**
     * Get refund by barcode
     * @param {string} barCode - AWB barcode
     * @returns {Promise<Object>} Refund information
     */
    async getRefundByBarcode(barCode) {
        return this.request('GET', `/CashAccount?barCode=${barCode}`);
    }

    // ==================== INVOICES ====================

    /**
     * Get invoices by date range
     * @param {string} fromDate - Start date (yyyy-mm-dd)
     * @param {string} toDate - End date (yyyy-mm-dd)
     * @param {number} pageNumber - Page number (optional)
     * @param {number} itemsPerPage - Items per page (optional)
     * @returns {Promise<Array>} List of invoices
     */
    async getInvoicesByDate(fromDate, toDate, pageNumber = 1, itemsPerPage = 50) {
        return this.request('GET', `/Invoices?FromDate=${fromDate}&ToDate=${toDate}&pageNumber=${pageNumber}&itemsPerPage=${itemsPerPage}`);
    }

    /**
     * Get invoice PDF document
     * @param {number} invoiceId - Invoice ID
     * @returns {Promise<string>} Base64 encoded PDF
     */
    async getInvoicePdf(invoiceId) {
        return this.request('GET', `/InvoiceDocuments?InvoiceId=${invoiceId}`);
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Generic request method with retry logic
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @param {number} retries - Number of retries
     * @returns {Promise<any>} Response data
     */
    async request(method, endpoint, data = null, retries = 3) {
        const config = { method, url: endpoint };
        if (data) {
            if (method === 'GET') {
                config.params = data;
            } else {
                config.data = data;
            }
        }
        
        return this.requestWithRetry(config, retries);
    }

    /**
     * Request with retry logic
     * @param {Object} config - Axios config
     * @param {number} maxRetries - Maximum retries
     * @param {number} attempt - Current attempt
     * @returns {Promise<any>} Response data
     * @private
     */
    async requestWithRetry(config, maxRetries, attempt = 1) {
        const baseDelay = 2000; // 2 seconds
        
        try {
            const response = await this.api(config);
            
            // Log successful requests
            logger.info({
                method: config.method,
                endpoint: config.url,
                status: response.status,
                attempt
            }, 'Cargus API request successful');
            
            return response.data;
            
        } catch (error) {
            const isRetryable = this.isRetryableError(error);
            const status = error.response?.status;
            const respData = error.response?.data;
            
            if (isRetryable && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt - 1);
                
                logger.warn({
                    method: config.method,
                    endpoint: config.url,
                    error: error.message,
                    status,
                    response: respData,
                    attempt,
                    maxRetries,
                    delay
                }, 'Cargus API request failed, retrying');
                
                await this.sleep(delay);
                return this.requestWithRetry(config, maxRetries, attempt + 1);
                
            } else {
                logger.error({
                    method: config.method,
                    endpoint: config.url,
                    error: error.message,
                    status,
                    response: respData,
                    attempt,
                    maxRetries,
                    retryable: isRetryable
                }, 'Cargus API request failed permanently');
                
                throw error;
            }
        }
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error object
     * @returns {boolean} Whether error is retryable
     * @private
     */
    isRetryableError(error) {
        // Network/connection errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            return true;
        }
        
        // HTTP 5xx server errors
        if (error.response?.status >= 500) {
            return true;
        }
        
        // Rate limiting (429)
        if (error.response?.status === 429) {
            return true;
        }
        
        // Authentication errors are handled by interceptors, don't retry here
        return false;
    }

    /**
     * Sleep utility for delays
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     * @private
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ==================== DEBUGGING & TESTING METHODS ====================

    /**
     * Test API connectivity and endpoint availability
     * @returns {Promise<Object>} Connection test results
     */
    async testConnectivity() {
        const results = {
            baseURL: this.baseURL,
            subscriptionKey: this.subscriptionKey ? 'Present' : 'Missing',
            credentials: (this.username && this.password) ? 'Present' : 'Missing',
            tests: []
        };

        // Test 1: Basic connectivity
        try {
            const response = await axios.get(this.baseURL.replace('/api', ''), {
                timeout: 5000,
                headers: {
                    'Ocp-Apim-Subscription-Key': this.subscriptionKey
                }
            });
            results.tests.push({
                test: 'Basic connectivity',
                status: 'PASS',
                details: `HTTP ${response.status}`
            });
        } catch (error) {
            results.tests.push({
                test: 'Basic connectivity',
                status: 'FAIL',
                details: error.message,
                httpStatus: error.response?.status
            });
        }

        // Test 2: API endpoint availability
        try {
            const response = await axios.get(this.baseURL, {
                timeout: 5000,
                headers: {
                    'Ocp-Apim-Subscription-Key': this.subscriptionKey
                }
            });
            results.tests.push({
                test: 'API endpoint',
                status: 'PASS',
                details: `HTTP ${response.status}`
            });
        } catch (error) {
            results.tests.push({
                test: 'API endpoint',
                status: 'FAIL',
                details: error.message,
                httpStatus: error.response?.status
            });
        }

        return results;
    }

    // ==================== HELPER METHODS ====================

    /**
     * Format date for Cargus API (mm-dd-yyyy)
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date
     */
    static formatDateMMDDYYYY(date) {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${month}-${day}-${year}`;
    }

    /**
     * Format date for Cargus API (yyyy-mm-dd)
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date
     */
    static formatDateYYYYMMDD(date) {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${year}-${month}-${day}`;
    }

    /**
     * Get service ID by weight
     * @param {number} weight - Weight in kg
     * @returns {number} Service ID
     */
    static getServiceIdByWeight(weight) {
        if (weight <= 31) return 34; // Economic Standard
        if (weight <= 50) return 35; // Standard Plus
        return 50; // Heavy package service
    }

    /**
     * Validate Romanian phone number
     * @param {string} phone - Phone number
     * @returns {boolean} Valid phone number
     */
    static isValidRomanianPhone(phone) {
        // Romanian phone number patterns
        const patterns = [
            /^07\d{8}$/, // Mobile: 07xxxxxxxx
            /^02\d{8}$/, // Bucharest: 02xxxxxxxx
            /^03\d{8}$/, // Other cities: 03xxxxxxxx
            /^\+407\d{8}$/, // International mobile
            /^\+402\d{8}$/, // International Bucharest
            /^\+403\d{8}$/ // International other cities
        ];
        
        return patterns.some(pattern => pattern.test(phone.replace(/\s/g, '')));
    }
}
