# Extension Utilities

This folder contains utility functions organized by functionality to keep the main extension code clean and maintainable.

## 📁 File Structure

```
utils/
├── addressUtils.ts     # Address validation and normalization
├── orderUtils.ts       # Order calculations and processing  
├── apiUtils.ts         # API communication and error handling
├── index.ts           # Main exports file
└── README.md          # This documentation
```

## 🛠️ Utility Functions

### 📍 **addressUtils.ts**

**Address validation and normalization for Romanian addresses:**

- `normalizeRomanianCounty(county: string)` - Converts diacritics and maps county variations to Cargus-compatible names
- `normalizeRomanianCity(city: string)` - Removes diacritics and standardizes city names
- `validateShippingAddress(address: any)` - Validates required shipping address fields
- `getFieldDisplayName(field: string)` - Returns user-friendly field names for validation errors

**Example:**
```typescript
import { normalizeRomanianCounty } from './utils';

const county = normalizeRomanianCounty('Brașov'); // Returns: 'Brasov'
```

### 📦 **orderUtils.ts**

**Order calculations and processing:**

- `calculateTotalWeight(lineItems: any)` - Calculates total weight from order line items with unit conversion
- `calculateCODAmount(order: any)` - Calculates Cash on Delivery amount based on payment status
- `getOrderStatusBadge(order: any)` - Returns badge properties for order financial status

**Example:**
```typescript
import { calculateCODAmount } from './utils';

const codAmount = calculateCODAmount(order); // Returns: '150.00'
```

### 🌐 **apiUtils.ts**

**API communication and error handling:**

- `handleApiError(error: any)` - Converts technical errors to user-friendly messages
- `parseErrorResponse(response: Response)` - Extracts error messages from API responses
- `makeApiRequest(url: string, options: RequestInit)` - Makes API requests with enhanced error handling

**Example:**
```typescript
import { makeApiRequest } from './utils';

const result = await makeApiRequest('/api/endpoint', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

## 🚀 **Usage**

### Import All Functions
```typescript
import {
  normalizeRomanianCounty,
  calculateTotalWeight,
  makeApiRequest
} from './utils';
```

### Import Specific Categories
```typescript
import { normalizeRomanianCounty, validateShippingAddress } from './utils/addressUtils';
import { calculateTotalWeight, calculateCODAmount } from './utils/orderUtils';
import { makeApiRequest, handleApiError } from './utils/apiUtils';
```

## 🎯 **Benefits**

1. **🧹 Clean Code**: Main extension file is focused on UI logic
2. **🔄 Reusability**: Utilities can be used across different parts of the extension
3. **🧪 Testability**: Each utility can be unit tested independently
4. **📖 Maintainability**: Related functions are grouped together
5. **🔧 Type Safety**: All utilities are written in TypeScript

## 📋 **Romanian Address Mappings**

The address utilities handle common Romanian address variations:

### Counties (Județe)
```
Brașov → Brasov
Timișoara → Timis  
Bucharest → Bucuresti
Cluj-Napoca → Cluj
Târgu-Mureș → Mures
Satu-Mare → Satu Mare
```

### Cities (Orașe)
```
Brașov → Brasov
Timișoara → Timisoara
Iași → Iasi
Constanța → Constanta
Galați → Galati
Ploiești → Ploiesti
```

## 🔧 **Error Handling**

The API utilities provide user-friendly error messages for common issues:

- **Network Errors**: "Cannot reach the server. Please check your internet connection."
- **Timeout**: "The server is taking too long to respond."
- **Authentication**: "Invalid credentials."
- **Server Errors**: "Internal server error occurred."

## 📝 **Adding New Utilities**

To add new utility functions:

1. Create or update the appropriate file (`addressUtils.ts`, `orderUtils.ts`, `apiUtils.ts`)
2. Add the function with proper TypeScript types
3. Export the function from the file
4. Update `index.ts` to export the new function
5. Update this README with documentation

**Example:**
```typescript
// In orderUtils.ts
export const calculateShippingCost = (weight: number, distance: number): number => {
  // Implementation
};

// In index.ts
export * from './orderUtils'; // Already exports everything

// Usage in ActionExtension.tsx
import { calculateShippingCost } from './utils';
```
