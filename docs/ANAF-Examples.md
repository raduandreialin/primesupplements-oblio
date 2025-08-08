# ANAF Service Usage Examples

## Quick Start

```javascript
import AnafService from '../services/AnafService.js';

const anafService = new AnafService();
```

## Example 1: Basic Company Verification

```javascript
async function verifyCompany() {
    try {
        // Verify a Romanian company
        const company = await anafService.verifyCompany('RO37311090');
        const info = anafService.extractCompanyInfo(company);
        
        console.log('Company Details:');
        console.log(`Name: ${info.name}`);
        console.log(`CUI: ${info.cui}`);
        console.log(`Address: ${info.address}`);
        console.log(`VAT Payer: ${info.vatPayer ? 'Yes' : 'No'}`);
        console.log(`Active: ${!info.inactive ? 'Yes' : 'No'}`);
        console.log(`E-Invoice: ${info.eInvoiceRegistered ? 'Yes' : 'No'}`);
        
    } catch (error) {
        console.error('Verification failed:', error.message);
    }
}
```

## Example 2: Shopify Order Processing

```javascript
// Simulate a Shopify order with company information
const shopifyOrder = {
    id: 12345,
    billing_address: {
        company: "OBLIO SOFTWARE SRL - CUI: RO37311090",
        first_name: "John",
        last_name: "Doe",
        address1: "Str. Exemplu 123",
        city: "Bucuresti",
        country: "Romania"
    },
    customer: {
        email: "john@example.com"
    },
    line_items: [
        {
            title: "Product 1",
            price: "100.00",
            quantity: 2
        }
    ]
};

async function processOrderWithAnaf(order) {
    try {
        // Extract CUI from order (this is done automatically in InvoiceController)
        const cui = extractCUIFromOrder(order);
        
        if (cui) {
            console.log(`Company order detected: CUI ${cui}`);
            
            // Get company data from ANAF
            const anafCompany = await anafService.getCompanyForOblio(cui);
            
            // Create enriched invoice data
            const invoiceData = {
                cif: process.env.OBLIO_COMPANY_CIF,
                client: anafCompany,
                products: order.line_items.map(item => ({
                    name: item.title,
                    price: parseFloat(item.price),
                    quantity: item.quantity,
                    measuringUnit: 'buc',
                    currency: 'RON'
                })),
                seriesName: 'FCT',
                issueDate: new Date().toISOString().split('T')[0],
                language: 'RO'
            };
            
            console.log('Invoice data with ANAF enrichment:', invoiceData);
            
        } else {
            console.log('Individual customer order - no company verification needed');
        }
        
    } catch (error) {
        console.error('Order processing failed:', error.message);
    }
}

function extractCUIFromOrder(order) {
    // Simple CUI extraction (the real implementation is more comprehensive)
    const company = order.billing_address?.company;
    if (company) {
        const match = company.match(/(?:CUI|CIF|RO)?\\s*:?\\s*([0-9]{2,10})/i);
        return match ? match[1] : null;
    }
    return null;
}
```

## Example 3: Batch Company Verification

```javascript
async function verifyMultipleCompanies() {
    const companies = ['37311090', '12345678', '87654321'];
    
    try {
        const results = await anafService.verifyCompanies(companies);
        
        console.log('Batch Verification Results:');
        console.log(`Total requested: ${companies.length}`);
        console.log(`Found: ${results.found.length}`);
        console.log(`Not found: ${results.notFound.length}`);
        
        // Process found companies
        results.found.forEach((company, index) => {
            const info = anafService.extractCompanyInfo(company);
            console.log(`${index + 1}. ${info.name} (${info.cui})`);
        });
        
        // Report not found
        if (results.notFound.length > 0) {
            console.log('Not found CUIs:', results.notFound);
        }
        
    } catch (error) {
        console.error('Batch verification failed:', error.message);
    }
}
```

## Example 4: VAT Status Checking

```javascript
async function checkVATStatus() {
    const testCompanies = ['37311090', '12345678'];
    
    for (const cui of testCompanies) {
        try {
            const isVATActive = await anafService.isVATPayerActive(cui);
            console.log(`CUI ${cui}: ${isVATActive ? 'Active VAT Payer' : 'Not VAT Payer/Inactive'}`);
        } catch (error) {
            console.log(`CUI ${cui}: Verification failed - ${error.message}`);
        }
    }
}
```

## Example 5: Error Handling Patterns

