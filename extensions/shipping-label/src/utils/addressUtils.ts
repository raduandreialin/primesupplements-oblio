/**
 * Address validation and normalization utilities
 */

/**
 * Function to normalize Romanian county names
 * Converts diacritics and common variations to Cargus-compatible names
 */
export const normalizeRomanianCounty = (county: string): string => {
  if (!county) return '';
  
  const countyMappings: Record<string, string> = {
    'Brașov': 'Brasov',
    'Timișoara': 'Timis',
    'Bucharest': 'Bucuresti',
    'Cluj-Napoca': 'Cluj',
    'Târgu-Mureș': 'Mures',
    'Satu-Mare': 'Satu Mare',
    'Constanța': 'Constanta',
    'Iași': 'Iasi',
    'Galați': 'Galati',
    'Ploiești': 'Prahova',
  };
  
  return countyMappings[county] || county;
};

/**
 * Function to normalize Romanian city names
 * Removes diacritics and standardizes city names
 */
export const normalizeRomanianCity = (city: string): string => {
  if (!city) return '';
  
  const cityMappings: Record<string, string> = {
    'Brașov': 'Brasov',
    'Timișoara': 'Timisoara',
    'Iași': 'Iasi',
    'Târgu-Mureș': 'Targu-Mures',
    'Constanța': 'Constanta',
    'Craiova': 'Craiova',
    'Galați': 'Galati',
    'Ploiești': 'Ploiesti',
    'Cluj-Napoca': 'Cluj-Napoca',
    'Oradea': 'Oradea',
    'Arad': 'Arad',
    'Pitești': 'Pitesti',
  };
  
  return cityMappings[city] || city;
};

/**
 * Function to validate shipping address
 * Checks for required fields and returns validation result
 */
export const validateShippingAddress = (address: any) => {
  const requiredFields = ['firstName', 'lastName', 'address1', 'city', 'province', 'zip', 'country'];
  const missingFields: string[] = [];
  
  requiredFields.forEach(field => {
    if (!address[field] || address[field].trim() === '') {
      missingFields.push(field);
    }
  });
  
  return {
    isValid: missingFields.length === 0,
    missingFields: missingFields
  };
};

/**
 * Function to get field display name for validation errors
 */
export const getFieldDisplayName = (field: string): string => {
  const fieldNames: Record<string, string> = {
    firstName: 'First Name',
    lastName: 'Last Name',
    address1: 'Address Line 1',
    city: 'City',
    province: 'Province/State',
    zip: 'Postal Code',
    country: 'Country'
  };
  return fieldNames[field] || field;
};
