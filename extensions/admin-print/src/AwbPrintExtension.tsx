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

export default reactExtension(TARGET, () => <AwbPrintApp />);

function AwbPrintApp() {
  const { i18n, data } = useApi(TARGET);
  const [awbUrl, setAwbUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awbNumber, setAwbNumber] = useState<string | null>(null);

  // Extract order ID from the data
  const orderId = data.selected?.[0]?.id;

  useEffect(() => {
    const fetchAwbUrl = async () => {
      if (!orderId) {
        setError("No order selected");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Extract numeric order ID from GraphQL ID
        const numericOrderId = orderId.split('/').pop();
        
        // Make a request to your backend to get the AWB URL
        const response = await fetch(`/api/orders/${numericOrderId}/awb-url`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.awbUrl && data.awbNumber) {
            setAwbUrl(data.awbUrl);
            setAwbNumber(data.awbNumber);
          } else {
            setError(i18n.translate('awbNotAvailable'));
          }
        } else {
          setError(i18n.translate('awbNotAvailable'));
        }
      } catch (err) {
        console.error('Error fetching AWB URL:', err);
        setError(i18n.translate('awbNotAvailable'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchAwbUrl();
  }, [orderId, i18n]);

  if (isLoading) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Text>Loading shipping label...</Text>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  if (error || !awbUrl) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Banner tone="critical" title="Shipping Label Not Available">
            {error || i18n.translate('awbNotAvailable')}
          </Banner>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  return (
    <AdminPrintAction src={awbUrl}>
      <BlockStack blockGap="base">
        <Banner tone="info" title="Shipping Label Ready">
          Click the Print button to print the shipping label (AWB) for this order.
        </Banner>
        <Text fontWeight="bold">Shipping Label (AWB)</Text>
        <Text>Order ID: {orderId.split('/').pop()}</Text>
        {awbNumber && <Text>AWB Number: {awbNumber}</Text>}
      </BlockStack>
    </AdminPrintAction>
  );
}
