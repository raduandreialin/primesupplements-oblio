/**
 * Invoice Utilities
 * 
 * Helper functions for invoice operations in the admin extension
 */

export interface InvoiceOptions {
  seriesName?: string;
  issueDate?: string;
  language?: 'RO' | 'EN';
  mentions?: string;
  sendEmail?: boolean;
  useStock?: boolean;
  markAsPaid?: boolean;
  paymentMethod?: string;
  collectDate?: string;
  excludeShipping?: boolean;
  selectedLineItems?: string[];
  allowInactiveCompanies?: boolean;
}

export interface CustomClient {
  name: string;
  cif?: string;
  rc?: string;
  address: string;
  state: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  contact: string;
}

export interface InvoiceStatus {
  hasInvoice: boolean;
  hasError: boolean;
  invoiceNumber?: string;
  invoiceUrl?: string;
  status: 'not_invoiced' | 'invoiced' | 'error';
  tags?: string[];
}

export interface InvoiceResult {
  success: boolean;
  invoice?: {
    number: string;
    series: string;
    url: string;
    total: number;
    currency: string;
    issueDate: string;
    clientName: string;
    clientCif?: string;
  };
  error?: string;
  details?: any;
  retryable?: boolean;
}

/**
 * Transform GraphQL order data to REST format for backend
 */
export function transformGraphQLOrderToRest(graphqlOrder: any, orderNumber: string): any {
  return {
    id: orderNumber,
    name: graphqlOrder.name,
    order_number: orderNumber,
    email: graphqlOrder.email,
    phone: graphqlOrder.phone,
    currency: graphqlOrder.currency,
    taxes_included: graphqlOrder.taxesIncluded,
    financial_status: graphqlOrder.financialStatus,
    total_price: graphqlOrder.totalPriceSet?.shopMoney?.amount || '0',
    line_items: graphqlOrder.lineItems.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      quantity: edge.node.quantity,
      price: edge.node.price,
      sku: edge.node.sku,
      tax_lines: edge.node.taxLines || [],
      discount_allocations: edge.node.discountAllocations || []
    })),
    shipping_lines: graphqlOrder.shippingLines.edges.map((edge: any) => ({
      title: edge.node.title,
      price: edge.node.price,
      discounted_price: edge.node.discountedPrice
    })),
    billing_address: graphqlOrder.billingAddress,
    shipping_address: graphqlOrder.shippingAddress,
    customer: graphqlOrder.customer
  };
}

/**
 * Build client data from order billing/shipping address
 */
export function buildClientFromOrder(order: any): CustomClient {
  const billingAddr = order.billing_address || order.billingAddress;
  const shippingAddr = order.shipping_address || order.shippingAddress;
  const addr = billingAddr || shippingAddr;

  if (!addr) {
    return {
      name: 'Customer',
      address: 'Address not provided',
      state: '',
      city: 'Bucuresti',
      country: 'România',
      email: order.email || order.customer?.email || '',
      phone: '',
      contact: 'Customer'
    };
  }

  const fullName = `${addr.firstName || ''} ${addr.lastName || ''}`.trim();
  const clientName = addr.company || fullName || order.customer?.email || 'Customer';

  return {
    name: clientName,
    cif: extractCifFromCompany(addr.company),
    address: buildAddressString(addr),
    state: addr.province || addr.state || '',
    city: addr.city || 'Bucuresti',
    country: addr.country || 'România',
    email: order.email || order.customer?.email || '',
    phone: addr.phone || '',
    contact: fullName || 'Customer'
  };
}

/**
 * Extract CIF from company name or field
 */
export function extractCifFromCompany(company?: string): string | undefined {
  if (!company) return undefined;

  // Look for patterns like "Company Name CIF:12345678" or "Company Name - 12345678"
  const cifPatterns = [
    /CIF:?\s*(\d{2,10})/i,
    /C\.I\.F\.?\s*(\d{2,10})/i,
    /\bRO(\d{2,10})\b/i,
    /\b(\d{8,10})\b/, // Generic 8-10 digit number
  ];

  for (const pattern of cifPatterns) {
    const match = company.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Build address string from address object
 */
export function buildAddressString(addr: any): string {
  const parts = [
    addr.address1,
    addr.address2,
    addr.city,
    addr.province || addr.state,
    addr.zip,
    addr.country
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Detect if order is B2B based on billing address
 */
export function isB2BOrder(order: any): boolean {
  const billingAddr = order.billing_address || order.billingAddress;
  
  if (!billingAddr) return false;
  
  // Has company name
  if (billingAddr.company && billingAddr.company.trim().length > 0) {
    return true;
  }
  
  // Check if CIF is mentioned in any field
  const fieldsToCheck = [
    billingAddr.address1,
    billingAddr.address2,
    order.note,
    order.customer?.note
  ].filter(Boolean);
  
  for (const field of fieldsToCheck) {
    if (extractCifFromCompany(field)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get default invoice options based on order
 */
export function getDefaultInvoiceOptions(order: any): InvoiceOptions {
  const isB2B = isB2BOrder(order);
  const isPaid = (order.financial_status || '').toLowerCase() === 'paid';
  
  return {
    seriesName: isB2B ? 'FACT' : 'FCT',
    language: 'RO',
    sendEmail: true,
    useStock: true,
    markAsPaid: isPaid,
    paymentMethod: isPaid ? 'Card' : undefined,
    excludeShipping: false,
    allowInactiveCompanies: false,
    mentions: `Factura emisa pentru comanda ${order.name || order.order_number}`
  };
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number | string, currency: string = 'RON'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) return `0 ${currency}`;
  
  return `${numAmount.toFixed(2)} ${currency}`;
}

/**
 * Get invoice status badge info
 */
export function getInvoiceStatusBadge(status: InvoiceStatus) {
  switch (status.status) {
    case 'invoiced':
      return {
        tone: 'success' as const,
        text: `Invoice #${status.invoiceNumber}`,
        action: 'View Invoice'
      };
    case 'error':
      return {
        tone: 'critical' as const,
        text: 'Invoice Failed',
        action: 'Retry Invoice'
      };
    default:
      return {
        tone: 'info' as const,
        text: 'Not Invoiced',
        action: 'Generate Invoice'
      };
  }
}

/**
 * Validate invoice options
 */
export function validateInvoiceOptions(options: InvoiceOptions): string[] {
  const errors: string[] = [];
  
  if (options.seriesName && !/^[A-Z]{2,5}$/.test(options.seriesName)) {
    errors.push('Series name must be 2-5 uppercase letters');
  }
  
  if (options.issueDate) {
    const date = new Date(options.issueDate);
    if (isNaN(date.getTime())) {
      errors.push('Invalid issue date format');
    }
  }
  
  if (options.collectDate) {
    const date = new Date(options.collectDate);
    if (isNaN(date.getTime())) {
      errors.push('Invalid collection date format');
    }
  }
  
  return errors;
}

/**
 * Get order GraphQL query
 */
export function getOrderGraphQLQuery(): string {
  return `query Order($id: ID!) {
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
      note
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
        note
      }
    }
  }`;
}
