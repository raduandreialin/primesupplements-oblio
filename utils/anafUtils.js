import logger from './logger.js';
import { extractCUIFromOrder } from './cuiUtils.js';
/**
 * ANAF integration utility functions
 * Handles company data enrichment with ANAF verification
 */

/**
 * Enrich client data with ANAF company information
 * Only takes company name, registration number (J), and CUI from ANAF
 * Keeps customer's billing address as provided
 * 
 * @param {Object} client - Original client data from order
 * @param {number} cui - Company CUI to verify
 * @param {Object} anafService - ANAF service instance
 * @returns {Promise<Object>} - Enriched client data
 */
export async function enrichClientWithAnafData(client, cui, anafService) {
    try {
        logger.info({ cui }, 'Enriching client data with ANAF verification');
        
        const anafCompany = await anafService.getCompanyForOblio(cui);
        
        // Only take company name, registration number (J), and CUI from ANAF
        // Keep customer's billing address as provided
        return {
            ...client,
            name: anafCompany.name || client.name,
            // Oblio client fields
            cif: anafCompany.cif || (anafCompany.cui ? `RO${anafCompany.cui}` : client.cif),
            rc: anafCompany.regCom,
            // Keep original customer address string
            address: client.address,
            // Additional flags
            vatPayer: typeof anafCompany.vatPayer === 'boolean' ? anafCompany.vatPayer : client.vatPayer,
            anafVerified: true,
            anafVerificationDate: anafCompany.anafVerificationDate
        };
        
    } catch (error) {
        logger.warn({ cui, error: error.message }, 'ANAF enrichment failed');
        
        // Return original client data with CUI if verification fails
        return {
            ...client,
            cui: cui,
            anafVerified: false,
            anafError: error.message
        };
    }
}

/**
 * Transform Shopify order to Oblio invoice with ANAF company verification
 * @param {Object} order - Shopify order object
 * @param {Function} basicTransform - Basic transformation function
 * @param {Object} anafService - ANAF service instance
 * @returns {Promise<Object>} - Invoice data with ANAF enrichment
 */
export async function transformOrderWithAnafEnrichment(order, basicTransform, anafService) {
    // Start with basic transformation
    const basicInvoiceData = basicTransform(order);
    
    // Try to extract CUI from order
    const cui = extractCUIFromOrder(order);
    
    if (cui) {
        logger.info({ orderId: order.id, cui }, 'Company CUI detected in order');
        
        // Enrich client data with ANAF information
        basicInvoiceData.client = await enrichClientWithAnafData(
            basicInvoiceData.client, 
            cui, 
            anafService
        );
        
        logger.info({ name: basicInvoiceData.client.name }, 'Client data enriched with ANAF verification');
    } else {
        logger.info({ orderId: order.id }, 'No company CUI found in order, treating as individual customer');
    }
    
    return basicInvoiceData;
}
