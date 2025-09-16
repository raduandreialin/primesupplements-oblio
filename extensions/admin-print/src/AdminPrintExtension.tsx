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
  
  // Document availability states
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [awbUrl, setAwbUrl] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null);
  const [awbNumber, setAwbNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Document selection states
  const [printInvoice, setPrintInvoice] = useState(false);
  const [printAwb, setPrintAwb] = useState(false);
  
  // Combined print URL
  const [printUrl, setPrintUrl] = useState<string | null>(null);

  // Extract order ID from the data
  const orderId = data.selected?.[0]?.id;

  useEffect(() => {
    const fetchDocumentUrls = async () => {
      if (!orderId) {
        setError("No order selected");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Extract numeric order ID from GraphQL ID
        const numericOrderId = orderId.split('/').pop();
        
        // Fetch both invoice and AWB URLs in parallel from Railway backend
        const backendUrl = 'https://primesupplements-oblio-production.up.railway.app';
        const [invoiceResponse, awbResponse] = await Promise.allSettled([
          fetch(`${backendUrl}/api/orders/${numericOrderId}/invoice-url`),
          fetch(`${backendUrl}/api/orders/${numericOrderId}/awb-url`)
        ]);
        
        // Handle invoice response
        if (invoiceResponse.status === 'fulfilled' && invoiceResponse.value.ok) {
          const invoiceData = await invoiceResponse.value.json();
          console.log('Invoice response:', invoiceData);
          if (invoiceData.invoiceUrl) {
            setInvoiceUrl(invoiceData.invoiceUrl);
            setInvoiceNumber(invoiceData.invoiceNumber);
            setPrintInvoice(true); // Auto-select first available
          }
        } else if (invoiceResponse.status === 'fulfilled') {
          console.log('Invoice request failed:', invoiceResponse.value.status, await invoiceResponse.value.text());
        } else {
          console.log('Invoice request rejected:', invoiceResponse.reason);
        }
        
        // Handle AWB response
        if (awbResponse.status === 'fulfilled' && awbResponse.value.ok) {
          const awbData = await awbResponse.value.json();
          console.log('AWB response:', awbData);
          if (awbData.awbUrl) {
            // Convert relative URL to full URL if needed
            let fullAwbUrl = awbData.awbUrl;
            if (fullAwbUrl.startsWith('/api/')) {
              fullAwbUrl = `${backendUrl}${fullAwbUrl}`;
            }
            setAwbUrl(fullAwbUrl);
            setAwbNumber(awbData.awbNumber);
            // Only auto-select AWB if invoice is not available
            if (!invoiceUrl) {
              setPrintAwb(true);
            }
          }
        } else if (awbResponse.status === 'fulfilled') {
          console.log('AWB request failed:', awbResponse.value.status, await awbResponse.value.text());
        } else {
          console.log('AWB request rejected:', awbResponse.reason);
        }
        
      } catch (err) {
        console.error('Error fetching document URLs:', err);
        setError('Failed to load documents');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocumentUrls();
  }, [orderId, i18n]);

  // Update print URL when selections change
  useEffect(() => {
    if (printInvoice && invoiceUrl) {
      // Invoice selected
      setPrintUrl(invoiceUrl);
    } else if (printAwb && awbUrl) {
      // AWB selected
      setPrintUrl(awbUrl);
    } else {
      // Nothing selected
      setPrintUrl(null);
    }
  }, [printInvoice, printAwb, invoiceUrl, awbUrl]);

  if (isLoading) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Text>Loading documents...</Text>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  if (error || (!invoiceUrl && !awbUrl)) {
    return (
      <AdminPrintAction src={null}>
        <BlockStack blockGap="base">
          <Banner tone="critical" title="No Documents Available">
            {error || i18n.translate('noDocuments')}
          </Banner>
        </BlockStack>
      </AdminPrintAction>
    );
  }

  return (
    <AdminPrintAction src={printUrl}>
      <BlockStack blockGap="base">
        <Banner tone="info" title={i18n.translate('warningTitle')}>
          {i18n.translate('warningBody')}
        </Banner>
        
        <Text fontWeight="bold">{i18n.translate('documents')}</Text>
        
        {invoiceUrl && (
          <Checkbox
            name="print-invoice"
            checked={printInvoice}
            onChange={(value) => {
              setPrintInvoice(value);
              if (value) setPrintAwb(false); // Only one can be selected
            }}
          >
            {i18n.translate('invoice')} {invoiceNumber && `(#${invoiceNumber})`}
          </Checkbox>
        )}
        
        {awbUrl && (
          <Checkbox
            name="print-awb"
            checked={printAwb}
            onChange={(value) => {
              setPrintAwb(value);
              if (value) setPrintInvoice(false); // Only one can be selected
            }}
          >
            {i18n.translate('awb')} {awbNumber && `(#${awbNumber})`}
          </Checkbox>
        )}
        
        {!invoiceUrl && (
          <Text>{i18n.translate('invoiceNotAvailable')}</Text>
        )}
        
        {!awbUrl && (
          <Text>{i18n.translate('awbNotAvailable')}</Text>
        )}
        
        <Text>Order ID: {orderId.split('/').pop()}</Text>
      </BlockStack>
    </AdminPrintAction>
  );
}
