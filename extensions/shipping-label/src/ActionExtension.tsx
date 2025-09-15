import {useEffect, useState} from 'react';
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  TextField,
  Select,
  InlineStack,
  Banner,
  Badge,
  Section,
  Divider,
  Heading,
  MoneyField,
  NumberField,
  Checkbox
} from '@shopify/ui-extensions-react/admin';

// The target used here must match the target used in the extension's toml file (./shopify.extension.toml)
const TARGET = 'admin.order-details.action.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  // The useApi hook provides access to several useful APIs like i18n, close, and data.
  const {i18n, close, data} = useApi(TARGET);
  const [orderInfo, setOrderInfo] = useState({ id: '', orderNumber: '', name: '', displayFinancialStatus: '', createdAt: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
   // Fulfillment form state (legacy shipping form - now simplified)
   const [shippingForm, setShippingForm] = useState({
     carrier: 'cargus',
     service: 'ground',
     weight: '1',
     length: '20',
     width: '15',
     height: '10',
     insurance: false,
     insuranceValue: '0',
     codAmount: '0',
     openPackage: false,
     saturdayDelivery: false,
     morningDelivery: false,
     shipmentPayer: '1', // 1: sender, 2: recipient
     observations: '',
     envelopes: '1'
   });
  
  // Shipping address state
  const [shippingAddress, setShippingAddress] = useState({
    firstName: '',
    lastName: '',
    company: '',
    address1: '',
    address2: '',
    city: '',
    province: '',
    zip: '',
    country: '',
    phone: '',
    email: ''
  });
  
  const [isFulfillingOrder, setIsFulfillingOrder] = useState(false);
  const [labelResult, setLabelResult] = useState(null);
  const [showForm, setShowForm] = useState(true); // Show form by default
  
  // Extract order information from the selected data provided by Shopify
  useEffect(() => {
    
    if (data.selected && data.selected.length > 0) {
      const selectedOrder = data.selected[0];
      
      // Extract order number from the ID (gid://shopify/Order/6898686591274 -> 6898686591274)
      const orderNumber = selectedOrder.id ? selectedOrder.id.split('/').pop() : 'Unknown';
      
      setOrderInfo({
        id: selectedOrder.id || 'Unknown ID',
        orderNumber: orderNumber,
        name: `#${orderNumber}`, // Format as order name
        displayFinancialStatus: '',
        createdAt: ''
      });
      
      // Try to get additional order information with basic fields
      tryGetBasicOrderInfo(selectedOrder.id);
    }
  }, [data.selected]);
  
  // Function to try getting basic order information that might be publicly accessible
  const tryGetBasicOrderInfo = async (orderId: string) => {
    try {
      setLoading(true);
      setError('');
      
      // Try a minimal query with basic order info, shipping address, line items, and financial info for COD calculation
      const basicOrderQuery = {
        query: `query Order($id: ID!) {
          order(id: $id) {
            name
            createdAt
            updatedAt
            email
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            totalReceivedSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            displayFinancialStatus
            lineItems(first: 50) {
              edges {
                node {
                  id
                  quantity
                  variant {
                    id
                    inventoryItem {
                      measurement {
                        weight {
                          value
                          unit
                        }
                      }
                    }
                    product {
            title
                    }
                  }
                }
              }
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
          }
        }`,
        variables: {id: orderId},
      };


      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify(basicOrderQuery),
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const orderData = await res.json();

      if (orderData.errors) {
        
        // Check if it's just a customer access error but we still have order data
        const hasCustomerAccessError = orderData.errors.some(error => 
          error.message.includes('Access denied for customer field')
        );
        
        if (hasCustomerAccessError && orderData.data && orderData.data.order) {
          // Continue processing with available data
        } else {
          setError('Limited access - showing basic info only');
          setLoading(false);
          return;
        }
      }

      if (orderData.data && orderData.data.order) {
        const order = orderData.data.order;
        setOrderInfo(prev => ({
          ...prev,
          name: order.name || prev.name,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          displayFinancialStatus: order.displayFinancialStatus
        }));
        
        // Calculate total weight from line items
        const calculatedWeight = calculateTotalWeight(order.lineItems);
        
        // Calculate COD amount based on payment status
        const calculatedCOD = calculateCODAmount(order);
        
        // Calculate insurance value (default to order total)
        const orderTotal = parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || order.totalPriceSet?.shopMoney?.amount || '0');
        const calculatedInsuranceValue = orderTotal.toFixed(2);
        
        // Update shipping form with calculated weight, COD, and insurance value
        setShippingForm(prev => ({
          ...prev,
          weight: String(calculatedWeight),
          codAmount: String(calculatedCOD),
          insuranceValue: String(calculatedInsuranceValue)
        }));
        
        // Populate shipping address if available, fallback to billing address
        const addressToUse = order.shippingAddress || order.billingAddress;
        if (addressToUse) {
            
          // Handle missing names - use company name or default values
          let firstName = addressToUse.firstName || '';
          let lastName = addressToUse.lastName || '';
          
          // If both names are empty but we have a company, use company as name
          if (!firstName && !lastName && addressToUse.company) {
            firstName = addressToUse.company;
            lastName = ''; // Keep lastName empty when using company as firstName
          }
          
          setShippingAddress({
            firstName: firstName,
            lastName: lastName,
            company: addressToUse.company || '',
            address1: addressToUse.address1 || '',
            address2: addressToUse.address2 || '',
            city: addressToUse.city || '',
            province: addressToUse.province || '',
            zip: addressToUse.zip || '',
            country: addressToUse.country || '',
            phone: addressToUse.phone || '',
            email: order.email || ''
          });
        }
      }
      
      setLoading(false);
    } catch (error) {
      setError('Using basic info only');
      setLoading(false);
    }
  };

  // Function to fulfill order with Cargus
  const fulfillOrderWithCargus = async () => {
    try {
      setIsFulfillingOrder(true);
      setError('');

      const fulfillmentData = {
        orderId: orderInfo.id,
        orderNumber: orderInfo.orderNumber,
        carrier: shippingForm.carrier,
        service: shippingForm.service,
        package: {
          weight: parseFloat(shippingForm.weight) || 1.0,
          length: parseFloat(shippingForm.length) || 20,
          width: parseFloat(shippingForm.width) || 15,
          height: parseFloat(shippingForm.height) || 10
        },
        insurance: shippingForm.insurance,
        insuranceValue: shippingForm.insuranceValue,
        customShippingAddress: shippingAddress,
        codAmount: shippingForm.codAmount,
        openPackage: shippingForm.openPackage,
        saturdayDelivery: shippingForm.saturdayDelivery,
        morningDelivery: shippingForm.morningDelivery,
        shipmentPayer: shippingForm.shipmentPayer,
        observations: shippingForm.observations,
        envelopes: parseInt(shippingForm.envelopes) || 0,
        orderTotal: shippingForm.insuranceValue, // Use insurance value as order total
        orderEmail: shippingAddress.email,
        orderPhone: shippingAddress.phone,
        notifyCustomer: true
      };

      // Backend URL
      const backendUrl = 'https://primesupplements-oblio-production.up.railway.app';
        
      const response = await fetch(`${backendUrl}/shipping/fulfillment/create/cargus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Shopify-Admin-Extension',
          'X-Shopify-Extension': 'shipping-label'
        },
        body: JSON.stringify(fulfillmentData)
      });

      if (!response.ok) {
        throw new Error(`Failed to fulfill order: ${response.statusText}`);
      }

      const result = await response.json();

      setLabelResult(result);
      setShowForm(false);
      
    } catch (error) {
      setError(`Failed to fulfill order with Cargus: ${error.message}`);
    } finally {
      setIsFulfillingOrder(false);
    }
  };

   // Handle form input changes
   const handleFormChange = (field: string, value: string | boolean) => {
     setShippingForm(prev => ({
       ...prev,
       [field]: value
     }));
   };


  // Function to calculate total weight from line items
  const calculateTotalWeight = (lineItems: any) => {
    if (!lineItems || !lineItems.edges) {
      return 1; // Default weight in kg
    }

    let totalWeightGrams = 0;
    
    lineItems.edges.forEach(edge => {
      const item = edge.node;
      const quantity = item.quantity || 1;
      const variant = item.variant;
      
      if (variant && variant.inventoryItem?.measurement?.weight) {
        const weight = variant.inventoryItem.measurement.weight;
        let weightInGrams = weight.value;
        
        // Convert weight to grams based on weight unit
        switch (weight.unit?.toLowerCase()) {
          case 'kilograms':
          case 'kg':
            weightInGrams = weight.value * 1000;
            break;
          case 'pounds':
          case 'lb':
            weightInGrams = weight.value * 453.592;
            break;
          case 'ounces':
          case 'oz':
            weightInGrams = weight.value * 28.3495;
            break;
          case 'grams':
          case 'g':
          default:
            weightInGrams = weight.value;
            break;
        }
        
        totalWeightGrams += weightInGrams * quantity;
        
      } else {
        // Fallback weight if no weight data available (0.5kg = 500g)
        const fallbackWeight = 500;
        totalWeightGrams += fallbackWeight * quantity;
        
      }
    });

    // Convert total weight back to kg and round to 2 decimal places
    const totalWeightKg = Math.max(0.1, totalWeightGrams / 1000); // Minimum 0.1kg
    
    
    return totalWeightKg.toFixed(2).toString();
  };

  // Function to get order status badge properties
  const getOrderStatusBadge = (order: any) => {
    if (!order) return { text: 'Unknown', tone: undefined };
    
    const status = order.displayFinancialStatus?.toLowerCase();
    
    switch (status) {
      case 'paid':
        return { text: 'Paid', tone: 'success' };
      case 'pending':
        return { text: 'Pending Payment', tone: 'attention' };
      case 'partially_paid':
        return { text: 'Partially Paid', tone: 'caution' };
      case 'refunded':
        return { text: 'Refunded', tone: 'info' };
      case 'partially_refunded':
        return { text: 'Partially Refunded', tone: 'info' };
      case 'voided':
        return { text: 'Voided', tone: 'critical' };
      default:
        return { text: status || 'Unknown', tone: undefined };
    }
  };

  // Function to validate shipping address
  const validateShippingAddress = (address) => {
    const requiredFields = ['firstName', 'lastName', 'address1', 'city', 'province', 'zip', 'country'];
    const missingFields = [];
    
    requiredFields.forEach(field => {
      if (!address[field] || address[field].trim() === '') {
        missingFields.push(field);
      }
    });
    
    return {
      isValid: missingFields.length === 0,
      missingFields: missingFields
    };
  };

  // Function to get field display name
  const getFieldDisplayName = (field) => {
    const fieldNames = {
      firstName: 'First Name',
      lastName: 'Last Name',
      address1: 'Address Line 1',
      city: 'City',
      province: 'Province/State',
      zip: 'Postal Code',
      country: 'Country'
    };
    return fieldNames[field] || field;
  };

  // Function to calculate Cash on Delivery amount
  const calculateCODAmount = (order: any) => {
    if (!order) {
      return '0';
    }

    const displayFinancialStatus = order.displayFinancialStatus?.toLowerCase();

    // If order is fully paid, COD should be 0
    if (displayFinancialStatus === 'paid') {
      return '0';
    }

    // Get order total and amount received
    const totalAmount = parseFloat(order.currentTotalPriceSet?.shopMoney?.amount || order.totalPriceSet?.shopMoney?.amount || '0');
    const receivedAmount = parseFloat(order.totalReceivedSet?.shopMoney?.amount || '0');

    // Calculate remaining amount for COD
    const codAmount = Math.max(0, totalAmount - receivedAmount);
    
    return codAmount.toFixed(2).toString();
  };
  return (
    <AdminAction
      primaryAction={
        <Button
          onPress={() => {
            if (labelResult) {
              close();
            } else {
              fulfillOrderWithCargus();
            }
          }}
          disabled={isFulfillingOrder || !validateShippingAddress(shippingAddress).isValid}
          variant={labelResult ? 'secondary' : 'primary'}
        >
          {labelResult ? 'Done' : 'Fulfill with Cargus'}
        </Button>
      }
      secondaryAction={
        <Button onPress={() => close()} variant="secondary">
          Cancel
        </Button>
      }
    >
      <BlockStack gap="small">
        {/* Status Messages */}
        {loading && (
          <Banner>
            <Text>Loading order details...</Text>
          </Banner>
        )}
        
        {error && !labelResult && (
          <Banner tone="critical">
            <Text>{error}</Text>
          </Banner>
        )}

        {isFulfillingOrder && (
          <Banner>
            <Text fontWeight="bold">Fulfilling order with Cargus...</Text>
          </Banner>
        )}

        {/* Success State */}
        {labelResult && (
          <Banner tone="success">
            <BlockStack gap="small">
              <Text fontWeight="bold">Order fulfilled with Cargus successfully!</Text>
              <InlineStack gap="base">
                <Text>AWB: <Text fontWeight="bold">{labelResult.data?.awbBarcode || 'N/A'}</Text></Text>
                <Text>Status: <Text fontWeight="bold">{labelResult.data?.status || 'N/A'}</Text></Text>
              </InlineStack>
              {labelResult.data?.trackingUrl && (
                <Text>
                  Tracking URL: <Text fontWeight="bold">{labelResult.data.trackingUrl}</Text>
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {/* Legacy Success State - keeping for backwards compatibility */}
        {labelResult && labelResult.trackingNumber && (
          <Banner tone="success">
            <BlockStack gap="small">
              <Text fontWeight="bold">Label created successfully</Text>
              <InlineStack gap="base">
                <Text>Tracking: <Text fontWeight="bold">{labelResult.trackingNumber || 'N/A'}</Text></Text>
                <Text>Cost: <Text fontWeight="bold">{
                  labelResult.cost && labelResult.cost !== 'N/A' && labelResult.cost !== 'Contact courier for pricing'
                    ? `${labelResult.cost} RON`
                    : labelResult.cost || 'Contact courier'
                }</Text></Text>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

         {!labelResult && (
           <BlockStack gap="large">

            {/* Carrier & Service - Compact Row */}
            <Section>
              <BlockStack gap="small">
                <Text fontWeight="bold">Shipping</Text>
                <InlineStack gap="base">
                  <Select
                    label="Carrier"
                    options={[{value: 'cargus', label: 'Cargus'}]}
                    value={shippingForm.carrier}
                    onChange={(value) => handleFormChange('carrier', value)}
                    disabled={true}
                  />
                  <Select
                    label="Service"
                    options={[
                      {value: 'ground', label: 'Standard'},
                      {value: 'express', label: 'Express'}
                    ]}
                    value={shippingForm.service}
                    onChange={(value) => handleFormChange('service', value)}
                  />
                </InlineStack>
              </BlockStack>
            </Section>

            {/* Package Details - Compact Grid */}
            <Section>
              <BlockStack gap="small">
                <Text fontWeight="bold">Package</Text>
                 <InlineStack gap="small">
                   <NumberField
                     label="Weight (kg)"
                     value={parseFloat(shippingForm.weight) || 0}
                     onChange={(value) => handleFormChange('weight', String(value))}
                     step={0.1}
                     min={0.1}
                   />
                   <NumberField
                     label="Length (cm)"
                     value={parseFloat(shippingForm.length) || 0}
                     onChange={(value) => handleFormChange('length', String(value))}
                     step={1}
                     min={1}
                   />
                   <NumberField
                     label="Width (cm)"
                     value={parseFloat(shippingForm.width) || 0}
                     onChange={(value) => handleFormChange('width', String(value))}
                     step={1}
                     min={1}
                   />
                   <NumberField
                     label="Height (cm)"
                     value={parseFloat(shippingForm.height) || 0}
                     onChange={(value) => handleFormChange('height', String(value))}
                     step={1}
                     min={1}
                   />
                 </InlineStack>
                 <NumberField
                   label="Envelopes (combined with package)"
                   value={parseInt(shippingForm.envelopes) || 0}
                   onChange={(value) => handleFormChange('envelopes', String(value))}
                   step={1}
                   min={0}
                 />
              </BlockStack>
            </Section>

             {/* Payment & Insurance - Compact Row */}
             <Section>
               <BlockStack gap="small">
                 <Text fontWeight="bold">Payment</Text>
                 <InlineStack gap="base">
                   <MoneyField
                     label={`COD ${orderInfo.displayFinancialStatus ? `- ${getOrderStatusBadge({ displayFinancialStatus: orderInfo.displayFinancialStatus }).text}` : ''}`}
                     value={parseFloat(shippingForm.codAmount) || 0}
                     currencyCode="RON"
                     onChange={(value) => handleFormChange('codAmount', String(value))}
                   />
                   <MoneyField
                     label="Insurance"
                     value={parseFloat(shippingForm.insuranceValue) || 0}
                     currencyCode="RON"
                     onChange={(value) => handleFormChange('insuranceValue', String(value))}
                   />
                 </InlineStack>
                 <Select
                   label="Shipment Payer"
                   options={[
                     {value: '1', label: 'Sender Pays'},
                     {value: '2', label: 'Recipient Pays'}
                   ]}
                   value={shippingForm.shipmentPayer}
                   onChange={(value) => handleFormChange('shipmentPayer', value)}
                 />
               </BlockStack>
             </Section>

             {/* Delivery Options */}
             <Section>
               <BlockStack gap="small">
                 <Text fontWeight="bold">Delivery Options</Text>
                 <InlineStack gap="base">
                   <Checkbox
                     checked={shippingForm.openPackage}
                     onChange={(checked) => handleFormChange('openPackage', checked)}
                   >
                     Open Package
                   </Checkbox>
                   <Checkbox
                     checked={shippingForm.saturdayDelivery}
                     onChange={(checked) => handleFormChange('saturdayDelivery', checked)}
                   >
                     Saturday Delivery
                   </Checkbox>
                   <Checkbox
                     checked={shippingForm.morningDelivery}
                     onChange={(checked) => handleFormChange('morningDelivery', checked)}
                   >
                     Morning Delivery
                   </Checkbox>
                 </InlineStack>
               </BlockStack>
             </Section>

             {/* Additional Information */}
             <Section>
               <BlockStack gap="small">
                 <Text fontWeight="bold">Additional Information</Text>
                 <TextField
                   label="Observations"
                   value={shippingForm.observations}
                   onChange={(value) => handleFormChange('observations', value)}
                 />
               </BlockStack>
             </Section>
            
            {/* Address Validation - Compact Error */}
            {(() => {
              const validation = validateShippingAddress(shippingAddress);
              if (!validation.isValid) {
                return (
                  <Banner tone="critical">
                    <BlockStack gap="small">
                      <Text fontWeight="bold">Missing address fields</Text>
                      <Text>Required: {validation.missingFields.map(getFieldDisplayName).join(', ')}</Text>
                    </BlockStack>
                  </Banner>
                );
              }
              return null;
            })()}
          </BlockStack>
        )}
      </BlockStack>
    </AdminAction>
  );
}