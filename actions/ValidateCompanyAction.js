import AnafService from '../services/AnafService.js';
import { logger } from '../utils/index.js';

/**
 * Action: Validate Company
 * 
 * Handles company validation using ANAF (Romanian tax authority) API.
 * Provides real-time company information for B2B invoice creation.
 * 
 * Single Responsibility: ANAF company validation and data enrichment
 */
export class ValidateCompanyAction {
    constructor(anafService = null) {
        // Allow dependency injection for testing
        this.anafService = anafService || new AnafService();
    }

    /**
     * Execute company validation
     * @param {Object} params - Validation parameters
     * @returns {Promise<Object>} Validation result with company data
     */
    async execute({
        cif,
        includeInactiveCompanies = false,
        validateRegistration = true
    }) {
        try {
            logger.info({ cif, includeInactiveCompanies }, 'Starting company validation with ANAF');

            // Validate CIF format
            const cifValidation = this._validateCifFormat(cif);
            if (!cifValidation.isValid) {
                return {
                    success: false,
                    error: cifValidation.error,
                    errorType: 'INVALID_FORMAT',
                    cif: cif
                };
            }

            const cleanCif = cifValidation.cleanCif;

            // Query ANAF for company information
            const anafData = await this.anafService.verifyCompany(cleanCif);

            if (!anafData) {
                logger.warn({ cif: cleanCif }, 'Company not found in ANAF database');
                return {
                    success: false,
                    error: 'Company not found in ANAF database',
                    errorType: 'NOT_FOUND',
                    cif: cleanCif
                };
            }

            // Check if company is active (if validation required)
            if (validateRegistration && !this._isCompanyActive(anafData)) {
                logger.warn({ cif: cleanCif, status: anafData.stare }, 'Company is not active');
                
                if (!includeInactiveCompanies) {
                    return {
                        success: false,
                        error: 'Company is not active for VAT purposes',
                        errorType: 'INACTIVE',
                        cif: cleanCif,
                        companyData: anafData
                    };
                }
            }

            // Extract and format company information
            const companyInfo = this._extractCompanyInfo(anafData, cleanCif);

            logger.info({ 
                cif: cleanCif, 
                companyName: companyInfo.name,
                isActive: companyInfo.isActive 
            }, 'Company validation successful');

            return {
                success: true,
                cif: cleanCif,
                company: companyInfo,
                rawAnafData: anafData,
                validatedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error({
                cif,
                error: error.message,
                stack: error.stack
            }, 'Failed to validate company with ANAF');

            return {
                success: false,
                error: `ANAF validation failed: ${error.message}`,
                errorType: 'API_ERROR',
                cif: cif,
                retryable: this._isRetryableError(error)
            };
        }
    }

    /**
     * Batch validate multiple companies
     * @param {Array} cifList - Array of CIF numbers to validate
     * @returns {Promise<Object>} Batch validation results
     */
    async validateBatch(cifList, options = {}) {
        try {
            logger.info({ cifCount: cifList.length }, 'Starting batch company validation');

            const results = await Promise.allSettled(
                cifList.map(cif => this.execute({ cif, ...options }))
            );

            const successful = results
                .filter(r => r.status === 'fulfilled' && r.value.success)
                .map(r => r.value);

            const failed = results
                .filter(r => r.status === 'rejected' || !r.value.success)
                .map(r => r.status === 'fulfilled' ? r.value : { 
                    success: false, 
                    error: r.reason?.message || 'Unknown error' 
                });

            logger.info({
                totalRequested: cifList.length,
                successful: successful.length,
                failed: failed.length
            }, 'Batch validation completed');

            return {
                success: true,
                results: {
                    successful,
                    failed
                },
                summary: {
                    total: cifList.length,
                    successCount: successful.length,
                    failureCount: failed.length,
                    successRate: (successful.length / cifList.length * 100).toFixed(1)
                }
            };

        } catch (error) {
            logger.error({
                cifList,
                error: error.message
            }, 'Batch validation failed');

            return {
                success: false,
                error: `Batch validation failed: ${error.message}`
            };
        }
    }

    /**
     * Get company suggestions based on partial name or CIF
     * @param {Object} params - Search parameters
     * @returns {Promise<Object>} Search results
     */
    async searchCompanies({
        query,
        searchType = 'auto', // 'cif', 'name', 'auto'
        limit = 10
    }) {
        try {
            logger.info({ query, searchType, limit }, 'Searching for companies');

            // Determine search type if auto
            let actualSearchType = searchType;
            if (searchType === 'auto') {
                actualSearchType = this._detectSearchType(query);
            }

            let results = [];

            if (actualSearchType === 'cif') {
                // For CIF searches, try exact validation first
                const validation = await this.execute({ cif: query });
                if (validation.success) {
                    results.push({
                        cif: validation.cif,
                        name: validation.company.name,
                        address: validation.company.address,
                        isActive: validation.company.isActive,
                        matchType: 'exact'
                    });
                }
            } else {
                // For name searches, this would require a different ANAF endpoint
                // Currently ANAF API primarily supports CIF-based lookups
                logger.warn({ query }, 'Name-based company search not fully supported by ANAF API');
                return {
                    success: false,
                    error: 'Name-based search not supported. Please use CIF for company lookup.',
                    suggestions: ['Try searching by CIF number instead']
                };
            }

            return {
                success: true,
                results: results.slice(0, limit),
                query,
                searchType: actualSearchType,
                resultCount: results.length
            };

        } catch (error) {
            logger.error({
                query,
                searchType,
                error: error.message
            }, 'Company search failed');

            return {
                success: false,
                error: `Company search failed: ${error.message}`
            };
        }
    }

    /**
     * Validate CIF format and clean it
     * @private
     */
    _validateCifFormat(cif) {
        if (!cif || typeof cif !== 'string') {
            return {
                isValid: false,
                error: 'CIF is required and must be a string'
            };
        }

        // Remove spaces and convert to uppercase
        const cleanCif = cif.trim().toUpperCase();

        // Check if it starts with RO (remove if present)
        const cifWithoutRO = cleanCif.startsWith('RO') ? cleanCif.substring(2) : cleanCif;

        // Validate format: should be 2-10 digits
        if (!/^\d{2,10}$/.test(cifWithoutRO)) {
            return {
                isValid: false,
                error: 'CIF must contain 2-10 digits (optionally prefixed with RO)'
            };
        }

        return {
            isValid: true,
            cleanCif: cifWithoutRO
        };
    }

    /**
     * Check if company is active for VAT purposes
     * @private
     */
    _isCompanyActive(anafData) {
        // Check VAT status from the ANAF response structure
        const vatInfo = anafData.inregistrare_scop_Tva || {};
        const inactive = anafData.stare_inactiv || {};

        // Company is active if it has active VAT status and is not inactive
        return vatInfo.scpTVA === true && inactive.statusInactivi !== true;
    }

    /**
     * Extract and format company information from ANAF data
     * @private
     */
    _extractCompanyInfo(anafData, cif) {
        const general = anafData.date_generale || {};
        const vatInfo = anafData.inregistrare_scop_Tva || {};
        const inactive = anafData.stare_inactiv || {};
        const fiscalAddress = anafData.adresa_domiciliu_fiscal || {};

        // Build formatted address
        const addressParts = [
            fiscalAddress.ddenumire_Strada,
            fiscalAddress.dnumar_Strada,
            fiscalAddress.ddenumire_Localitate,
            fiscalAddress.ddenumire_Judet,
            fiscalAddress.dcod_Postal
        ].filter(Boolean);

        const formattedAddress = addressParts.length > 0
            ? addressParts.join(', ')
            : general.adresa || '';

        return {
            name: general.denumire || 'Unknown Company',
            cif: cif,
            registrationNumber: general.nrRegCom || '',
            address: formattedAddress,
            addressComponents: {
                street: fiscalAddress.ddenumire_Strada || '',
                number: fiscalAddress.dnumar_Strada || '',
                locality: fiscalAddress.ddenumire_Localitate || '',
                county: fiscalAddress.ddenumire_Judet || '',
                postalCode: fiscalAddress.dcod_Postal || general.codPostal || '',
                country: 'România'
            },
            isActive: this._isCompanyActive(anafData),
            vatActive: vatInfo.scpTVA === true,
            status: inactive.statusInactivi === true ? 'INACTIVE' : 'ACTIVE',
            registrationDate: general.data_inregistrare || null,
            lastUpdate: null,
            activityCodes: general.cod_CAEN ? [general.cod_CAEN] : [],
            phone: general.telefon || '',
            email: ''
        };
    }

    /**
     * Detect search type based on query content
     * @private
     */
    _detectSearchType(query) {
        const cleanQuery = query.trim().toUpperCase();
        
        // Remove RO prefix if present
        const withoutRO = cleanQuery.startsWith('RO') ? cleanQuery.substring(2) : cleanQuery;
        
        // If it's all digits, it's likely a CIF
        if (/^\d+$/.test(withoutRO)) {
            return 'cif';
        }
        
        // Otherwise, assume it's a name search
        return 'name';
    }

    /**
     * Check if error is retryable
     * @private
     */
    _isRetryableError(error) {
        // Network errors and temporary server issues are retryable
        if (!error.response) return true;
        
        const status = error.response?.status;
        return status >= 500 || status === 429 || status === 503;
    }

    /**
     * Enrich order client data with ANAF information
     * @param {Object} clientData - Basic client data from order
     * @param {string} cif - Company CIF to validate
     * @returns {Promise<Object>} Enriched client data
     */
    async enrichClientData(clientData, cif) {
        try {
            const validation = await this.execute({ cif });
            
            if (!validation.success) {
                logger.warn({ cif, error: validation.error }, 'Failed to enrich client data with ANAF');
                return clientData; // Return original data if validation fails
            }

            // Merge ANAF data with existing client data
            const enrichedData = {
                ...clientData,
                name: validation.company.name || clientData.name,
                cif: validation.cif,
                rc: validation.company.registrationNumber,
                address: validation.company.address || clientData.address,
                state: validation.company.addressComponents.county || clientData.state,
                city: validation.company.addressComponents.locality || clientData.city,
                country: 'România',
                anafValidated: true,
                anafValidatedAt: validation.validatedAt,
                isActive: validation.company.isActive
            };

            logger.info({ 
                cif, 
                originalName: clientData.name,
                anafName: validation.company.name 
            }, 'Client data enriched with ANAF information');

            return enrichedData;

        } catch (error) {
            logger.error({
                cif,
                error: error.message
            }, 'Failed to enrich client data with ANAF');

            return clientData; // Return original data on error
        }
    }
}

export default ValidateCompanyAction;
