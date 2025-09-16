/**
 * Order calculation and processing utilities
 */

/**
 * Function to calculate total weight from line items
 */
export const calculateTotalWeight = (lineItems: any): string => {
  if (!lineItems || !lineItems.edges) {
    return '1'; // Default weight in kg
  }

  let totalWeightGrams = 0;
  
  lineItems.edges.forEach((edge: any) => {
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
  
  return totalWeightKg.toFixed(2);
};

/**
 * Function to calculate Cash on Delivery amount
 */
export const calculateCODAmount = (order: any): string => {
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
  
  return codAmount.toFixed(2);
};

/**
 * Function to get order status badge properties
 */
export const getOrderStatusBadge = (order: any) => {
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
