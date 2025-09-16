import {
  reactExtension,
  useApi,
  AdminPrintAction,
  Banner,
  BlockStack,
  Text,
} from "@shopify/ui-extensions-react/admin";
import { useEffect, useState } from "react";

// The target used here must match the target used in the extension's toml file
const TARGET = "admin.order-details.print-action.render";

export default reactExtension(TARGET, () => <InvoicePrintApp />);

function InvoicePrintApp() {
  const { i18n, data } = useApi(TARGET);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extract order ID from the data
  const orderId = data.selected?.[0]?.id;

  useEffect(() => {
    const fetchInvoiceUrl = async () => {
      if (!orderId) {
        setError("No order selected");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Extract numeric order ID from GraphQL ID
        const numericOrderId = orderId.split('/').pop();
        
        // Make a request to your backend to get the invoice URL
        const response = await fetch(`/api/orders/${numericOrderId}/invoice-url`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.invoiceUrl) {
            setInvoiceUrl(data.invoiceUrl);
          } else {
            setError(i18n.translate('invoiceNotAvailable'));
          }
        } else {
          setError(i18n.translate('invoiceNotAvailable'));
        }
      } catch (err) {
        console.error('Error fetching invoice URL:', err);
        setError(i18n.translate('invoiceNotAvailable'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoiceUrl();
  }, [orderId, i18n]);

  if (isLoading) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Text>Loading invoice...</Text>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  if (error || !invoiceUrl) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Banner tone="critical" title="Invoice Not Available">
            {error || i18n.translate('invoiceNotAvailable')}
          </Banner>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  return (
    <AdminPrintAction src={invoiceUrl}>
      <BlockStack blockGap="base">
        <Banner tone="info" title="Invoice Ready">
          Click the Print button to print the invoice for this order.
        </Banner>
        <Text fontWeight="bold">Invoice Document</Text>
        <Text>Order ID: {orderId.split('/').pop()}</Text>
      </BlockStack>
    </AdminPrintAction>
  );
}
