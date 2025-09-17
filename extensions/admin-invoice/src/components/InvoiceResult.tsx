import {
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Button,
  Section
} from '@shopify/ui-extensions-react/admin';

import {
  type InvoiceResult,
  formatCurrency
} from '../utils/invoiceUtils';

import {
  formatApiErrorForDisplay
} from '../utils/apiUtils';

interface InvoiceResultProps {
  result: InvoiceResult | null;
  onViewInvoice?: (url: string) => void;
  onRetry?: () => void;
  onClose?: () => void;
  showRetryButton?: boolean;
}

export function InvoiceResultDisplay({ 
  result, 
  onViewInvoice,
  onRetry,
  onClose,
  showRetryButton = true
}: InvoiceResultProps) {
  if (!result) {
    return null;
  }

  // Success State
  if (result.success && result.invoice) {
    return (
      <Section>
        <Banner tone="success">
          <BlockStack gap="base">
            <Text fontWeight="bold">Invoice Created Successfully! 🎉</Text>
            
            {/* Invoice Details */}
            <BlockStack gap="small">
              <InlineStack gap="base">
                <Text fontWeight="bold">Invoice #:</Text>
                <Text>{result.invoice.number}</Text>
              </InlineStack>
              
              <InlineStack gap="base">
                <Text fontWeight="bold">Series:</Text>
                <Text>{result.invoice.series}</Text>
              </InlineStack>
              
              <InlineStack gap="base">
                <Text fontWeight="bold">Total:</Text>
                <Text>{formatCurrency(result.invoice.total, result.invoice.currency)}</Text>
              </InlineStack>
              
              <InlineStack gap="base">
                <Text fontWeight="bold">Client:</Text>
                <Text>{result.invoice.clientName}</Text>
              </InlineStack>
              
              {result.invoice.clientCif && (
                <InlineStack gap="base">
                  <Text fontWeight="bold">CIF:</Text>
                  <Text>{result.invoice.clientCif}</Text>
                </InlineStack>
              )}
              
              <InlineStack gap="base">
                <Text fontWeight="bold">Issue Date:</Text>
                <Text>{result.invoice.issueDate}</Text>
              </InlineStack>
            </BlockStack>

            {/* Actions */}
            <InlineStack gap="small">
              {result.invoice.url && onViewInvoice && (
                <Button 
                  onPress={() => onViewInvoice(result.invoice!.url)} 
                  variant="primary"
                 
                >
                  View Invoice
                </Button>
              )}
              
              {onClose && (
                <Button onPress={onClose} variant="secondary" >
                  Done
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Banner>
      </Section>
    );
  }

  // Error State
  if (!result.success) {
    const errorInfo = formatApiErrorForDisplay(result);
    
    return (
      <Section>
        <Banner tone="critical">
          <BlockStack gap="base">
            <Text fontWeight="bold">{errorInfo.title}</Text>
            <Text>{errorInfo.message}</Text>
            
            {/* Error Details */}
            {result.details && typeof result.details === 'object' && (
              <BlockStack gap="small">
                <Text fontWeight="bold">Details:</Text>
                {Object.entries(result.details).map(([key, value]) => (
                  <Text key={key}>{key}: {String(value)}</Text>
                ))}
              </BlockStack>
            )}
            
            {/* Suggestions */}
            {errorInfo.suggestions && errorInfo.suggestions.length > 0 && (
              <BlockStack gap="small">
                <Text fontWeight="bold">Suggestions:</Text>
                {errorInfo.suggestions.map((suggestion, index) => (
                  <Text key={index}>• {suggestion}</Text>
                ))}
              </BlockStack>
            )}
            
            {/* Actions */}
            <InlineStack gap="small">
              {showRetryButton && errorInfo.retryable && onRetry && (
                <Button onPress={onRetry} variant="primary" >
                  Retry
                </Button>
              )}
              
              {onClose && (
                <Button onPress={onClose} variant="secondary" >
                  Close
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Banner>
      </Section>
    );
  }

  return null;
}
