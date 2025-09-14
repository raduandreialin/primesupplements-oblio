# CargusService Documentation

A comprehensive Node.js service for integrating with the Cargus API v3, providing full functionality for courier services including AWB management, tracking, and delivery operations.

## Table of Contents

- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Basic Usage](#basic-usage)
- [API Methods](#api-methods)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

## Installation & Setup

### Prerequisites

1. **Cargus API Account**: Register at the Cargus portal and obtain:
   - API Subscription Key
   - Username and Password
   - Approved API access

2. **Environment Variables**: Set the following in your `.env` file:
```env
CARGUS_SUBSCRIPTION_KEY=your_subscription_key_here
CARGUS_USERNAME=your_username_here
CARGUS_PASSWORD=your_password_here
CARGUS_BASE_URL=https://urgentcargus.portal.azure-api.net/api
```

### Import and Initialize

```javascript
import CargusService from "./services/CargusService.js";
import config from "./config/AppConfig.js";

const cargusService = new CargusService(
    config.cargus.subscriptionKey,
    config.cargus.username,
    config.cargus.password
);
```

## Configuration

The service automatically handles:
- **Token Management**: 24-hour token lifecycle with automatic refresh
- **Request Retry Logic**: Exponential backoff for failed requests
- **Error Handling**: Comprehensive error logging and recovery
- **Rate Limiting**: Built-in request throttling

## Basic Usage

### Authentication

```javascript
// Manual login (usually not needed - automatic)
const token = await cargusService.login();

// Verify token
const isValid = await cargusService.verifyToken();
```

### Geography Data

```javascript
// Get all countries
const countries = await cargusService.getCountries();

// Get counties in Romania (countryId: 1)
const counties = await cargusService.getCounties(1);

// Get localities in Bucharest (countryId: 1, countyId: 1)
const localities = await cargusService.getLocalities(1, 1);

// Get streets in a locality
const streets = await cargusService.getStreets(localityId);
```

## API Methods

### Authentication Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `login()` | Authenticate and get 24-hour token | `Promise<string>` |
| `verifyToken()` | Check if current token is valid | `Promise<boolean>` |

### Geography Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getCountries()` | Get list of countries | - | `Promise<Array>` |
| `getCounties(countryId)` | Get counties in country | `countryId: number` | `Promise<Array>` |
| `getLocalities(countryId, countyId)` | Get localities in county | `countryId: number, countyId: number` | `Promise<Array>` |
| `getStreets(localityId)` | Get streets in locality | `localityId: number` | `Promise<Array>` |

### Pickup Location Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getPickupLocations()` | Get pickup locations for client | - | `Promise<Array>` |
| `getActivePickupPoints()` | Get active pickup points | - | `Promise<Array>` |
| `addPickupLocation(data)` | Add new pickup location | `data: Object` | `Promise<Object>` |
| `updatePickupLocation(data)` | Update pickup location | `data: Object` | `Promise<Object>` |
| `assignPickupPointToUser(locationId)` | Assign pickup point to user | `locationId: number` | `Promise<number>` |

### Rate Calculation Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getPriceTables()` | Get contracted price tables | - | `Promise<Array>` |
| `calculateShipping(data)` | Calculate shipping cost | `data: Object` | `Promise<Object>` |

### AWB Management Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `createAwbWithPickup(data)` | Create AWB with pickup | `data: Object` | `Promise<Object>` |
| `createAwb(data)` | Create AWB from pickup location | `data: Object` | `Promise<Object>` |
| `deleteAwb(barCode)` | Delete AWB (no checkpoints) | `barCode: string` | `Promise<Object>` |
| `getAwbByBarcode(barCode)` | Get AWB by barcode | `barCode: string` | `Promise<Object>` |
| `getAwbByOrderId(orderId)` | Get AWB by order ID | `orderId: string` | `Promise<Object>` |
| `getAwbsByDate(from, to, page, items)` | Get AWBs by date range | `from: string, to: string, page?: number, items?: number` | `Promise<Array>` |

### Tracking & Documents

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `printAwbDocuments(barCodes, type, format, printOnce)` | Print AWB documents | `barCodes: Array, type?: string, format?: number, printOnce?: number` | `Promise<string>` |
| `trackShipmentsWithRedirect(barCodes)` | Track shipments with redirects | `barCodes: Array` | `Promise<Array>` |
| `getReturningAwbs(date)` | Get returning AWBs | `date: string` | `Promise<Array>` |
| `getDeltaEvents(fromDate, toDate)` | Get events in date range | `fromDate: string, toDate: string` | `Promise<Array>` |
| `getConfirmationPicture(barCode)` | Get delivery confirmation image | `barCode: string` | `Promise<string>` |

### Order Management

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `manageOrder(locationId, action, startDate, endDate)` | Launch/cancel order | `locationId: number, action: number, startDate: string, endDate: string` | `Promise<Object>` |
| `manageAllOrders(action, startDate, endDate)` | Launch/cancel all orders | `action: number, startDate: string, endDate: string` | `Promise<Object>` |
| `getOrdersByLocation(locationId, status, page, items)` | Get orders by location | `locationId: number, status: number, page?: number, items?: number` | `Promise<Array>` |
| `getOrdersByDate(fromDate, toDate, page, items)` | Get orders by date | `fromDate: string, toDate: string, page?: number, items?: number` | `Promise<Array>` |
| `getOrderById(orderId)` | Get order by ID | `orderId: string` | `Promise<Object>` |

### Cash on Delivery

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getCodByDate(fromDate, toDate)` | Get COD by date range | `fromDate: string, toDate: string` | `Promise<Array>` |
| `getRefundsByDate(deductionDate)` | Get refunds after date | `deductionDate: string` | `Promise<Array>` |
| `getRefundByBarcode(barCode)` | Get refund by barcode | `barCode: string` | `Promise<Object>` |

### Invoice Management

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `getInvoicesByDate(fromDate, toDate, page, items)` | Get invoices by date | `fromDate: string, toDate: string, page?: number, items?: number` | `Promise<Array>` |
| `getInvoicePdf(invoiceId)` | Get invoice PDF | `invoiceId: number` | `Promise<string>` |

## Examples

### 1. Calculate Shipping Cost

```javascript
const shippingCost = await cargusService.calculateShipping({
    fromLocalityId: 1793631, // Bucharest
    toLocalityId: 1793632,   // Cluj-Napoca
    parcels: 2,
    totalWeight: 5.5,
    serviceId: 34,           // Economic Standard
    declaredValue: 250,
    shipmentPayer: 1         // Sender pays
});

console.log(`Total shipping cost: ${shippingCost.GrandTotal} RON`);
```

### 2. Create AWB with Pickup

```javascript
const awbData = {
    pickupStartDate: "2024-01-15T09:00",
    pickupEndDate: "2024-01-15T17:00",
    sender: {
        Name: "My Company SRL",
        CountyName: "Bucuresti",
        LocalityName: "Bucuresti",
        AddressText: "Calea Victoriei 123, Sector 1",
        ContactPerson: "John Doe",
        PhoneNumber: "0723456789",
        CodPostal: "010101",
        Email: "contact@mycompany.ro"
    },
    recipient: {
        LocationId: 201165677 // Existing pickup location
    },
    parcels: 1,
    totalWeight: 2.5,
    serviceId: 34,
    declaredValue: 100,
    observations: "Fragile package",
    parcelCodes: [{
        Code: "0",
        Type: 1,
        Weight: 2.5,
        Length: 30,
        Width: 20,
        Height: 15,
        ParcelContent: "Electronics"
    }]
};

const awb = await cargusService.createAwbWithPickup(awbData);
console.log(`AWB created with barcode: ${awb.BarCode}`);
```

### 3. Track Shipment

```javascript
const trackingInfo = await cargusService.trackShipmentsWithRedirect(['AWB123456789']);
console.log('Tracking info:', trackingInfo);

// Get confirmation picture if delivered
const confirmationImage = await cargusService.getConfirmationPicture('AWB123456789');
// confirmationImage is base64 encoded
```

### 4. Add Pickup Location

```javascript
const newLocation = await cargusService.addPickupLocation({
    name: "Warehouse Location",
    countyId: 1,
    countyName: "Bucuresti",
    localityId: 1793631,
    localityName: "Bucuresti",
    streetName: "Strada Depozitului",
    buildingNumber: "45A",
    addressText: "Strada Depozitului 45A, Sector 6",
    contactPerson: "Warehouse Manager",
    phoneNumber: "0723111222",
    postalCode: "060042",
    email: "warehouse@company.ro",
    automaticEOD: "18:00"
});
```


## Error Handling

The service includes comprehensive error handling:

```javascript
try {
    const result = await cargusService.calculateShipping(data);
} catch (error) {
    if (error.response?.status === 401) {
        console.log('Authentication failed');
    } else if (error.response?.status === 429) {
        console.log('Rate limit exceeded');
    } else {
        console.log('API error:', error.message);
    }
}
```

## Helper Methods

### Date Formatting

```javascript
// For endpoints expecting mm-dd-yyyy
const dateMMDD = CargusService.formatDateMMDDYYYY(new Date());

// For endpoints expecting yyyy-mm-dd
const dateYYYYMM = CargusService.formatDateYYYYMMDD(new Date());
```

### Service ID by Weight

```javascript
const serviceId = CargusService.getServiceIdByWeight(25); // Returns 34 for ≤31kg
```

### Phone Validation

```javascript
const isValid = CargusService.isValidRomanianPhone("0723456789"); // Returns true
```

## Service IDs

| ID | Service Name | Weight Limit |
|----|--------------|--------------|
| 34 | Economic Standard | ≤31kg |
| 35 | Standard Plus | 31-50kg |
| 36 | Pallet Standard | Heavy packages |
| 39 | Multipiece | Multiple pieces |

## Best Practices

1. **Token Management**: Let the service handle authentication automatically
2. **Error Handling**: Always wrap API calls in try-catch blocks
3. **Rate Limiting**: The service includes built-in retry logic
4. **Logging**: All operations are logged with appropriate detail levels
5. **Validation**: Use helper methods for phone and date validation
6. **Environment Variables**: Keep credentials secure in environment variables

## Limitations

- Maximum 31kg per piece for multipiece service
- Maximum 15 pieces per shipment
- Maximum 465kg total weight per shipment
- Maximum 9 envelopes per shipment
- Tokens are valid for 24 hours

## Troubleshooting

### Common Issues

#### 503 Service Unavailable
- **Cause**: Cargus API service is temporarily down or overloaded
- **Solution**: Wait and retry later, or contact Cargus support
- **Check**: Service status at Cargus portal

#### 401 Unauthorized
- **Cause**: Invalid credentials or expired subscription
- **Solution**: Verify subscription key, username, and password
- **Check**: API subscription status in Cargus portal

#### 403 Forbidden
- **Cause**: API access not approved or insufficient permissions
- **Solution**: Ensure API subscription is approved by administrator
- **Check**: Subscription approval status

#### Connection Errors (ENOTFOUND, ECONNREFUSED)
- **Cause**: Network connectivity or incorrect base URL
- **Solution**: Check internet connection and verify base URL
- **Check**: Try accessing the API portal directly

### Testing Connectivity

Use the built-in connectivity test:

```javascript
const cargusService = new CargusService(subscriptionKey, username, password);
const results = await cargusService.testConnectivity();
console.log(results);
```

### Environment Variables

Ensure these are set in your `.env` file:

```env
CARGUS_SUBSCRIPTION_KEY=your_32_character_subscription_key
CARGUS_USERNAME=your_cargus_username
CARGUS_PASSWORD=your_cargus_password
```

### API Endpoints

The service uses these base URLs (try both if one fails):
- Primary: `https://urgentcargus.azure-api.net/api`
- Alternative: `https://urgentcargus.portal.azure-api.net/api`

## Support

For API-specific issues, consult the official Cargus API documentation or contact Cargus support. For service implementation issues, check the logs for detailed error information.
