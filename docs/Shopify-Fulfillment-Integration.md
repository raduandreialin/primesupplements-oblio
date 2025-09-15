# Shopify Fulfillment Integration with Cargus

This document describes the new Shopify fulfillment functionality that integrates with the Cargus courier service to automatically fulfill orders with tracking information using the Shopify REST API.

## Overview

The integration provides a complete order fulfillment workflow:

1. **Order Processing**: Retrieve Shopify order with line items
2. **AWB Creation**: Generate Cargus AWB (Air Waybill) for shipping
3. **Fulfillment**: Create Shopify fulfillment with Cargus tracking information (REST API)
4. **Metadata**: Update order with shipping details and tracking information
5. **Notification**: Optionally notify customers about shipment

## API Endpoints

### POST /shipping/fulfillment/create/cargus

Fulfills a Shopify order with Cargus AWB and tracking information.

**Request:**
```json
{
  "orderId": "123456789",
  "notifyCustomer": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fulfillmentId": "gid://shopify/Fulfillment/456789",
    "awbBarcode": "UC123456789",
    "awbId": "AWB-001",
    "trackingUrl": "https://urgentcargus.ro/tracking-colet/UC123456789",
    "orderId": "123456789",
    "status": "SUCCESS",
    "trackingInfo": [
      {
        "company": "Cargus",
        "number": "UC123456789",
        "url": "https://urgentcargus.ro/tracking-colet/UC123456789"
      }
    ]
  }
}
```

## ShopifyService Methods

### fulfillOrderWithCargus(orderId, awbData, notifyCustomer)

Main method that orchestrates the complete fulfillment process.

**Parameters:**
- `orderId` (string|number): Shopify order ID
- `awbData` (Object): AWB data returned from Cargus service
- `notifyCustomer` (boolean): Whether to send notification to customer

**Returns:** Promise<Object> with fulfillment details

**Example:**
```javascript
const fulfillmentResult = await shopifyService.fulfillOrderWithCargus(
  orderId, 
  awbData, 
  true
);
```

### getOrderWithFulfillmentOrders(orderId)

Retrieves order with fulfillment orders for processing.

**Parameters:**
- `orderId` (string|number): Shopify order ID

**Returns:** Promise<Object> with order and fulfillment orders

### createFulfillmentWithTracking(orderId, trackingInfo, notifyCustomer)

Creates a Shopify fulfillment with Cargus tracking information.

**Parameters:**
- `orderId` (string|number): Shopify order ID
- `trackingInfo` (Object): Tracking information object
  - `barcode` (string): AWB barcode
  - `trackingUrl` (string): Tracking URL
- `notifyCustomer` (boolean): Whether to notify customer

**Returns:** Promise<Object> with fulfillment details

### setShippingMetafields(orderId, awbBarcode, trackingUrl, fulfillmentId)

Sets shipping-related metafields on the order for future reference.

**Metafields Created:**
- `custom.awb_barcode`: AWB barcode
- `custom.tracking_url`: Tracking URL
- `custom.fulfillment_id`: Shopify fulfillment ID
- `custom.shipping_carrier`: "Cargus"

## GraphQL Operations

### Order with Fulfillment Orders Query

```graphql
query GetOrderWithFulfillmentOrders($id: ID!) {
  order(id: $id) {
    id
    name
    email
    phone
    fulfillmentOrders(first: 10) {
      edges {
        node {
          id
          status
          requestStatus
          supportedActions {
            action
          }
          destination {
            address1
            address2
            city
            countryCode
            email
            firstName
            lastName
            phone
            province
            zip
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                totalQuantity
                remainingQuantity
                lineItem {
                  id
                  name
                  quantity
                  sku
                  variant {
                    id
                    title
                  }
                }
              }
            }
          }
          assignedLocation {
            name
            location {
              id
              name
            }
          }
        }
      }
    }
  }
}
```

### Fulfillment Creation Mutation

```graphql
mutation FulfillmentCreate($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment {
      id
      status
      name
      trackingInfo(first: 10) {
        company
        number
        url
      }
      fulfillmentLineItems(first: 50) {
        edges {
          node {
            id
            quantity
            lineItem {
              id
              name
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## Workflow Process

1. **Order Validation**: Check if order exists and has fulfillable items
2. **Fulfillment Order Analysis**: Find fulfillment orders that support `CREATE_FULFILLMENT`
3. **Line Item Processing**: Collect all line items with remaining quantity to fulfill
4. **Cargus AWB Creation**: Generate AWB using existing CargusService
5. **Shopify Fulfillment**: Create fulfillment with tracking information
6. **Metadata Update**: Set shipping metafields on the order
7. **Order Tagging**: Tag order as "Fulfilled with Cargus"
8. **Customer Notification**: Optional email notification to customer

## Error Handling

The integration includes comprehensive error handling:

- **Order Not Found**: Returns 404 with appropriate message
- **No Fulfillable Items**: Returns error if order is already fulfilled
- **Cargus API Errors**: Handles AWB creation failures
- **GraphQL Errors**: Processes Shopify API validation errors
- **Network Issues**: Includes retry logic and timeout handling

Errors are logged with structured data for debugging and monitoring.

## Testing

Use the test file `_tests/fulfillment-test.js` to validate the integration:

```bash
node _tests/fulfillment-test.js
```

The test suite validates:
- Service initialization
- Order retrieval with fulfillment orders
- GraphQL query and mutation structure
- Controller method availability
- Cargus service connectivity

## Requirements

### Shopify API Permissions

The app requires the following Shopify API scopes:
- `write_orders`: To create fulfillments
- `write_merchant_managed_fulfillment_orders`: To manage fulfillment orders
- `write_third_party_fulfillment_orders`: For third-party fulfillment services

### Configuration

Ensure the following environment variables are configured:

```env
# Shopify Configuration
B2C_SHOPIFY_SHOPNAME=your-shop-name
B2C_SHOPIFY_ACCESS_TOKEN=your-access-token

# Cargus Configuration
CARGUS_SUBSCRIPTION_KEY=your-subscription-key
CARGUS_USERNAME=your-username
CARGUS_PASSWORD=your-password
```

## Usage Examples

### Basic Fulfillment

```javascript
import ShippingLabelController from './controllers/ShippingLabelController.js';

const controller = new ShippingLabelController();

// Fulfill order with customer notification
const result = await controller.fulfillOrder({
  body: {
    orderId: '123456789',
    notifyCustomer: true
  }
}, res);
```

### Programmatic Fulfillment

```javascript
import ShopifyService from './services/ShopifyService.js';
import CargusService from './services/CargusService.js';

const shopifyService = new ShopifyService(shopName, accessToken);
const cargusService = new CargusService(subscriptionKey, username, password);

// Get order and create AWB
const order = await shopifyService.getOrder(orderId);
const awbData = await convertOrderToAwbData(order);
const awb = await cargusService.createAwbWithPickup(awbData);

// Fulfill order with tracking
const fulfillmentResult = await shopifyService.fulfillOrderWithCargus(
  orderId, 
  awb, 
  true
);
```

## Monitoring and Logging

All operations are logged with structured data for monitoring:

```javascript
logger.info({
  orderId,
  fulfillmentId: fulfillment.id,
  awbBarcode: awb.BarCode,
  trackingUrl: trackingInfo.trackingUrl
}, 'Order fulfilled successfully with Cargus');
```

Monitor these log entries for successful fulfillments and any errors that require attention.

## Security

- HMAC verification for webhook endpoints
- Session verification for extension endpoints
- Input validation for all parameters
- Error message sanitization
- Structured logging without sensitive data exposure
