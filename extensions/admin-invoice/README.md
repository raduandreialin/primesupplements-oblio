# Admin Invoice Extension

Generate invoices with Oblio directly from Shopify admin order details page.

## Features

- 📋 **Manual Invoice Creation** - Generate invoices on-demand from order details
- 🏢 **B2B/B2C Support** - Handle both individual and company invoices
- ✅ **ANAF Integration** - Real-time company validation for B2B invoices
- 🔄 **Invoice Retry** - Retry failed invoice generation with intelligent strategies
- 📊 **Invoice Preview** - Show invoice details before creation
- 📧 **Email Options** - Choose whether to send invoice via email
- 🏷️ **Smart Detection** - Auto-detect B2B vs B2C from order data

## Architecture

### Components Structure
```
src/
├── InvoiceExtension.tsx          # Main extension component
├── components/
│   ├── InvoiceForm.tsx           # Invoice generation form
│   ├── CompanyLookup.tsx         # ANAF company validation UI
│   ├── InvoicePreview.tsx        # Invoice preview before creation
│   ├── InvoiceResult.tsx         # Success/error results display
│   └── InvoiceStatus.tsx         # Current invoice status display
└── utils/
    ├── invoiceUtils.ts           # Invoice-specific utilities
    ├── anafUtils.ts              # ANAF validation helpers
    ├── oblioUtils.ts             # Oblio formatting helpers
    └── apiUtils.ts               # API communication utilities
```

### Extension Flow

1. **📋 Order Analysis** → Extension analyzes order data and detects invoice type
2. **🔍 Status Check** → Check if order already has invoice or errors
3. **🏢 Company Detection** → Auto-detect B2B orders and validate with ANAF
4. **📝 Invoice Form** → User reviews/edits invoice details and options
5. **👁️ Preview** → Show invoice preview before creation (optional)
6. **✅ Creation** → Generate invoice with Oblio using actions architecture
7. **📊 Results** → Show success with invoice link or detailed error information

### Key Features

#### 🎯 **Smart Invoice Detection**
- Automatically detect B2B vs B2C from billing address
- Extract CIF from company field or order notes
- Suggest appropriate invoice series and VAT rates

#### 🏢 **Enhanced ANAF Integration**
- Real-time company validation as user types CIF
- Auto-complete company details (name, address, registration)
- Visual feedback for valid/invalid companies
- Support for inactive company handling

#### 📋 **Flexible Invoice Creation**
- Support different invoice series (FCT, FACT, etc.)
- Handle partial invoices (select specific line items)
- Custom invoice dates and payment terms
- Optional email sending

#### 🔄 **Error Handling & Retry**
- Clear error messages with suggested fixes
- One-click retry with intelligent strategies
- Integration with existing error tagging system
- Automatic retry strategy selection based on error type

#### 📊 **Invoice Management**
- Show existing invoice status for orders
- Direct links to Oblio invoice viewer
- Invoice history and metadata display
- Support for invoice cancellation (if supported by Oblio)

## API Integration

The extension communicates with the backend through dedicated invoice API routes:

- `POST /invoice/create` - Create new invoice
- `POST /invoice/retry` - Retry failed invoice
- `GET /invoice/status/:orderId` - Check invoice status
- `POST /anaf/validate` - Validate company with ANAF
- `GET /anaf/search` - Search companies by CIF or name

## Usage

1. Navigate to any order details page in Shopify admin
2. Click "Generate Invoice" action button
3. Review auto-detected invoice details
4. For B2B orders, validate company information with ANAF
5. Customize invoice options as needed
6. Preview invoice (optional)
7. Generate invoice with one click
8. View results and access invoice link

## Error Handling

The extension provides comprehensive error handling:

- **Validation Errors** - Clear field-level validation messages
- **ANAF Errors** - Company validation feedback with suggestions
- **Oblio Errors** - Detailed API error messages with retry options
- **Network Errors** - Automatic retry with exponential backoff
- **Business Logic Errors** - Contextual error messages with fixes

## Development

### Building
```bash
npm run build
```

### Watching for changes
```bash
npm run dev
```

### Testing
```bash
npm run test
```

## Configuration

The extension uses the same backend configuration as the webhook-based invoice system:

- `OBLIO_EMAIL` - Oblio account email
- `OBLIO_API_TOKEN` - Oblio API token
- `OBLIO_COMPANY_CIF` - Company CIF for invoices
- `OBLIO_INVOICE_SERIES` - Default invoice series
- `OBLIO_MANAGEMENT` - Oblio management/warehouse ID

## Comparison with Webhook System

| Feature | Webhook (Current) | Extension (New) |
|---------|-------------------|-----------------|
| Trigger | Automatic on fulfillment | Manual on-demand |
| Validation | Limited | Real-time with preview |
| Error Handling | Basic tagging | Rich UI with retry |
| ANAF Integration | Background only | Interactive validation |
| User Control | None | Full control over options |
| Retry Logic | Basic webhook retry | Intelligent strategy-based |
| Preview | None | Full invoice preview |
| Flexibility | Fixed options | Customizable per invoice |

The extension complements the existing webhook system, providing manual control and enhanced features while maintaining the same backend infrastructure and actions architecture.
