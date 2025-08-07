import axios from "axios";

/**
 * ANAF (Romanian National Agency for Fiscal Administration) Service
 * Provides company verification and tax information retrieval
 * 
 * API Documentation: https://static.anaf.ro/static/10/Anaf/Informatii_R/Servicii_web/doc_WS_V9.txt
 */
export default class AnafService {
    constructor() {
        this.baseURL = "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9";
        this.timeout = 30000; // 30 seconds
        
        // Rate limiting: max 1 request per second, max 100 CUI per request
        this.lastRequestTime = 0;
        this.minRequestInterval = 1000; // 1 second
        
        this.api = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    /**
     * Enforce rate limiting - wait if necessary
     * @private
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`⏳ ANAF rate limiting: waiting ${waitTime}ms`);
            await this.sleep(waitTime);
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Sleep utility
     * @private
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Validate and normalize CUI (Romanian tax identification number)
     * @param {string|number} cui - The CUI to validate
     * @returns {number} - Normalized CUI as number
     * @throws {Error} - If CUI is invalid
     */
    validateCUI(cui) {
        if (!cui) {
            throw new Error('CUI is required');
        }

        // Convert to string and remove common prefixes/formatting
        let cuiStr = cui.toString().trim().toUpperCase();
        
        // Remove RO prefix if present
        if (cuiStr.startsWith('RO')) {
            cuiStr = cuiStr.substring(2);
        }
        
        // Remove any non-digit characters
        cuiStr = cuiStr.replace(/\D/g, '');
        
        if (!cuiStr || cuiStr.length === 0) {
            throw new Error('Invalid CUI format');
        }

        const cuiNumber = parseInt(cuiStr, 10);
        
        if (isNaN(cuiNumber) || cuiNumber <= 0) {
            throw new Error('CUI must be a positive number');
        }

        return cuiNumber;
    }

    /**
     * Format date for ANAF API (YYYY-MM-DD)
     * @param {Date|string} date - Date to format
     * @returns {string} - Formatted date string
     */
    formatDate(date = new Date()) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        
        if (!(date instanceof Date) || isNaN(date)) {
            throw new Error('Invalid date provided');
        }
        
        return date.toISOString().split('T')[0];
    }

    /**
     * Verify a single company by CUI
     * @param {string|number} cui - Company CUI
     * @param {Date|string} date - Verification date (defaults to today)
     * @returns {Promise<Object>} - Company verification result
     */
    async verifyCompany(cui, date = new Date()) {
        const results = await this.verifyCompanies([cui], date);
        
        if (results.found && results.found.length > 0) {
            return results.found[0];
        }
        
        if (results.notFound && results.notFound.includes(this.validateCUI(cui))) {
            throw new Error(`Company with CUI ${cui} not found in ANAF database`);
        }
        
        throw new Error(`Unexpected response format for CUI ${cui}`);
    }

    /**
     * Verify multiple companies by CUI
     * @param {Array<string|number>} cuis - Array of company CUIs (max 100)
     * @param {Date|string} date - Verification date (defaults to today)
     * @returns {Promise<Object>} - Verification results
     */
    async verifyCompanies(cuis, date = new Date()) {
        if (!Array.isArray(cuis) || cuis.length === 0) {
            throw new Error('CUIs array is required and must not be empty');
        }
        
        if (cuis.length > 100) {
            throw new Error('Maximum 100 CUIs per request allowed');
        }

        // Validate and normalize all CUIs
        const normalizedCuis = cuis.map(cui => this.validateCUI(cui));
        const formattedDate = this.formatDate(date);

        // Prepare request payload
        const payload = normalizedCuis.map(cui => ({
            cui: cui,
            data: formattedDate
        }));

        try {
            await this.enforceRateLimit();
            
            console.log(`🔍 Verifying ${normalizedCuis.length} companies with ANAF for date ${formattedDate}`);
            
            const response = await this.api.post('/tva', payload);
            
            // Check if response has the expected structure
            if (!response.data || typeof response.data !== 'object') {
                throw new Error(`Invalid ANAF API response format: ${typeof response.data}`);
            }
            
            // ANAF API returns data directly with found/notFound arrays
            // The cod field is optional and may not be present in successful responses
            if (response.data.cod && response.data.cod !== 200) {
                throw new Error(`ANAF API error (${response.data.cod}): ${response.data.message || 'Unknown error'}`);
            }
            
            // Extract found and notFound arrays
            const found = response.data.found || [];
            const notFound = response.data.notFound || [];
            
            console.log(`✅ ANAF verification completed: ${found.length} found, ${notFound.length} not found`);
            
            return {
                status: response.data.cod || 200,
                message: response.data.message || 'Success',
                found: found,
                notFound: notFound
            };

        } catch (error) {
            console.error('❌ ANAF verification failed:', {
                cuis: normalizedCuis,
                date: formattedDate,
                error: error.message,
                errorType: error.constructor.name
            });
            
            if (error.response) {
                console.error(`📥 ANAF API error (${error.response.status}):`, error.response.data?.message || error.response.statusText);
                throw new Error(`ANAF API error (${error.response.status}): ${error.response.data?.message || error.response.statusText || error.message}`);
            } else if (error.request) {
                console.error(`📤 ANAF API not responding:`, error.code || 'NETWORK_ERROR');
                throw new Error(`ANAF API is not responding (${error.code || 'NETWORK_ERROR'}). Please try again later.`);
            } else {
                console.error('⚙️ ANAF service error:', error.message);
                throw error;
            }
        }
    }

