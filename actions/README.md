# Actions Architecture

## Overview

The actions directory contains business logic classes that follow the **Single Responsibility Principle**. Each action handles one specific domain operation and can be used independently or composed together.

## Architecture Benefits

### 🎯 **Single Responsibility**
Each action class has one clear purpose:
- `CreateShippingLabelAction` - AWB creation with shipping providers
- `FulfillShopifyOrderAction` - Shopify order fulfillment
- `UpdateShopifyOrderAction` - Order metadata and tag management  
- `CancelAwbAction` - AWB cancellation and webhook processing

### 🔧 **Testability**
- Actions can be unit tested in isolation
- Dependencies are injected for easy mocking
- Clear input/output contracts

### 🔄 **Reusability**
- Actions can be used in different controllers
- Can be composed for complex workflows
- Easy to extend with new functionality

### 🛠️ **Maintainability**
- Changes to shipping providers only affect relevant actions
- Clear separation of concerns
- Easy to debug and troubleshoot

## Action Classes

### CreateShippingLabelAction

**Purpose**: Create shipping labels (AWBs) with courier services

**Dependencies**: 
- Shipping adapters (Cargus, Fan Courier, etc.)

**Key Methods**:
- `execute(params)` - Create AWB and return tracking info
- `_extractCost(awb)` - Handle different AWB response formats
- `_extractAwbId(awb)` - Extract AWB ID from various formats

**Usage**:
```javascript
const action = new CreateShippingLabelAction();
const result = await action.execute({
    order,
    packageInfo,
    service,
    customShippingAddress,
    codAmount,
    insuranceValue
});
```

### FulfillShopifyOrderAction

**Purpose**: Mark Shopify orders as fulfilled with tracking info

**Dependencies**:
- ShopifyService

**Key Methods**:
- `execute(params)` - Fulfill order with tracking
- `canFulfill(orderId)` - Check fulfillment eligibility

**Usage**:
```javascript
const action = new FulfillShopifyOrderAction();
const result = await action.execute({
    orderId,
    awb,
    notifyCustomer: true,
    carrier: 'Cargus'
});
```

### UpdateShopifyOrderAction

**Purpose**: Update orders with shipping metadata, tags, and attributes

**Dependencies**:
- ShopifyService

**Key Methods**:
- `execute(params)` - Update order with shipping info
- `addCancellationInfo(orderId, awbBarcode)` - Add cancellation metadata
- `markCancellationFailed(orderId)` - Mark failed cancellations

**Usage**:
```javascript
const action = new UpdateShopifyOrderAction();
const result = await action.execute({
    orderId,
    awb,
    carrier,
    trackingUrl,
    additionalData
});
```

### CancelAwbAction

**Purpose**: Cancel AWBs and process cancellation webhooks

**Dependencies**:
- Shipping adapters

**Key Methods**:
- `execute(params)` - Cancel AWB with shipping provider
- `processWebhookCancellation(fulfillment)` - Handle Shopify webhooks
- `canCancel(awbBarcode)` - Check cancellation eligibility

**Usage**:
```javascript
const action = new CancelAwbAction();
const result = await action.execute({
    awbBarcode,
    fulfillmentId,
    orderId,
    reason: 'Order cancellation'
});
```

## Controller Integration

The `ShippingLabelController` now orchestrates these actions:

```javascript
class ShippingLabelController {
    constructor() {
        this.createShippingLabelAction = new CreateShippingLabelAction();
        this.fulfillOrderAction = new FulfillShopifyOrderAction();
        this.updateOrderAction = new UpdateShopifyOrderAction();
        this.cancelAwbAction = new CancelAwbAction();
    }

    async createFromExtension(req, res) {
        // 1. Create shipping label
        const labelResult = await this.createShippingLabelAction.execute(...);
        
        // 2. Fulfill order
        const fulfillmentResult = await this.fulfillOrderAction.execute(...);
        
        // 3. Update order metadata
        await this.updateOrderAction.execute(...);
        
        // 4. Return response
        res.json(responseData);
    }
}
```

## Error Handling

Actions return structured results with success/failure information:

```javascript
// Success
{
    success: true,
    trackingNumber: "ABC123",
    cost: "15.50 RON",
    carrier: "Cargus"
}

// Failure
{
    success: false,
    error: "Address validation failed",
    requiresManualIntervention: true
}
```

## Testing Strategy

### Unit Testing Actions
```javascript
describe('CreateShippingLabelAction', () => {
    it('should create AWB successfully', async () => {
        const mockAdapter = {
            convertOrderToAwbData: jest.fn().mockResolvedValue(awbData),
            createAwb: jest.fn().mockResolvedValue(awb),
            getTrackingUrl: jest.fn().mockReturnValue(trackingUrl),
            getCarrierName: jest.fn().mockReturnValue('Cargus')
        };
        
        const action = new CreateShippingLabelAction(mockAdapter);
        const result = await action.execute(params);
        
        expect(result.success).toBe(true);
        expect(result.trackingNumber).toBe('ABC123');
    });
});
```

### Integration Testing Controller
```javascript
describe('ShippingLabelController', () => {
    it('should orchestrate shipping label creation flow', async () => {
        const req = { body: validRequestData };
        const res = { json: jest.fn() };
        
        await controller.createFromExtension(req, res);
        
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            trackingNumber: expect.any(String),
            cost: expect.any(String)
        });
    });
});
```

## Future Extensions

### Adding New Couriers
1. Create new adapter in `adapters/` directory
2. Register in `AdapterFactory`
3. Actions automatically support new courier

### Adding New Actions
1. Create new action class following the pattern
2. Add to `actions/index.js` exports
3. Inject into controller as needed

### Workflow Orchestration
Actions can be composed for complex workflows:

```javascript
// Custom workflow for B2B orders
async processB2BOrder(orderData) {
    const labelResult = await this.createShippingLabelAction.execute(...);
    const invoiceResult = await this.createInvoiceAction.execute(...);
    const fulfillmentResult = await this.fulfillOrderAction.execute(...);
    
    return { labelResult, invoiceResult, fulfillmentResult };
}
```

This architecture provides a solid foundation for scalable, maintainable shipping operations while keeping each component focused on its specific responsibility.
