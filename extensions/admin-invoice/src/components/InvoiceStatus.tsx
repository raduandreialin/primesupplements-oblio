import {
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Badge,
  Button,
  Section
} from '@shopify/ui-extensions-react/admin';

import {
  type InvoiceStatus,
  getInvoiceStatusBadge
} from '../utils/invoiceUtils';

interface InvoiceStatusProps {
  status: InvoiceStatus | null;
  loading?: boolean;
  onRetry?: () => void;
  onViewInvoice?: (url: string) => void;
  onRefreshStatus?: () => void;
}

export function InvoiceStatus({ 
  status, 
  loading = false, 
  onRetry,
  onViewInvoice,
  onRefreshStatus
}: InvoiceStatusProps) {
  if (loading) {
    return (
      <Section>
        <Banner>
          <Text>Checking invoice status...</Text>
        </Banner>
      </Section>
    );
  }

  if (!status) {
    return (
      <Section>
        <BlockStack gap="small">
          <Text fontWeight="bold">Invoice Status</Text>
          <Banner>
            <InlineStack gap="small" blockAlignment="center">
              <Text>Unable to check invoice status</Text>
              {onRefreshStatus && (
                <Button onPress={onRefreshStatus} variant='secondary' >
                  Retry
                </Button>
              )}
            </InlineStack>
          </Banner>
        </BlockStack>
      </Section>
    );
  }

  const statusBadge = getInvoiceStatusBadge(status);

  return (
    <Section>
      <BlockStack gap="small">
        <InlineStack gap="small" blockAlignment="center">
          <Text fontWeight="bold">Invoice for this order is already created</Text>
        </InlineStack>

        {/* Success State */}
        {status.hasInvoice && status.invoiceNumber && (
          <Banner tone="success">
            <BlockStack gap="small">
              <Text>Invoice #{status.invoiceNumber} exists for this order</Text>
              
              {status.invoiceUrl && onViewInvoice && (
                <InlineStack gap="small">
                  <Button 
                    onPress={() => onViewInvoice(status.invoiceUrl!)} 
                    variant="secondary"
                  >
                    View Invoice
                  </Button>
                </InlineStack>
              )}
              
              {/* Additional invoice info */}
              <BlockStack gap="small">
                <Text>Status: Invoiced</Text>
                {status.tags && status.tags.length > 0 && (
                  <Text>Tags: {status.tags.join(', ')}</Text>
                )}
              </BlockStack>
            </BlockStack>
          </Banner>
        )}

        {/* Error State */}
        {status.hasError && !status.hasInvoice && (
          <Banner tone="warning">
            <BlockStack gap="small">
              <Text fontWeight="bold">Previous Invoice Creation Failed</Text>
              <Text>
                The last attempt to create an invoice for this order failed. 
                You can retry with improved error handling.
              </Text>
              
              {onRetry && (
                <InlineStack gap="small">
                  <Button onPress={onRetry} variant="primary" >
                    Retry Invoice Creation
                  </Button>
                </InlineStack>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Not Invoiced State */}
        {!status.hasInvoice && !status.hasError && (
          <Banner>
            <BlockStack gap="small">
              <Text>No invoice found for this order</Text>
              <Text>You can generate an invoice using the form below.</Text>
            </BlockStack>
          </Banner>
        )}

        {/* Mixed State (has both invoice and error - should not happen but handle gracefully) */}
        {status.hasInvoice && status.hasError && (
          <Banner tone="info">
            <BlockStack gap="small">
              <Text>This order has an existing invoice but also shows error tags.</Text>
              <Text>The invoice may have been created after a retry.</Text>
              
              {status.invoiceUrl && onViewInvoice && (
                <Button 
                  onPress={() => onViewInvoice(status.invoiceUrl!)} 
                  variant="secondary"
                >
                  View Existing Invoice
                </Button>
              )}
            </BlockStack>
          </Banner>
        )}
      </BlockStack>
    </Section>
  );
}
