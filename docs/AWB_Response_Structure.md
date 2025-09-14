# Cargus AWB Creation Response Structure

Based on the API documentation and typical courier responses, the AWB creation response should contain:

## Expected Response Fields

```json
{
  "BarCode": "string",           // Primary tracking number (e.g., "7002123456789")
  "AwbId": "number",             // Internal AWB ID (could be missing)
  "OrderId": "string",           // Order identifier
  "Cost": "number",              // Shipping cost
  "TotalCost": "number",         // Total cost including extras
  "Status": "string",            // AWB status
  "CreationDate": "string",      // Creation timestamp
  "PickupDate": "string",        // Scheduled pickup date
  "EstimatedDelivery": "string", // Estimated delivery date
  "ServiceName": "string",       // Service type used
  "Weight": "number",            // Package weight
  "Pieces": "number"             // Number of pieces
}
```

## Alternative Response Structure

Some APIs return simpler responses:

```json
{
  "BarCode": "7002123456789",
  "Success": true,
  "Message": "AWB created successfully"
}
```

## Possible Field Names for ID

The ID field could be any of these:
- `AwbId`
- `Id`
- `awbId`
- `OrderId`
- `TrackingId`
- `ShipmentId`

## Common Response Examples

### Success Response
```json
{
  "BarCode": "7002123456789",
  "AwbId": 123456,
  "Cost": 15.50,
  "Status": "Created",
  "CreationDate": "2024-01-15T10:30:00",
  "ServiceName": "Economic Standard"
}
```

### Minimal Response
```json
{
  "BarCode": "7002123456789"
}
```

The actual structure depends on the specific Cargus API version and endpoint used.