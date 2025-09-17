import {useState, useEffect} from 'react';
import {
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Text,
  Banner,
  Badge,
  Section
} from '@shopify/ui-extensions-react/admin';

import {
  validateCifFormat,
  formatCifForDisplay,
  getValidationStatusBadge,
  getValidationErrorMessage,
  getValidationSuggestions,
  debounce,
  type CompanyValidationResult
} from '../utils/anafUtils';

import {
  validateCompanyRequest,
  handleApiError
} from '../utils/apiUtils';

interface CompanyLookupProps {
  initialCif?: string;
  onValidationResult: (result: CompanyValidationResult | null) => void;
  onClientDataChange: (clientData: any) => void;
  disabled?: boolean;
}

export function CompanyLookup({ 
  initialCif = '', 
  onValidationResult, 
  onClientDataChange,
  disabled = false 
}: CompanyLookupProps) {
  const [cif, setCif] = useState(initialCif);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<CompanyValidationResult | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounced validation function
  const debouncedValidation = debounce(async (cifValue: string) => {
    if (!cifValue.trim()) {
      setValidationResult(null);
      onValidationResult(null);
      return;
    }

    // First check format
    const formatValidation = validateCifFormat(cifValue);
    if (!formatValidation.isValid) {
      const result: CompanyValidationResult = {
        success: false,
        error: formatValidation.error,
        errorType: 'INVALID_FORMAT'
      };
      setValidationResult(result);
      onValidationResult(result);
      return;
    }

    // Validate with ANAF
    setIsValidating(true);
    try {
      const response = await validateCompanyRequest({
        cif: cifValue,
        includeInactiveCompanies: true
      });

      const result = response.data || response;
      setValidationResult(result);
      onValidationResult(result);

      // If successful, update client data
      if (result.success && result.company) {
        const clientData = {
          name: result.company.name,
          cif: result.cif,
          rc: result.company.registrationNumber,
          address: result.company.address,
          state: result.company.addressComponents?.county || '',
          city: result.company.addressComponents?.locality || '',
          country: 'România',
          email: result.company.email || '',
          phone: result.company.phone || '',
          contact: result.company.name
        };
        onClientDataChange(clientData);
      }

    } catch (error) {
      const result: CompanyValidationResult = {
        success: false,
        error: handleApiError(error),
        errorType: 'API_ERROR',
        retryable: true
      };
      setValidationResult(result);
      onValidationResult(result);
    } finally {
      setIsValidating(false);
    }
  }, 1000);

  // Handle CIF input change
  const handleCifChange = (value: string) => {
    setCif(value);
    debouncedValidation(value);
  };

  // Manual validation trigger
  const handleManualValidation = () => {
    if (cif.trim()) {
      debouncedValidation(cif);
    }
  };

  // Toggle suggestions
  const toggleSuggestions = () => {
    setShowSuggestions(!showSuggestions);
  };

  useEffect(() => {
    if (initialCif && initialCif !== cif) {
      setCif(initialCif);
      debouncedValidation(initialCif);
    }
  }, [initialCif]);

  const statusBadge = getValidationStatusBadge(validationResult);
  const errorMessage = validationResult ? getValidationErrorMessage(validationResult) : '';
  const suggestions = validationResult ? getValidationSuggestions(validationResult) : [];

  return (
    <Section>
      <BlockStack gap="small">
        <Text fontWeight="bold">Company Validation (ANAF)</Text>
        
        {/* CIF Input */}
        <InlineStack gap="small" blockAlignment="center">
          <TextField
            label="CIF"
            value={cif}
            onChange={handleCifChange}
            placeholder="Enter Romanian CIF (e.g., 12345678 or RO12345678)"
            disabled={disabled || isValidating}
          />
          
          {/* Validation Status Badge */}
          {validationResult && (
            <Badge tone={statusBadge.tone}>
              {statusBadge.text}
            </Badge>
          )}
          
          {/* Manual Validation Button */}
          {cif && !isValidating && (
            <Button
              onPress={handleManualValidation}
              variant="secondary"
              disabled={disabled}
            >
              Validate
            </Button>
          )}
        </InlineStack>

        {/* Loading State */}
        {isValidating && (
          <Banner>
            <Text>Validating company with ANAF...</Text>
          </Banner>
        )}

        {/* Success State */}
        {validationResult?.success && validationResult.company && (
          <Banner tone="success">
            <BlockStack gap="small">
              <Text fontWeight="bold">Company Found</Text>
              <Text>{validationResult.company.name}</Text>
              <Text>CIF: {formatCifForDisplay(validationResult.cif || cif)}</Text>
              <Text>Status: {validationResult.company.isActive ? 'Active' : 'Inactive'}</Text>
              {validationResult.company.address && (
                <Text>Address: {validationResult.company.address}</Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Error State */}
        {validationResult && !validationResult.success && errorMessage && (
          <Banner tone="critical">
            <BlockStack gap="small">
              <Text fontWeight="bold">Validation Failed</Text>
              <Text>{errorMessage}</Text>
              
              {/* Show suggestions */}
              {suggestions.length > 0 && (
                <BlockStack gap="small">
                  <Button 
                    onPress={toggleSuggestions}  
                  >
                    {showSuggestions ? 'Hide' : 'Show'} suggestions
                  </Button>
                  
                  {showSuggestions && (
                    <BlockStack gap="small">
                      {suggestions.map((suggestion, index) => (
                        <Text key={index}>• {suggestion}</Text>
                      ))}
                    </BlockStack>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Information Banner */}
        {!cif && (
          <Banner>
            <Text>
              Enter a Romanian CIF to validate the company with ANAF and auto-fill company details.
              This is optional for B2C invoices.
            </Text>
          </Banner>
        )}
      </BlockStack>
    </Section>
  );
}
