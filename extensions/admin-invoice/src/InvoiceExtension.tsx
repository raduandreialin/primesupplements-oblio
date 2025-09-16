import {useEffect, useState} from 'react';
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Banner,
  Section,
  InlineStack
} from '@shopify/ui-extensions-react/admin';

// The target used here must match the target used in the extension's toml file
const TARGET = 'admin.order-details.action.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  // The useApi hook provides access to several useful APIs like i18n, close, and data.
  const {i18n, close, data} = useApi(TARGET);
  const [orderInfo, setOrderInfo] = useState({ id: '', orderNumber: '', name: '', displayFinancialStatus: '', createdAt: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invoiceResult, setInvoiceResult] = useState(null);
  const [invoiceStatus, setInvoiceStatus] = useState(null);

  // Extract order information from the selected data provided by Shopify
  useEffect(() => {
    if (data.selected && data.selected.length > 0) {
      const selectedOrder = data.selected[0];
      
      // Extract order number from the ID (gid://shopify/Order/6898686591274 -> 6898686591274)
      const orderNumber = selectedOrder.id ? selectedOrder.id.split('/').pop() : 'Unknown';
      
      setOrderInfo({
        id: selectedOrder.id || 'Unknown ID',
        orderNumber: orderNumber,
        name: `#${orderNumber}`,
        displayFinancialStatus: '',
        createdAt: ''
      });
      
      // Check invoice status
      checkInvoiceStatus(orderNumber);
      
      // Try to get additional order information
      tryGetBasicOrderInfo(selectedOrder.id);
    }
  }, [data.selected]);

  // Check if order already has invoice
  const checkInvoiceStatus = async (orderId: string) => {
    try {
      const backendUrl = 'https://primesupplements-oblio-production.up.railway.app';
      const response = await fetch(`${backendUrl}/invoice/status/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Shopify-Admin-Extension',
          'X-Shopify-Extension': 'invoice-generator'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setInvoiceStatus(result.status);
        }
      }
    } catch (error) {
      console.warn('Failed to check invoice status:', error);
    }
  };

  // Function to try getting basic order information
  const tryGetBasicOrderInfo = async (orderId: string) => {
    try {
      setLoading(true);
      setError('');
      
      // Try a minimal query with basic order info
      const basicOrderQuery = {
        query: `query Order($id: ID!) {
          order(id: $id) {
            name
            createdAt
            displayFinancialStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              email
            }
            billingAddress {
              firstName
              lastName
              company
              address1
              city
              province
              country
              phone
            }
            shippingAddress {
              firstName
              lastName
              company
              address1
              city
              province
              country
              phone
            }
          }
        }`,
        variables: {id: orderId},
      };

      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(basicOrderQuery),
      });

      if (res.ok) {
        const orderData = await res.json();
        if (orderData.data && orderData.data.order) {
          const order = orderData.data.order;
          setOrderInfo(prev => ({
            ...prev,
            name: order.name || prev.name,
            createdAt: order.createdAt,
            displayFinancialStatus: order.displayFinancialStatus
          }));
        }
      }
      
      setLoading(false);
    } catch (error) {
      setError('Limited access - showing basic info only');
      setLoading(false);
    }
  };

  // Function to create invoice
  const createInvoice = async () => {
    try {
      setLoading(true);
      setError('');

      // Get full order data first
      const orderQuery = {
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
            financialStatus
            currency
            taxesIncluded
            lineItems(first: 50) {
              edges {
                node {
                  id
                  title
                  quantity
                  price
                  sku
                  taxLines {
                    rate
                    title
                  }
                  discountAllocations {
                    amount
                  }
                }
              }
            }
            shippingLines(first: 5) {
              edges {
                node {
                  title
                  price
                  discountedPrice
                }
              }
            }
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
          }
        }`,
        variables: {id: orderInfo.id},
      };

      const orderRes = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(orderQuery),
      });

      if (!orderRes.ok) {
        throw new Error('Failed to fetch order data');
      }

      const orderData = await orderRes.json();
      if (!orderData.data || !orderData.data.order) {
        throw new Error('Order data not available');
      }

      // Transform GraphQL data to REST-like format for backend
      const order = orderData.data.order;
      const transformedOrder = {
        id: orderInfo.orderNumber,
        name: order.name,
        order_number: orderInfo.orderNumber,
        email: order.email,
        phone: order.phone,
        currency: order.currency,
        taxes_included: order.taxesIncluded,
        financial_status: order.financialStatus,
        total_price: order.totalPriceSet?.shopMoney?.amount || '0',
        line_items: order.lineItems.edges.map(edge => ({
          id: edge.node.id,
          title: edge.node.title,
          quantity: edge.node.quantity,
          price: edge.node.price,
          sku: edge.node.sku,
          tax_lines: edge.node.taxLines || [],
          discount_allocations: edge.node.discountAllocations || []
        })),
        shipping_lines: order.shippingLines.edges.map(edge => ({
          title: edge.node.title,
          price: edge.node.price,
          discounted_price: edge.node.discountedPrice
        })),
        billing_address: order.billingAddress,
        shipping_address: order.shippingAddress,
        customer: order.customer
      };

      // Create invoice payload
      const invoicePayload = {
        orderId: orderInfo.orderNumber,
        orderData: transformedOrder,
        invoiceOptions: {
          sendEmail: true,
          useStock: true,
          language: 'RO'
        },
        validateCompany: false, // For now, keep it simple
        skipAnaf: false
      };

      // Backend URL
      const backendUrl = 'https://primesupplements-oblio-production.up.railway.app';
        
      const response = await fetch(`${backendUrl}/invoice/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Shopify-Admin-Extension',
          'X-Shopify-Extension': 'invoice-generator'
        },
        body: JSON.stringify(invoicePayload)
      });

      const result = await response.json();

      if (result.success) {
        setInvoiceResult(result);
        // Update invoice status
        setInvoiceStatus({
          hasInvoice: true,
          invoiceNumber: result.invoice.number,
          invoiceUrl: result.invoice.url,
          status: 'invoiced'
        });
      } else {
        throw new Error(result.error || 'Failed to create invoice');
      }
      
    } catch (error) {
      console.error('Invoice creation error:', error);
      setError(`Failed to create invoice: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Function to retry invoice creation
  const retryInvoice = async () => {
    try {
      setLoading(true);
      setError('');

      // Similar to createInvoice but use retry endpoint
      // For now, redirect to create - in future we can add retry-specific logic
      await createInvoice();
      
    } catch (error) {
      console.error('Invoice retry error:', error);
      setError(`Failed to retry invoice: ${error.message}`);
      setLoading(false);
    }
  };

  // Determine what action to show
  const getActionButton = () => {
    if (invoiceResult) {
      return (
        <Button onPress={() => close()} variant="primary">
          Done
        </Button>
      );
    }

    if (invoiceStatus?.hasInvoice) {
      return (
        <Button onPress={() => window.open(invoiceStatus.invoiceUrl, '_blank')} variant="secondary">
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
      <Button onPress={createInvoice} disabled={loading} variant="primary">
        {loading ? 'Creating...' : 'Generate Invoice'}
      </Button>
    );
  };

  return (
    <AdminAction
      primaryAction={getActionButton()}
      secondaryAction={
        <Button onPress={() => close()} variant="secondary">
          Cancel
        </Button>
      }
    >
      <BlockStack gap="small">
        {/* Loading State */}
        {loading && (
          <Banner>
            <Text>Processing invoice...</Text>
          </Banner>
        )}
        
        {/* Error State */}
        {error && !invoiceResult && (
          <Banner tone="critical">
            <Text>{error}</Text>
          </Banner>
        )}

        {/* Success State */}
        {invoiceResult && (
          <Banner tone="success">
            <BlockStack gap="small">
              <Text fontWeight="bold">Invoice created successfully!</Text>
              <Text>Invoice Number: <Text fontWeight="bold">{invoiceResult.invoice.number}</Text></Text>
              {invoiceResult.invoice.url && (
                <Button 
                  onPress={() => window.open(invoiceResult.invoice.url, '_blank')} 
                  variant="secondary"
                  size="small"
                >
                  View Invoice
                </Button>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Current Status */}
        {!invoiceResult && (
          <Section>
            <BlockStack gap="small">
              <Text fontWeight="bold">Order Information</Text>
              <InlineStack gap="base">
                <Text>Order: {orderInfo.name}</Text>
                {orderInfo.displayFinancialStatus && (
                  <Text>Status: {orderInfo.displayFinancialStatus}</Text>
                )}
              </InlineStack>
              
              {/* Invoice Status */}
              {invoiceStatus && (
                <BlockStack gap="small">
                  <Text fontWeight="bold">Invoice Status</Text>
                  {invoiceStatus.hasInvoice ? (
                    <Banner tone="success">
                      <Text>Invoice #{invoiceStatus.invoiceNumber} already exists</Text>
                    </Banner>
                  ) : invoiceStatus.hasError ? (
                    <Banner tone="warning">
                      <Text>Previous invoice creation failed - you can retry</Text>
                    </Banner>
                  ) : (
                    <Banner>
                      <Text>No invoice found for this order</Text>
                    </Banner>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Section>
        )}
      </BlockStack>
    </AdminAction>
  );
}