    /**
     * Extract key company information from ANAF response
     * @param {Object} anafData - Raw ANAF company data
     * @returns {Object} - Simplified company information
     */
    extractCompanyInfo(anafData) {
        if (!anafData || !anafData.date_generale) {
            throw new Error('Invalid ANAF data provided');
        }

        const general = anafData.date_generale;
        const vatInfo = anafData.inregistrare_scop_Tva || {};
        const vatOnCollection = anafData.inregistrare_RTVAI || {};
        const inactive = anafData.stare_inactiv || {};
        const splitVAT = anafData.inregistrare_SplitTVA || {};
        const socialAddress = anafData.adresa_sediu_social || {};
        const fiscalAddress = anafData.adresa_domiciliu_fiscal || {};

        return {
            // Basic company information
            cui: general.cui,
            name: general.denumire,
            registrationNumber: general.nrRegCom,
            registrationDate: general.data_inregistrare,
            registrationStatus: general.stare_inregistrare,
            
            // Contact information
            address: general.adresa,
            phone: general.telefon,
            fax: general.fax,
            postalCode: general.codPostal,
            
            // Business information
            caenCode: general.cod_CAEN,
            authorizationAct: general.act,
            competentFiscalOrgan: general.organFiscalCompetent,
            propertyForm: general.forma_de_proprietate,
            organizationForm: general.forma_organizare,
            legalForm: general.forma_juridica,
            
            // Banking
            iban: general.iban,
            
            // Tax status
            vatPayer: vatInfo.scpTVA === true,
            vatStartDate: vatInfo.perioade_TVA?.data_inceput_ScpTVA,
            vatEndDate: vatInfo.perioade_TVA?.data_sfarsit_ScpTVA,
            
            // VAT on collection
            vatOnCollection: vatOnCollection.statusTvaIncasare === true,
            vatOnCollectionStartDate: vatOnCollection.dataInceputTvaInc,
            vatOnCollectionEndDate: vatOnCollection.dataSfarsitTvaInc,
            
            // Inactive status
            inactive: inactive.statusInactivi === true,
            inactiveDate: inactive.dataInactivare,
            reactivationDate: inactive.dataReactivare,
            
            // Split VAT
            splitVAT: splitVAT.statusSplitTVA === true,
            splitVATStartDate: splitVAT.dataInceputSplitTVA,
            splitVATEndDate: splitVAT.dataAnulareSplitTVA,
            
            // E-Invoice
            eInvoiceRegistered: general.statusRO_e_Factura === true,
            
            // Addresses
            socialAddress: {
                street: socialAddress.sdenumire_Strada,
                number: socialAddress.snumar_Strada,
                locality: socialAddress.sdenumire_Localitate,
                county: socialAddress.sdenumire_Judet,
                country: socialAddress.stara,
                postalCode: socialAddress.scod_Postal,
                details: socialAddress.sdetalii_Adresa
            },
            
            fiscalAddress: {
                street: fiscalAddress.ddenumire_Strada,
                number: fiscalAddress.dnumar_Strada,
                locality: fiscalAddress.ddenumire_Localitate,
                county: fiscalAddress.ddenumire_Judet,
                country: fiscalAddress.dtara,
                postalCode: fiscalAddress.dcod_Postal,
                details: fiscalAddress.ddetalii_Adresa
            }
        };
    }

    /**
     * Check if a company is a valid VAT payer
     * @param {string|number} cui - Company CUI
     * @param {Date|string} date - Check date (defaults to today)
     * @returns {Promise<boolean>} - True if company is VAT payer
     */
    async isVATPayerActive(cui, date = new Date()) {
        try {
            const company = await this.verifyCompany(cui, date);
            const info = this.extractCompanyInfo(company);
            return info.vatPayer && !info.inactive;
        } catch (error) {
            console.warn(`⚠️ Could not verify VAT status for CUI ${cui}:`, error.message);
            return false;
        }
    }

    /**
     * Get company details for Oblio integration
     * @param {string|number} cui - Company CUI
     * @param {Date|string} date - Verification date (defaults to today)
     * @returns {Promise<Object>} - Company details formatted for Oblio
     */
    async getCompanyForOblio(cui, date = new Date()) {
        try {
            const company = await this.verifyCompany(cui, date);
            const info = this.extractCompanyInfo(company);
            
            // Format for Oblio client structure
            return {
                name: info.name,
                cui: info.cui,
                regCom: info.registrationNumber,
                address: {
                    street: info.fiscalAddress.street && info.fiscalAddress.number 
                        ? `${info.fiscalAddress.street} ${info.fiscalAddress.number}`.trim()
                        : info.address,
                    city: info.fiscalAddress.locality,
                    county: info.fiscalAddress.county,
                    country: info.fiscalAddress.country || 'România',
                    zip: info.fiscalAddress.postalCode || info.postalCode
                },
                phone: info.phone,
                vatPayer: info.vatPayer,
                inactive: info.inactive,
                eInvoiceRegistered: info.eInvoiceRegistered,
                // Additional metadata
                anafVerified: true,
                anafVerificationDate: this.formatDate(date)
            };
        } catch (error) {
            console.error(`❌ Failed to get company details for CUI ${cui}:`, error.message);
            throw error;
        }
    }
}
