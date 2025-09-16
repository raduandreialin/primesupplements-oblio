import {
  reactExtension,
  useApi,
  AdminPrintAction,
  Banner,
  BlockStack,
  Checkbox,
  Text,
} from "@shopify/ui-extensions-react/admin";
import { useEffect, useState } from "react";

// The target used here must match the target used in the extension's toml file
const TARGET = "admin.order-details.print-action.render";

export default reactExtension(TARGET, () => <AdminPrintApp />);

function AdminPrintApp() {
  const { i18n, data } = useApi(TARGET);
  
  // AWB document states
  const [awbUrl, setAwbUrl] = useState<string | null>(null);
  const [awbNumber, setAwbNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        
        // Fetch AWB URL from Railway backend
        const backendUrl = 'https://primesupplements-oblio-production.up.railway.app';
        const awbResponse = await fetch(`${backendUrl}/api/orders/${numericOrderId}/awb-url`);
        
        if (awbResponse.ok) {
          const awbData = await awbResponse.json();
          console.log('AWB response:', awbData);
          if (awbData.awbUrl) {
            // Convert relative URL to full URL if needed
            let fullAwbUrl = awbData.awbUrl;
            if (fullAwbUrl.startsWith('/api/')) {
              fullAwbUrl = `${backendUrl}${fullAwbUrl}`;
            }
            setAwbUrl(fullAwbUrl);
            setAwbNumber(awbData.awbNumber);
          }
        } else {
          console.log('AWB request failed:', awbResponse.status, await awbResponse.text());
          setError('AWB not found for this order');
        }
        
      } catch (err) {
        console.error('Error fetching AWB URL:', err);
        setError('Failed to load AWB');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAwbUrl();
  }, [orderId]);


  if (isLoading) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Text>Loading documents...</Text>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  if (error || !awbUrl) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Banner tone="critical" title="AWB Not Available">
            {error || 'No shipping label (AWB) found for this order'}
          </Banner>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  return (
    <AdminPrintAction src={awbUrl}>
      <BlockStack blockGap="base">
        <Banner tone="info" title="Print Shipping Label">
          Ready to print AWB shipping label
        </Banner>
        
        <Text fontWeight="bold">Shipping Label (AWB)</Text>
        <Text>Courier Company: Cargus</Text>
        <Text>AWB Number: {awbNumber}</Text>
      </BlockStack>
    </AdminPrintAction>
  );
}
