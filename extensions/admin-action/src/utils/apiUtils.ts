/**
 * API communication and error handling utilities
 */

/**
 * Enhanced error handling for API responses
 */
export const handleApiError = (error: any): string => {
  let userFriendlyMessage = error.message;
  
  // Handle common network errors
  if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
    userFriendlyMessage = 'Network error: Cannot reach the server. Please check your internet connection.';
  } else if (error.message.includes('timeout')) {
    userFriendlyMessage = 'Request timeout: The server is taking too long to respond.';
  } else if (error.message.includes('CORS')) {
    userFriendlyMessage = 'CORS error: Cross-origin request blocked.';
  } else if (error.message.includes('HTTP 401')) {
    userFriendlyMessage = 'Authentication error: Invalid credentials.';
  } else if (error.message.includes('HTTP 403')) {
    userFriendlyMessage = 'Permission error: Access denied.';
  } else if (error.message.includes('HTTP 404')) {
    userFriendlyMessage = 'Endpoint not found: The fulfillment service is not available.';
  } else if (error.message.includes('HTTP 500')) {
    userFriendlyMessage = 'Server error: Internal server error occurred.';
  }
  
  return userFriendlyMessage;
};

/**
 * Parse error response from API
 */
export const parseErrorResponse = async (response: Response): Promise<string> => {
  let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
  
  try {
    const errorData = await response.json();
    console.log('Error response data:', errorData);
    
    if (errorData.error) {
      errorMessage = errorData.error;
    } else if (errorData.details) {
      errorMessage = errorData.details;
    } else if (errorData.message) {
      errorMessage = errorData.message;
    }
  } catch (jsonError) {
    console.log('Could not parse error response as JSON');
    // Use the original statusText if JSON parsing fails
  }
  
  return errorMessage;
};

/**
 * Make API request with enhanced error handling
 */
export const makeApiRequest = async (url: string, options: RequestInit): Promise<any> => {
  console.log('Making API request to:', url);
  console.log('Request options:', options);

  const response = await fetch(url, options);
  console.log('Response status:', response.status, response.statusText);

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(errorMessage);
  }

  const result = await response.json();
  console.log('Success response:', result);
  
  return result;
};
