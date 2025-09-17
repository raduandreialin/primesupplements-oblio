import {useEffect, useState} from 'react';
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Banner,
  Divider
} from '@shopify/ui-extensions-react/admin';

import { 
  CompanyLookup, 
  InvoiceForm, 
  InvoiceStatus, 
  InvoiceResultDisplay 
} from './components';

import {
  type InvoiceOptions,
  type CustomClient,
  type InvoiceStatus as IInvoiceStatus,
  type InvoiceResult,
  buildClientFromOrder,
  isB2BOrder,
  getOrderGraphQLQuery,
  extractCifFromCompany
} from './utils/invoiceUtils';

import {
  type CompanyValidationResult
} from './utils/anafUtils';

import {
  createInvoiceRequest,
  createInvoiceFromExtensionRequest,
  retryInvoiceRequest,
  getInvoiceStatusRequest,
  handleApiError
} from './utils/apiUtils';

// The target used here must match the target used in the extension's toml file
const TARGET = 'admin.order-details.action.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  // The useApi hook provides access to several useful APIs like i18n, close, and data.
  const {i18n, close, data} = useApi(TARGET);
  
  // State management
  const [orderInfo, setOrderInfo] = useState({ id: '', orderNumber: '', name: '' });
  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Invoice-related state
  const [invoiceStatus, setInvoiceStatus] = useState<IInvoiceStatus | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResult | null>(null);
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOptions>({});
  const [customClient, setCustomClient] = useState<CustomClient | null>(null);
  
  // Company validation state
  const [companyValidation, setCompanyValidation] = useState<CompanyValidationResult | null>(null);
  const [showCompanyLookup, setShowCompanyLookup] = useState(false);
  
  // UI state
  const [currentStep, setCurrentStep] = useState<'status' | 'form' | 'result'>('status');

  // Extract order information from the selected data provided by Shopify
  useEffect(() => {
    if (data.selected && data.selected.length > 0) {
      const selectedOrder = data.selected[0];
      
      // We'll get the actual order number from the GraphQL query, 
      // for now use the Shopify ID as a fallback
      const shopifyId = selectedOrder.id ? selectedOrder.id.split('/').pop() : 'Unknown';
      
      setOrderInfo({
        id: selectedOrder.id || 'Unknown ID',
        orderNumber: shopifyId || 'Unknown',
        name: `#${shopifyId || 'Unknown'}`
      });
      
      // Initialize the flow
      initializeInvoiceFlow(selectedOrder.id || '', shopifyId || 'Unknown');
    }
  }, [data.selected]);

  // Determine initial step based on invoice status and order data
  useEffect(() => {
    if (invoiceStatus && orderData && !loading) {
      if (!invoiceStatus.hasInvoice && !invoiceStatus.hasError) {
        // If order is not invoiced and has no errors, show form directly
        setCurrentStep('form');
      } else {
        // Otherwise show status (for existing invoices or errors)
        setCurrentStep('status');
      }
    }
  }, [invoiceStatus, orderData, loading]);

  // Initialize the invoice flow
  const initializeInvoiceFlow = async (orderId: string, orderNumber: string) => {
    setLoading(true);
    setError('');

    try {
      // Step 1: Check invoice status
      await checkInvoiceStatus(orderNumber);
      
      // Step 2: Get full order data
      await getFullOrderData(orderId);
      
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  };

  // Check invoice status
  const checkInvoiceStatus = async (orderId: string) => {
    try {
      console.log('Checking invoice status for order:', orderId);
      // Use the full Shopify order ID for status check
      const response = await getInvoiceStatusRequest(orderInfo.id);
      console.log('Invoice status response:', response);
      
      if (response.success && response.data?.status) {
        setInvoiceStatus(response.data.status);
      } else {
        // Set default status if no invoice exists
        setInvoiceStatus({
          hasInvoice: false,
          hasError: false,
          status: 'not_invoiced'
        });
      }
    } catch (error) {
      console.error('Error checking invoice status:', error);
      // Set default status on error
      setInvoiceStatus({
        hasInvoice: false,
        hasError: false,
        status: 'not_invoiced'
      });
    }
  };

  // Get full order data
  const getFullOrderData = async (orderId: string) => {
    try {
      const basicOrderQuery = {
        query: `query Order($id: ID!) {
          order(id: $id) {
            id
            name
            createdAt
            email
            phone
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            displayFinancialStatus
            taxesIncluded
            billingAddress {
              firstName
              lastName
              company
              address1
              address2
              city
              province
              zip
              country
              phone
            }
            shippingAddress {
              firstName
              lastName
              company
              address1
              address2
              city
              province
              zip
              country
              phone
            }
            customer {
              id
              email
            }
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  sku
                  taxLines {
                    rate
                    title
                  }
                  discountAllocations {
                    allocatedAmountSet {
                      shopMoney {
                        amount
                      }
                    }
                  }
                }
              }
            }
            shippingLines(first: 5) {
              edges {
                node {
                  title
                  originalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  discountedPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }`,
        variables: { id: orderId }
      };

      console.log('Fetching order data for:', orderId);
      
      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(basicOrderQuery),
      });

      console.log('GraphQL Response status:', res.status);

      if (!res.ok) {
        console.error('GraphQL request failed:', res.status, res.statusText);
        throw new Error(`Failed to fetch order data: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();
      console.log('GraphQL Response:', result);

      if (result.errors) {
        console.warn('GraphQL warnings (non-critical):', result.errors);
        // Check if it's just permissions errors but we still have data
        if (!result.data || !result.data.order) {
          throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}`);
        }
        // If we have data despite errors, it's likely just permission warnings - continue
        console.log('Order data available despite warnings, continuing...');
      }

      if (!result.data || !result.data.order) {
        console.error('No order data in response:', result);
        throw new Error('Order data not available - the order may not exist or you may not have permission to access it');
      }

      const order = result.data.order;
      console.log('Order data received:', order);

      // Extract the actual order number from the order name (e.g., "Nr.4596" -> "4596")
      const actualOrderNumber = order.name ? order.name.replace(/^Nr\./, '') : orderInfo.orderNumber;
      
      // Update order info with correct order number
      setOrderInfo(prev => ({
        ...prev,
        orderNumber: actualOrderNumber,
        name: order.name || prev.name
      }));

      setOrderData(order);

      // Re-check invoice status with the full order ID
      await checkInvoiceStatus(orderId);

      // Build initial client data from GraphQL order
      const initialClient = buildClientFromOrder(order);
      console.log('Built client data:', initialClient);
      setCustomClient(initialClient);

      // Check if this is a B2B order and show company lookup
      const isB2B = !!(order.billingAddress?.company || extractCifFromCompany(order.billingAddress?.company));
      console.log('B2B order detection:', {
        isB2B,
        hasCompany: !!order.billingAddress?.company,
        company: order.billingAddress?.company,
        extractedCif: extractCifFromCompany(order.billingAddress?.company)
      });
      setShowCompanyLookup(isB2B);

    } catch (error) {
      console.error('Error fetching order data:', error);
      throw error;
    }
  };

  // Create invoice
  const createInvoice = async () => {
    if (!orderData || !customClient) {
      setError('Order data not available');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Use extension-native endpoint - no transformation needed!
      const payload = {
        orderId: orderInfo.id, // Full Shopify order ID
        orderNumber: orderInfo.orderNumber, // Order number for display/reference
        graphqlOrder: orderData, // Raw GraphQL data
        invoiceOptions,
        customClient
      };

      const response = await createInvoiceFromExtensionRequest(payload);
      
      if (response.success && response.data) {
        setInvoiceResult(response.data);
        setCurrentStep('result');
        
        // Update invoice status
        setInvoiceStatus({
          hasInvoice: true,
          hasError: false,
          invoiceNumber: response.data.invoice?.number,
          invoiceUrl: response.data.invoice?.url,
          status: 'invoiced'
        });
      } else {
        setInvoiceResult(response as InvoiceResult);
        setCurrentStep('result');
      }
      
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  };

  // Retry invoice creation
  const retryInvoice = async () => {
    if (!orderData) {
      setError('Order data not available');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // For retry, we can use the same extension endpoint with retry options
      const payload = {
        orderId: orderInfo.id, // Full Shopify order ID
        orderNumber: orderInfo.orderNumber, // Order number for display/reference
        graphqlOrder: orderData, // Raw GraphQL data
        invoiceOptions: {
          ...invoiceOptions,
          // Add retry-specific options if needed
          isRetry: true
        },
        customClient
      };

      const response = await createInvoiceFromExtensionRequest(payload);
      
      if (response.success && response.data) {
        setInvoiceResult(response.data);
        setCurrentStep('result');
        
        // Update invoice status
        setInvoiceStatus({
          hasInvoice: true,
          hasError: false,
          invoiceNumber: response.data.invoice?.number,
          invoiceUrl: response.data.invoice?.url,
          status: 'invoiced'
        });
      } else {
        setInvoiceResult(response as InvoiceResult);
        setCurrentStep('result');
      }
      
    } catch (error) {
      setError(handleApiError(error));
    } finally {
      setLoading(false);
    }
  };

  // Event handlers
  const handleCompanyValidation = (result: CompanyValidationResult | null) => {
    setCompanyValidation(result);
  };

  const handleClientDataChange = (client: CustomClient) => {
    setCustomClient(client);
  };

  const handleInvoiceOptionsChange = (options: InvoiceOptions) => {
    setInvoiceOptions(options);
  };

  const handleViewInvoice = (url: string) => {
    if (url) {
      // Try to open the URL, fallback to copying to clipboard if window.open fails
      try {
        // Create a temporary link element and click it
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (error) {
        // Fallback: copy URL to clipboard
        navigator.clipboard.writeText(url).then(() => {
          alert('Invoice URL copied to clipboard: ' + url);
        }).catch(() => {
          // Last resort: show the URL
          alert('Please open this URL manually: ' + url);
        });
      }
    }
  };

  const handleStartInvoiceCreation = () => {
    console.log('Starting invoice creation...', {
      orderData: !!orderData,
      customClient: !!customClient,
      currentStep
    });
    setCurrentStep('form');
  };

  const handleBackToStatus = () => {
    setCurrentStep('status');
    setInvoiceResult(null);
    setError('');
  };

  // Determine primary action based on current step and state
  const getPrimaryAction = () => {
    if (currentStep === 'result') {
      if (invoiceResult?.success) {
        return (
          <Button onPress={() => close()} variant="primary">
            Done
          </Button>
        );
      } else {
        return (
          <Button onPress={handleBackToStatus} variant="secondary">
            Back
          </Button>
        );
      }
    }

    if (currentStep === 'form') {
      return (
        <Button onPress={createInvoice} disabled={loading || !customClient} variant="primary">
          {loading ? 'Creating Invoice...' : 'Create Invoice'}
        </Button>
      );
    }

    // Status step
    if (invoiceStatus?.hasInvoice) {
      return (
        <Button 
          onPress={() => handleViewInvoice(invoiceStatus.invoiceUrl!)} 
          variant="secondary"
        >
          View Invoice
        </Button>
      );
    }

    if (invoiceStatus?.hasError) {
      return (
        <Button onPress={retryInvoice} disabled={loading} variant="primary">
          {loading ? 'Retrying...' : 'Retry Invoice'}
        </Button>
      );
    }

    return (
      <Button onPress={handleStartInvoiceCreation} disabled={loading || !orderData} variant="primary">
        Generate Invoice
      </Button>
    );
  };

  // Determine secondary action
  const getSecondaryAction = () => {
    if (currentStep === 'form') {
      return (  
        <Button onPress={handleBackToStatus} variant="secondary">
          Back
        </Button>
      );
    }

    return (
      <Button onPress={() => close()} variant="secondary">
        Cancel
      </Button>
    );
  };

  return (
    <AdminAction
      primaryAction={getPrimaryAction()}
      secondaryAction={getSecondaryAction()}
    >
      <BlockStack gap="base">
        {/* Loading State */}
        {loading && (
          <Banner>
            <Text>
              {currentStep === 'status' ? 'Loading order information...' : 
               currentStep === 'form' ? 'Creating invoice...' : 'Processing...'}
            </Text>
          </Banner>
        )}

        {/* Global Error State */}
        {error && (
          <Banner tone="critical">
            <Text>{error}</Text>
          </Banner>
        )}

        {/* Order Information Header */}
        {orderInfo.name && (
          <Text fontWeight="bold">Order: {orderInfo.name}</Text>
        )}

        {/* Step-based Content */}
        {currentStep === 'status' && (
          <InvoiceStatus 
            status={invoiceStatus}
            loading={loading && !orderData}
            onRetry={retryInvoice}
            onViewInvoice={handleViewInvoice}
            onRefreshStatus={() => checkInvoiceStatus(orderInfo.id)}
          />
        )}

        {currentStep === 'form' && (
          <BlockStack gap="base">
            {/* Check if we have required data */}
            {!orderData && (
              <Banner tone="critical">
                <Text>Order data is not available. Please refresh and try again.</Text>
              </Banner>
            )}
            
            {!customClient && orderData && (
              <Banner tone="critical">
                <Text>Customer data is not available. Please refresh and try again.</Text>
              </Banner>
            )}

            {orderData && customClient && (
              <>
                {/* Company Lookup for B2B */}
                {showCompanyLookup && (
                  <>
                    <CompanyLookup
                      initialCif={extractCifFromCompany(orderData.billingAddress?.company)}
                      onValidationResult={handleCompanyValidation}
                      onClientDataChange={handleClientDataChange}
                      disabled={loading}
                    />
                    <Divider />
                  </>
                )}

                {/* Invoice Form */}
                <InvoiceForm
                  order={orderData}
                  onOptionsChange={handleInvoiceOptionsChange}
                  onClientChange={handleClientDataChange}
                  disabled={loading}
                  validatedClient={companyValidation?.success ? customClient : null}
                />
              </>
            )}
          </BlockStack>
        )}

        {currentStep === 'result' && (
          <InvoiceResultDisplay
            result={invoiceResult}
            onViewInvoice={handleViewInvoice}
            onRetry={() => {
              setCurrentStep('form');
              setInvoiceResult(null);
            }}
            onClose={() => close()}
            showRetryButton={!invoiceResult?.success}
          />
        )}
      </BlockStack>
    </AdminAction>
  );
}
