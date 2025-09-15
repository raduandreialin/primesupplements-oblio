# Shipping Adapters

This folder contains shipping courier adapters that implement a consistent interface for different courier services.

## Structure

- **`BaseAdapter.js`** - Abstract base class defining the adapter interface
- **`CargusAdapter.js`** - Cargus courier implementation
- **`AdapterFactory.js`** - Factory for creating adapter instances
- **`index.js`** - Module exports

## Usage

```javascript
import { AdapterFactory } from './adapters/index.js';

// Create a Cargus adapter
const adapter = AdapterFactory.createAdapter('cargus');

// Use the adapter
const awbData = await adapter.convertOrderToAwbData(order, packageInfo, ...);
const awb = await adapter.createAwb(awbData);
const trackingUrl = adapter.getTrackingUrl(awb.BarCode);
const carrier = adapter.getCarrierName();
```

## Available Adapters

- ✅ **Cargus** (`'cargus'`) - Romanian courier service

## Adding New Adapters

1. Create a new adapter class extending `BaseAdapter`
2. Implement all required methods
3. Add the adapter to `AdapterFactory`
4. Export from `index.js`
5. Add tests

See the [Shipping Adapter Architecture](../docs/Shipping-Adapter-Architecture.md) documentation for detailed instructions.

## Interface

All adapters must implement:

```javascript
class YourAdapter extends BaseAdapter {
    async convertOrderToAwbData(order, packageInfo, service, customShippingAddress, codAmount, insuranceValue, openPackage, saturdayDelivery, morningDelivery, shipmentPayer, observations, envelopes) {
        // Convert order to courier-specific AWB format
    }
    
    async createAwb(awbData) {
        // Create AWB with courier service
    }
    
    getTrackingUrl(trackingNumber) {
        // Return tracking URL for the courier
    }
    
    getCarrierName() {
        // Return courier name
    }
}
```
