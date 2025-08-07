/**
 * CUI (Romanian Company Identifier) utility functions
 * Handles extraction and validation of Romanian company identifiers
 */

/**
 * Extract CUI from Shopify order billing address company field
 * @param {Object} order - Shopify order object
 * @returns {number|null} - Normalized CUI number or null if not found
 */
export function extractCUIFromOrder(order) {
    const company = order.billing_address?.company;
    
    if (company && typeof company === 'string') {
        // Look for CUI pattern in the company field
        const cuiMatch = company.match(/(?:CUI|CIF|RO)?\s*:?\s*([0-9]{2,10})/i);
        if (cuiMatch) {
            try {
                // Basic validation - ensure it's a valid number
                const cui = parseInt(cuiMatch[1], 10);
                if (isNaN(cui) || cui <= 0) {
                    console.log(`⚠️ Invalid CUI format in company field: ${cuiMatch[1]}`);
                    return null;
                }
                return cui;
            } catch (error) {
                console.log(`⚠️ Invalid CUI found in company field: ${cuiMatch[1]}`);
                return null;
            }
        }
    }

    return null;
}

/**
 * Check if an order contains company information (has CUI)
 * @param {Object} order - Shopify order object
 * @returns {boolean} - True if order contains company CUI
 */
export function isCompanyOrder(order) {
    return extractCUIFromOrder(order) !== null;
}

/**
 * Get company name from order (without CUI)
 * @param {Object} order - Shopify order object
 * @returns {string|null} - Company name without CUI or null
 */
export function getCompanyNameFromOrder(order) {
    const company = order.billing_address?.company;
    
    if (company && typeof company === 'string') {
        // Remove CUI pattern from company name
        return company.replace(/(?:CUI|CIF|RO)?\s*:?\s*([0-9]{2,10})/i, '').trim() || null;
    }
    
    return null;
}
