/**
 * Utility functions index
 * Centralized exports for all utility modules
 */

// CUI utilities
export { 
    extractCUIFromOrder, 
    isCompanyOrder, 
    getCompanyNameFromOrder 
} from './cuiUtils.js';

// ANAF utilities
export { 
    enrichClientWithAnafData, 
    transformOrderWithAnafEnrichment 
} from './anafUtils.js';

// Address utilities
export {
    extractBucharestSector,
    formatRomanianLocality,
    formatRomanianAddress,
    isBucharestAddress,
    getBucharestSectors,
    isValidBucharestSector
} from './addressUtils.js';

// Logger
export { default as logger } from './logger.js';
