# Shipping Adapter Architecture

## Overview

The shipping system has been refactored to use a clean adapter pattern that makes it easy to add support for multiple courier services. This architecture separates courier-specific logic from the main application logic, making the system more maintainable and extensible.

## Architecture

```
adapters/
├── BaseAdapter.js          # Abstract base class defining the adapter interface
├── CargusAdapter.js        # Cargus-specific implementation
├── AdapterFactory.js       # Factory for creating adapter instances
└── index.js               # Module exports

controllers/
└── ShippingLabelController.js  # Uses adapters through the factory
```

## Components

### 1. BaseAdapter (Abstract Interface)

The `BaseAdapter` class defines the contract that all shipping adapters must implement:

```javascript
class BaseAdapter {
    async convertOrderToAwbData(order, packageInfo, service, ...) { }
    async createAwb(awbData) { }
    getTrackingUrl(trackingNumber) { }
    getCarrierName() { }
}
```

### 2. CargusAdapter (Implementation)

The `CargusAdapter` extends `BaseAdapter` and implements all methods for Cargus courier service:

- **Order Conversion**: Converts Shopify orders to Cargus AWB format
- **AWB Creation**: Creates AWBs using the CargusService
- **Address Validation**: Validates Romanian addresses against Cargus database
- **Service Mapping**: Maps service types to Cargus service IDs

### 3. AdapterFactory (Factory Pattern)

The `AdapterFactory` provides a centralized way to create adapter instances:

```javascript
// Available adapters
AdapterFactory.ADAPTERS = {
    CARGUS: 'cargus',
    // Future: FAN_COURIER: 'fan_courier', DPD: 'dpd', etc.
}

// Create adapter
const adapter = AdapterFactory.createAdapter('cargus');
```

### 4. ShippingLabelController (Consumer)

The controller uses adapters through the factory, making it courier-agnostic:

```javascript
class ShippingLabelController {
    constructor() {
        // Uses factory to create adapter
        this.shippingAdapter = AdapterFactory.createAdapter(AdapterFactory.ADAPTERS.CARGUS);
    }
    
    async createFromExtension(req, res) {
        // Generic adapter methods
        const awbData = await this.shippingAdapter.convertOrderToAwbData(...);
        const awb = await this.shippingAdapter.createAwb(awbData);
        const trackingUrl = this.shippingAdapter.getTrackingUrl(awb.BarCode);
        const carrier = this.shippingAdapter.getCarrierName();
    }
}
```

## Benefits

### 1. **Separation of Concerns**
- Courier-specific logic is isolated in adapters
- Controller focuses on application flow, not courier details
- Clean separation between business logic and integration logic

### 2. **Extensibility**
- Easy to add new couriers by creating new adapters
- No changes required to the main controller
- Consistent interface for all courier services

### 3. **Maintainability**
- Changes to courier APIs only affect their specific adapter
- Easier to test individual courier integrations
- Clear structure makes code easier to understand

### 4. **Flexibility**
- Can easily switch between different couriers
- Future support for multi-courier scenarios
- Configuration-driven courier selection

## Current Implementation

### Supported Couriers
- ✅ **Cargus** - Full implementation with AWB creation, tracking, and fulfillment

### Planned Couriers
- 🔄 **Fan Courier** - Romanian courier service
- 🔄 **DPD** - International express delivery
- 🔄 **GLS** - European parcel service

## How It Works

### 1. Extension Request Flow

```
Extension → ShippingLabelController → AdapterFactory → CargusAdapter → CargusService
                    ↓
            ShopifyService (Fulfillment)
                    ↓
            Response with AWB + Fulfillment Data
```

### 2. Key Features

- **AWB Creation**: Creates shipping labels with courier
- **Order Fulfillment**: Automatically fulfills Shopify orders with tracking
- **Address Validation**: Validates and maps addresses to courier database
- **Service Selection**: Maps service types to courier-specific services
- **Error Handling**: Comprehensive error logging and handling
- **Metadata Storage**: Stores shipping details in Shopify order metafields

## Adding New Couriers

To add support for a new courier service:

### 1. Create New Adapter

```javascript
// adapters/FanCourierAdapter.js
import BaseAdapter from './BaseAdapter.js';
import FanCourierService from '../services/FanCourierService.js';

class FanCourierAdapter extends BaseAdapter {
    async convertOrderToAwbData(order, packageInfo, ...) {
        // Convert to Fan Courier format
    }
    
    async createAwb(awbData) {
        // Create AWB with Fan Courier
    }
    
    getTrackingUrl(trackingNumber) {
        return `https://www.fancourier.ro/awb-tracking/?awb=${trackingNumber}`;
    }
    
    getCarrierName() {
        return 'Fan Courier';
    }
}
```

### 2. Update AdapterFactory

```javascript
// adapters/AdapterFactory.js
static ADAPTERS = {
    CARGUS: 'cargus',
    FAN_COURIER: 'fan_courier', // Add new adapter
};

static createAdapter(adapterType) {
    switch (adapterType.toLowerCase()) {
        case this.ADAPTERS.CARGUS:
            return new CargusAdapter();
        case this.ADAPTERS.FAN_COURIER: // Add case
            return new FanCourierAdapter();
        // ...
    }
}
```

### 3. Update Exports

```javascript
// adapters/index.js
import FanCourierAdapter from './FanCourierAdapter.js';

export {
    BaseAdapter,
    CargusAdapter,
    FanCourierAdapter, // Add export
    AdapterFactory
};
```

### 4. Configuration (Optional)

Make adapter selection configurable:

```javascript
// config/AppConfig.js
export default {
    shipping: {
        defaultAdapter: process.env.DEFAULT_SHIPPING_ADAPTER || 'cargus'
    }
};

// controllers/ShippingLabelController.js
constructor() {
    this.shippingAdapter = AdapterFactory.createAdapter(config.shipping.defaultAdapter);
}
```

## Testing

Each adapter should have comprehensive tests:

```javascript
// _tests/adapters/cargus-adapter-test.js
import { CargusAdapter } from '../../adapters/index.js';

const adapter = new CargusAdapter();
// Test order conversion, AWB creation, etc.
```

## Error Handling

All adapters implement consistent error handling:

- **Validation Errors**: Address, package, or service validation failures
- **API Errors**: Courier service API failures
- **Network Errors**: Connection issues
- **Configuration Errors**: Missing credentials or configuration

## Future Enhancements

### 1. **Multi-Courier Support**
- Allow selection of courier per order
- Automatic courier selection based on destination
- Fallback courier if primary fails

### 2. **Rate Shopping**
- Compare rates across multiple couriers
- Select best rate automatically
- Present rate options to user

### 3. **Advanced Features**
- Bulk label creation
- Scheduled pickups
- Return label generation
- Insurance and COD support

### 4. **Monitoring**
- Adapter performance metrics
- Success/failure rates per courier
- Cost tracking and reporting

## Migration Notes

The refactoring maintains full backward compatibility:

- ✅ All existing functionality preserved
- ✅ Same API endpoints and responses
- ✅ No changes required to the extension
- ✅ All tests continue to pass

The main improvements:
- 🔥 Removed unused methods from controller
- 🚀 Added automatic order fulfillment after AWB creation
- 🏗️ Clean adapter architecture for future expansion
- 📝 Better error handling and logging
- 🧪 Improved testability and maintainability