```javascript
async function robustCompanyVerification(cui) {
    try {
        // Attempt verification
        const company = await anafService.verifyCompany(cui);
        const info = anafService.extractCompanyInfo(company);
        
        return {
            success: true,
            data: info,
            source: 'anaf'
        };
        
    } catch (error) {
        console.warn(`ANAF verification failed for ${cui}:`, error.message);
        
        // Fallback to basic data
        return {
            success: false,
            data: {
                cui: cui,
                name: `Company ${cui}`,
                anafVerified: false,
                anafError: error.message
            },
            source: 'fallback'
        };
    }
}

// Usage
async function processWithFallback() {
    const result = await robustCompanyVerification('37311090');
    
    if (result.success) {
        console.log('✅ ANAF data available:', result.data.name);
    } else {
        console.log('⚠️ Using fallback data:', result.data.name);
    }
}
```

## Example 6: Integration with Existing Systems

```javascript
// Example: Enhancing existing client data
async function enhanceClientData(existingClient, cui) {
    try {
        const anafData = await anafService.getCompanyForOblio(cui);
        
        // Merge with existing data, preferring ANAF where available
        return {
            ...existingClient,
            name: anafData.name || existingClient.name,
            cui: anafData.cui,
            regCom: anafData.regCom,
            address: {
                ...existingClient.address,
                street: anafData.address.street || existingClient.address?.street,
                city: anafData.address.city || existingClient.address?.city,
                country: anafData.address.country || existingClient.address?.country
            },
            vatPayer: anafData.vatPayer,
            eInvoiceRegistered: anafData.eInvoiceRegistered,
            anafVerified: true,
            anafVerificationDate: new Date().toISOString().split('T')[0]
        };
        
    } catch (error) {
        // Return original data with error info
        return {
            ...existingClient,
            cui: cui,
            anafVerified: false,
            anafError: error.message
        };
    }
}
```

## Example 7: Custom CUI Detection

```javascript
function advancedCUIExtraction(orderData) {
    const sources = [
        // Standard fields
        orderData.billing_address?.company,
        orderData.shipping_address?.company,
        
        // Custom attributes
        orderData.note_attributes?.find(attr => 
            /cui|cif/i.test(attr.name)
        )?.value,
        
        // Order notes
        orderData.note,
        
        // Customer tags (if available)
        orderData.customer?.tags,
        
        // Line item properties
        ...orderData.line_items?.flatMap(item => 
            item.properties?.filter(prop => /cui|cif/i.test(prop.name))
                            ?.map(prop => prop.value) || []
        ) || []
    ];
    
    // Try different CUI patterns
    const patterns = [
        /(?:CUI|CIF)\\s*:?\\s*([0-9]{2,10})/i,
        /RO\\s*([0-9]{2,10})/i,
        /\\b([0-9]{8,10})\\b/g
    ];
    
    for (const source of sources) {
        if (source && typeof source === 'string') {
            for (const pattern of patterns) {
                const match = source.match(pattern);
                if (match) {
                    try {
                        return anafService.validateCUI(match[1]);
                    } catch (error) {
                        continue; // Try next match
                    }
                }
            }
        }
    }
    
    return null;
}
```

## Example 8: Monitoring and Logging

```javascript
class ANAFMonitor {
    constructor() {
        this.stats = {
            requests: 0,
            successes: 0,
            failures: 0,
            companiesFound: 0,
            companiesNotFound: 0
        };
    }
    
    async verifyWithMonitoring(cui) {
        this.stats.requests++;
        
        try {
            const company = await anafService.verifyCompany(cui);
            this.stats.successes++;
            this.stats.companiesFound++;
            
            console.log(`📊 ANAF Stats: ${this.stats.successes}/${this.stats.requests} successful`);
            
            return company;
            
        } catch (error) {
            this.stats.failures++;
            
            if (error.message.includes('not found')) {
                this.stats.companiesNotFound++;
            }
            
            console.log(`📊 ANAF Stats: ${this.stats.failures}/${this.stats.requests} failed`);
            throw error;
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            successRate: (this.stats.successes / this.stats.requests * 100).toFixed(2) + '%'
        };
    }
}

// Usage
const monitor = new ANAFMonitor();
```

## Running the Examples

```bash
# Save any example to a file and run it
node examples/company-verification.js

# Or include in your existing code
import { verifyCompany } from './examples/company-verification.js';
```

## Best Practices

1. **Always handle errors gracefully** - ANAF API may be unavailable
2. **Use batch verification** when possible to respect rate limits
3. **Cache results** for frequently queried companies
4. **Validate CUI format** before making API calls
5. **Log verification attempts** for debugging and monitoring
6. **Provide fallback data** when verification fails
