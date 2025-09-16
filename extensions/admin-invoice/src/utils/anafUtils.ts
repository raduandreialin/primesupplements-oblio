/**
 * ANAF Utilities
 * 
 * Helper functions for ANAF company validation in the admin extension
 */

export interface CompanyValidationResult {
  success: boolean;
  cif?: string;
  company?: {
    name: string;
    cif: string;
    registrationNumber: string;
    address: string;
    addressComponents: {
      street: string;
      number: string;
      locality: string;
      county: string;
      postalCode: string;
      country: string;
    };
    isActive: boolean;
    vatActive: boolean;
    status: string;
    registrationDate?: string;
    lastUpdate?: string;
    activityCodes: any[];
    phone: string;
    email: string;
  };
  error?: string;
  errorType?: 'INVALID_FORMAT' | 'NOT_FOUND' | 'INACTIVE' | 'API_ERROR';
  companyData?: any;
  validatedAt?: string;
  retryable?: boolean;
}

/**
 * Validate CIF format
 */
export function validateCifFormat(cif: string): { isValid: boolean; cleanCif?: string; error?: string } {
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
 * Format CIF for display
 */
export function formatCifForDisplay(cif: string): string {
  const validation = validateCifFormat(cif);
  if (!validation.isValid || !validation.cleanCif) {
    return cif;
  }
  
  return `RO${validation.cleanCif}`;
}

/**
 * Extract CIF from various text formats
 */
export function extractCifFromText(text: string): string | null {
  if (!text) return null;

  // Try different CIF patterns
  const patterns = [
    /CIF:?\s*(RO)?(\d{2,10})/i,
    /C\.I\.F\.?:?\s*(RO)?(\d{2,10})/i,
    /\b(RO)?(\d{8,10})\b/,
    /cod\s+fiscal:?\s*(RO)?(\d{2,10})/i,
    /fiscal\s+code:?\s*(RO)?(\d{2,10})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Return the numeric part (group 2)
      return match[2];
    }
  }

  return null;
}

/**
 * Get company validation status badge
 */
export function getValidationStatusBadge(result: CompanyValidationResult | null) {
  if (!result) {
    return {
      tone: 'info' as const,
      text: 'Not validated',
      icon: 'QuestionMarkCircle'
    };
  }

  if (!result.success) {
    switch (result.errorType) {
      case 'INVALID_FORMAT':
        return {
          tone: 'critical' as const,
          text: 'Invalid CIF format',
          icon: 'AlertCircle'
        };
      case 'NOT_FOUND':
        return {
          tone: 'warning' as const,
          text: 'Company not found',
          icon: 'SearchMinor'
        };
      case 'INACTIVE':
        return {
          tone: 'warning' as const,
          text: 'Company inactive',
          icon: 'PauseCircle'
        };
      case 'API_ERROR':
        return {
          tone: 'critical' as const,
          text: 'Validation failed',
          icon: 'AlertCircle'
        };
      default:
        return {
          tone: 'critical' as const,
          text: 'Validation error',
          icon: 'AlertCircle'
        };
    }
  }

  if (result.company?.isActive) {
    return {
      tone: 'success' as const,
      text: 'Valid & Active',
      icon: 'CheckCircle'
    };
  } else {
    return {
      tone: 'warning' as const,
      text: 'Valid but Inactive',
      icon: 'AlertTriangle'
    };
  }
}

/**
 * Format company address for display
 */
export function formatCompanyAddress(company: CompanyValidationResult['company']): string {
  if (!company?.addressComponents) {
    return company?.address || 'Address not available';
  }

  const { street, number, locality, county, postalCode } = company.addressComponents;
  
  const parts = [
    street,
    number,
    locality,
    county,
    postalCode
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Get company display name
 */
export function getCompanyDisplayName(company: CompanyValidationResult['company']): string {
  if (!company) return 'Unknown Company';
  
  return company.name || 'Unknown Company';
}

/**
 * Check if company validation is retryable
 */
export function isValidationRetryable(result: CompanyValidationResult): boolean {
  return result.retryable === true || result.errorType === 'API_ERROR';
}

/**
 * Get validation error message for user
 */
export function getValidationErrorMessage(result: CompanyValidationResult): string {
  if (result.success) return '';

  switch (result.errorType) {
    case 'INVALID_FORMAT':
      return 'Please enter a valid Romanian CIF (8-10 digits, optionally prefixed with RO)';
    case 'NOT_FOUND':
      return 'Company not found in ANAF database. Please check the CIF number.';
    case 'INACTIVE':
      return 'Company is not active for VAT purposes. You can still create the invoice if needed.';
    case 'API_ERROR':
      return 'Unable to validate company at this time. You can proceed without validation.';
    default:
      return result.error || 'Company validation failed';
  }
}

/**
 * Get validation suggestions based on error
 */
export function getValidationSuggestions(result: CompanyValidationResult): string[] {
  if (result.success) return [];

  const suggestions: string[] = [];

  switch (result.errorType) {
    case 'INVALID_FORMAT':
      suggestions.push('Make sure the CIF contains only digits');
      suggestions.push('CIF should be 8-10 digits long');
      suggestions.push('You can include or omit the "RO" prefix');
      break;
    case 'NOT_FOUND':
      suggestions.push('Double-check the CIF number');
      suggestions.push('Try searching on anaf.ro to verify the CIF');
      suggestions.push('The company might not be registered for VAT');
      break;
    case 'INACTIVE':
      suggestions.push('Contact the company to verify their VAT status');
      suggestions.push('You can still create the invoice if needed');
      suggestions.push('Consider using a different invoice series');
      break;
    case 'API_ERROR':
      suggestions.push('Try again in a few moments');
      suggestions.push('You can proceed without ANAF validation');
      suggestions.push('Manual validation can be done later');
      break;
  }

  return suggestions;
}

/**
 * Debounce function for CIF input validation
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
}

/**
 * Create ANAF validation payload
 */
export function createValidationPayload(cif: string, options: {
  includeInactiveCompanies?: boolean;
} = {}): any {
  const validation = validateCifFormat(cif);
  
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  return {
    cif: validation.cleanCif,
    includeInactiveCompanies: options.includeInactiveCompanies || false
  };
}

/**
 * Parse ANAF validation response
 */
export function parseValidationResponse(response: any): CompanyValidationResult {
  if (!response) {
    return {
      success: false,
      error: 'No response received',
      errorType: 'API_ERROR'
    };
  }

  if (!response.success) {
    return {
      success: false,
      error: response.error,
      errorType: response.errorType as any,
      retryable: response.retryable
    };
  }

  return response as CompanyValidationResult;
}

/**
 * Get Romanian counties list for validation
 */
export function getRomanianCounties(): string[] {
  return [
    'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov',
    'Brăila', 'București', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
    'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara',
    'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt',
    'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea',
    'Vaslui', 'Vâlcea', 'Vrancea'
  ];
}

/**
 * Normalize Romanian county name
 */
export function normalizeRomanianCounty(county: string): string {
  if (!county) return '';
  
  const normalized = county.trim();
  const counties = getRomanianCounties();
  
  // Try exact match first
  const exactMatch = counties.find(c => 
    c.toLowerCase() === normalized.toLowerCase()
  );
  
  if (exactMatch) return exactMatch;
  
  // Try partial match
  const partialMatch = counties.find(c => 
    c.toLowerCase().includes(normalized.toLowerCase()) ||
    normalized.toLowerCase().includes(c.toLowerCase())
  );
  
  return partialMatch || normalized;
}
