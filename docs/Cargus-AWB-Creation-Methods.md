# Cargus AWB Creation Methods

## Overview

The Cargus API provides two different methods for creating AWBs (Air Waybills), each returning different response formats.

## Method 1: Standard AwbPickup

**Endpoint:** `POST /AwbPickup`  
**Returns:** Just the AWB ID as a number

```javascript
// Response example
1160260118  // Just a number
```

**Use case:** When you only need the AWB ID and will fetch full details later.

## Method 2: AwbPickup with GetAwb (Recommended)

**Endpoint:** `POST /AwbPickup/WithGetAwb`  
**Returns:** Full AWB object with all details

```javascript
// Response example
{
  "AwbId": 1160260118,
  "BarCode": "CRG1160260118", 
  "Status": "Created",
  "Cost": 15.50,
  "TotalCost": 15.50,
  "CreationDate": "2025-01-15T10:30:00",
  "ServiceName": "Economic Standard"
}
```

**Use case:** For integrations that need immediate access to tracking information and AWB details.

## Implementation Changes

### Before (Problematic)
```javascript
// Using standard AwbPickup endpoint
return this.request('POST', '/AwbPickup', data);
// Returns: 1160260118 (number)
// Caused: "Cannot use 'in' operator to search for 'BarCode' in 1160260118"
```

### After (Fixed)
```javascript
// Using WithGetAwb endpoint
return this.request('POST', '/AwbPickup/WithGetAwb', data);
// Returns: { AwbId: 1160260118, BarCode: "CRG1160260118", ... }
// Works: Can access awb.BarCode directly
```

## Error Handling

The adapter now includes robust error handling for different response formats:

1. **Full Object Response** - Uses directly
2. **Missing BarCode** - Generates from AwbId/Id
3. **Invalid Response** - Throws descriptive error

## Benefits

- ✅ Eliminates "Cannot use 'in' operator" errors
- ✅ Provides immediate access to tracking information
- ✅ Reduces API calls (no need to fetch AWB details separately)
- ✅ Better error handling and logging
- ✅ Consistent response format for downstream processing

## Files Modified

- `services/CargusService.js` - Changed endpoint to `/AwbPickup/WithGetAwb`
- `adapters/CargusAdapter.js` - Simplified response handling logic
- `docs/cargus_api_docs.md` - Updated documentation
- `_tests/awb-response-handling-test.js` - Updated tests

## Testing

Run the test to verify the fix:
```bash
node _tests/awb-response-handling-test.js
```

This change ensures that the Shopify fulfillment process receives properly structured AWB data with all necessary fields for tracking and customer notification.
