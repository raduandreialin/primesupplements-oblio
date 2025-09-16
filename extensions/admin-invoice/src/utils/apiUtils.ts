/**
 * API Utilities
 * 
 * Helper functions for API communication in the admin extension
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
  retryable?: boolean;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Get backend URL based on environment
 */
export function getBackendUrl(): string {
  // In production, use the Railway URL
  // In development, you might want to use localhost
  return 'https://primesupplements-oblio-production.up.railway.app';
}

/**
 * Get default headers for API requests
 */
export function getDefaultHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Shopify-Admin-Extension',
    'X-Shopify-Extension': 'invoice-generator'
  };
}

/**
 * Make API request with error handling and retries
 */
export async function makeApiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 30000,
    retries = 2,
    retryDelay = 1000
  } = options;

  const url = endpoint.startsWith('http') ? endpoint : `${getBackendUrl()}${endpoint}`;
  const requestHeaders = { ...getDefaultHeaders(), ...headers };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Parse response
      let responseData: any;
      try {
        responseData = await response.json();
      } catch (parseError) {
        responseData = { 
          success: false, 
          error: 'Invalid response format',
          details: await response.text()
        };
      }

      // Handle HTTP errors
      if (!response.ok) {
        return {
          success: false,
          error: responseData.error || `HTTP ${response.status}: ${response.statusText}`,
          details: responseData.details,
          retryable: isRetryableStatus(response.status)
        };
      }

      // Return successful response
      return {
        success: true,
        data: responseData,
        ...responseData // Spread to include success, error, etc. from backend
      };

    } catch (error: any) {
      lastError = error;

      // Check if we should retry
      if (attempt < retries && isRetryableError(error)) {
        console.warn(`API request failed (attempt ${attempt + 1}/${retries + 1}):`, error.message);
        await sleep(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        continue;
      }

      break;
    }
  }

  // All retries failed
  return {
    success: false,
    error: lastError?.message || 'Request failed',
    details: lastError,
    retryable: lastError ? isRetryableError(lastError) : true
  };
}

/**
 * Check if HTTP status is retryable
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors
  if (message.includes('network') || 
      message.includes('fetch') || 
      message.includes('timeout') ||
      message.includes('abort')) {
    return true;
  }

  // Specific error types
  if (error.name === 'AbortError' || 
      error.name === 'TimeoutError' ||
      error.name === 'NetworkError') {
    return true;
  }

  return false;
}

/**
 * Sleep utility for retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Handle API errors with user-friendly messages
 */
export function handleApiError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error?.message) {
    // Network errors
    if (error.message.includes('fetch')) {
      return 'Network connection failed. Please check your internet connection.';
    }
    
    if (error.message.includes('timeout') || error.message.includes('abort')) {
      return 'Request timed out. Please try again.';
    }

    return error.message;
  }

  if (error?.error) {
    return error.error;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Create invoice API request
 */
export async function createInvoiceRequest(payload: {
  orderId: string;
  orderData: any;
  invoiceOptions?: any;
  customClient?: any;
  validateCompany?: boolean;
  skipAnaf?: boolean;
}): Promise<ApiResponse> {
  return makeApiRequest('/invoice/create', {
    method: 'POST',
    body: payload,
    timeout: 45000 // Longer timeout for invoice creation
  });
}

/**
 * Retry invoice API request
 */
export async function retryInvoiceRequest(payload: {
  orderId: string;
  orderData: any;
  retryOptions?: any;
}): Promise<ApiResponse> {
  return makeApiRequest('/invoice/retry', {
    method: 'POST',
    body: payload,
    timeout: 45000
  });
}

/**
 * Get invoice status API request
 */
export async function getInvoiceStatusRequest(orderId: string): Promise<ApiResponse> {
  return makeApiRequest(`/invoice/status/${orderId}`, {
    method: 'GET',
    timeout: 10000
  });
}

/**
 * Validate company with ANAF API request
 */
export async function validateCompanyRequest(payload: {
  cif: string;
  includeInactiveCompanies?: boolean;
}): Promise<ApiResponse> {
  return makeApiRequest('/invoice/anaf/validate', {
    method: 'POST',
    body: payload,
    timeout: 15000
  });
}

/**
 * Get invoice configuration API request
 */
export async function getInvoiceConfigRequest(): Promise<ApiResponse> {
  return makeApiRequest('/invoice/config', {
    method: 'GET',
    timeout: 10000
  });
}

/**
 * Search companies API request (future feature)
 */
export async function searchCompaniesRequest(payload: {
  query: string;
  searchType?: 'cif' | 'name' | 'auto';
  limit?: number;
}): Promise<ApiResponse> {
  return makeApiRequest('/invoice/anaf/search', {
    method: 'POST',
    body: payload,
    timeout: 15000
  });
}

/**
 * Health check API request
 */
export async function healthCheckRequest(): Promise<ApiResponse> {
  return makeApiRequest('/invoice/health', {
    method: 'GET',
    timeout: 5000,
    retries: 0 // No retries for health check
  });
}

/**
 * Format API error for display
 */
export function formatApiErrorForDisplay(error: any): {
  title: string;
  message: string;
  suggestions?: string[];
  retryable: boolean;
} {
  const retryable = error?.retryable !== false;

  if (error?.error?.includes('Order ID')) {
    return {
      title: 'Invalid Order',
      message: 'The selected order could not be processed.',
      suggestions: ['Please refresh the page and try again'],
      retryable: false
    };
  }

  if (error?.error?.includes('ANAF')) {
    return {
      title: 'Company Validation Failed',
      message: error.error,
      suggestions: [
        'You can proceed without company validation',
        'Check the CIF number and try again'
      ],
      retryable: true
    };
  }

  if (error?.error?.includes('network') || error?.error?.includes('timeout')) {
    return {
      title: 'Connection Error',
      message: 'Unable to connect to the invoice service.',
      suggestions: [
        'Check your internet connection',
        'Try again in a few moments'
      ],
      retryable: true
    };
  }

  if (error?.error?.includes('Oblio')) {
    return {
      title: 'Invoice Service Error',
      message: error.error,
      suggestions: [
        'This might be a temporary issue',
        'Contact support if the problem persists'
      ],
      retryable: true
    };
  }

  return {
    title: 'Invoice Error',
    message: handleApiError(error),
    suggestions: retryable ? ['Please try again'] : undefined,
    retryable
  };
}

/**
 * Log API request for debugging
 */
export function logApiRequest(endpoint: string, options: ApiRequestOptions, response: ApiResponse): void {
  if (process.env.NODE_ENV === 'development') {
    console.group(`API Request: ${options.method || 'GET'} ${endpoint}`);
    console.log('Options:', options);
    console.log('Response:', response);
    console.groupEnd();
  }
}
