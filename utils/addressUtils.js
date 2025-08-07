/**
 * Address utility functions for Romanian addresses
 * Handles special cases like Bucharest sectors
 */

/**
 * Extract sector number from Bucharest address
 * @param {string} address - Address string to parse
 * @returns {string|null} - Sector number (e.g., "1", "2") or null if not found
 */
export function extractBucharestSector(address) {
    if (!address || typeof address !== 'string') {
        return null;
    }
    
    // Look for sector patterns in the address
    const sectorMatch = address.match(/sector\s*(\d)/i);
    return sectorMatch ? sectorMatch[1] : null;
}

/**
 * Format locality for Romanian addresses
 * Special handling for Bucharest (province code 'B') to extract sectors
 * @param {Object} address - Address object from order
 * @returns {string} - Formatted locality
 */
export function formatRomanianLocality(address) {
    if (!address) {
        return '';
    }
    
    const { province_code, city, address1 } = address;
    
    // Special handling for Bucharest (province code 'B')
    if (province_code === 'B') {
        const sector = extractBucharestSector(address1);
        return sector ? `SECTOR${sector}` : 'SECTOR2'; // Default to SECTOR2 if no sector found
    }
    
    // For other cities, return the city name
    return city || '';
}

/**
 * Format complete Romanian address for invoicing
 * @param {Object} address - Address object from order
 * @returns {Object} - Formatted address object
 */
export function formatRomanianAddress(address) {
    if (!address) {
        return {
            street: '',
            city: '',
            state: '',
            zip: '',
            country: 'România'
        };
    }
    
    return {
        street: address.address1 || '',
        city: formatRomanianLocality(address),
        state: address.province || address.province_code || '',
        zip: address.zip || '',
        country: address.country || 'România'
    };
}

/**
 * Check if address is in Bucharest
 * @param {Object} address - Address object from order
 * @returns {boolean} - True if address is in Bucharest
 */
export function isBucharestAddress(address) {
    if (!address) {
        return false;
    }
    
    return address.province_code === 'B' || 
           address.city?.toLowerCase().includes('bucuresti') ||
           address.city?.toLowerCase().includes('bucharest');
}

/**
 * Get all available sectors in Bucharest
 * @returns {Array<string>} - Array of sector numbers
 */
export function getBucharestSectors() {
    return ['1', '2', '3', '4', '5', '6'];
}

/**
 * Validate Bucharest sector number
 * @param {string} sector - Sector number to validate
 * @returns {boolean} - True if valid sector
 */
export function isValidBucharestSector(sector) {
    return getBucharestSectors().includes(sector?.toString());
}
