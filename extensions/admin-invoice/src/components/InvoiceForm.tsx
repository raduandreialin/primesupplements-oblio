import {useState, useEffect} from 'react';
import {
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Checkbox,
  Button,
  Text,
  Section,
  Divider,
  DateField
} from '@shopify/ui-extensions-react/admin';

import {
  type InvoiceOptions,
  type CustomClient,
  getDefaultInvoiceOptions,
  validateInvoiceOptions,
  buildClientFromOrder,
  isB2BOrder
} from '../utils/invoiceUtils';

interface InvoiceFormProps {
  order: any;
  onOptionsChange: (options: InvoiceOptions) => void;
  onClientChange: (client: CustomClient) => void;
  disabled?: boolean;
  validatedClient?: CustomClient | null;
}

export function InvoiceForm({ 
  order, 
  onOptionsChange, 
  onClientChange, 
  disabled = false,
  validatedClient = null
}: InvoiceFormProps) {
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOptions>(() => 
    getDefaultInvoiceOptions(order)
  );
  
  const [customClient, setCustomClient] = useState<CustomClient>(() => 
    validatedClient || buildClientFromOrder(order)
  );

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Update client when validated client changes
  useEffect(() => {
    if (validatedClient) {
      setCustomClient(validatedClient);
      onClientChange(validatedClient);
    }
  }, [validatedClient]);

  // Handle invoice options change
  const handleOptionsChange = (key: keyof InvoiceOptions, value: any) => {
    const newOptions = { ...invoiceOptions, [key]: value };
    setInvoiceOptions(newOptions);
    
    // Validate options
    const errors = validateInvoiceOptions(newOptions);
    setValidationErrors(errors);
    
    onOptionsChange(newOptions);
  };

  // Handle client data change
  const handleClientChange = (key: keyof CustomClient, value: string) => {
    const newClient = { ...customClient, [key]: value };
    setCustomClient(newClient);
    onClientChange(newClient);
  };

  const isB2B = isB2BOrder(order);
  const seriesOptions = [
    { value: 'PRS', label: 'PRS - Primary Series' }
  ];

  const languageOptions = [
    { value: 'RO', label: 'Romanian' },
    { value: 'EN', label: 'English' }
  ];


  return (
    <BlockStack gap="base">
      {/* Client Information */}
      <Section>
        <BlockStack gap="small">
          <Text fontWeight="bold">Client Information</Text>
          
          <TextField
            label="Client Name"
            value={customClient.name}
            onChange={(value) => handleClientChange('name', value)}
            disabled={disabled}
          />
          
          {isB2B && (
            <InlineStack gap="small">
              <TextField
                label="CIF"
                value={customClient.cif || ''}
                onChange={(value) => handleClientChange('cif', value)}
                disabled={disabled}
              />
              <TextField
                label="Registration Number"
                value={customClient.rc || ''}
                onChange={(value) => handleClientChange('rc', value)}
                disabled={disabled}
              />
            </InlineStack>
          )}
          
          <TextField
            label="Address"
            value={customClient.address}
            onChange={(value) => handleClientChange('address', value)}
            disabled={disabled}
          />
          
          <InlineStack gap="small">
            <TextField
              label="City"
              value={customClient.city}
              onChange={(value) => handleClientChange('city', value)}
              disabled={disabled}
            />
            <TextField
              label="County"
              value={customClient.state}
              onChange={(value) => handleClientChange('state', value)}
              disabled={disabled}
            />
          </InlineStack>
          
          <InlineStack gap="small">
            <TextField
              label="Email"
              value={customClient.email}
              onChange={(value) => handleClientChange('email', value)}
              disabled={disabled}
            />
            <TextField
              label="Phone"
              value={customClient.phone}
              onChange={(value) => handleClientChange('phone', value)}
              disabled={disabled}
            />
          </InlineStack>
        </BlockStack>
      </Section>

      <Divider />

      {/* Invoice Options */}
      <Section>
        <BlockStack gap="small">
          <Text fontWeight="bold">Invoice Options</Text>
          
          <InlineStack gap="small">
            <Select
              label="Series"
              options={seriesOptions}
              value={invoiceOptions.seriesName || 'FCT'}
              onChange={(value) => handleOptionsChange('seriesName', value)}
              disabled={disabled}
            />
            <Select
              label="Language"
              options={languageOptions}
              value={invoiceOptions.language || 'RO'}
              onChange={(value) => handleOptionsChange('language', value)}
              disabled={disabled}
            />
          </InlineStack>

          <DateField
            label="Issue Date"
            value={invoiceOptions.issueDate || new Date().toISOString().split('T')[0]}
            onChange={(value) => handleOptionsChange('issueDate', value)}
            disabled={disabled}
          />

          <TextField
            label="Mentions"
            value={invoiceOptions.mentions || ''}
            onChange={(value) => handleOptionsChange('mentions', value)}
            placeholder="Additional notes for the invoice"
            disabled={disabled}
          />

          {/* Basic Options */}
          <InlineStack gap="small">
            <Checkbox
              checked={invoiceOptions.sendEmail !== false}
              onChange={(checked) => handleOptionsChange('sendEmail', checked)}
              disabled={disabled}
            >
              Send invoice by email
            </Checkbox>
            
            <Checkbox
              checked={invoiceOptions.useStock !== false}
              onChange={(checked) => handleOptionsChange('useStock', checked)}
              disabled={disabled}
            >
              Update stock in Oblio
            </Checkbox>
            
            <Checkbox
              checked={invoiceOptions.markAsPaid === true}
              onChange={(checked) => handleOptionsChange('markAsPaid', checked)}
              disabled={disabled}
            >
              Mark as paid (if order is paid in Shopify)
            </Checkbox>
          </InlineStack>

        </BlockStack>
      </Section>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <Section>
          <BlockStack gap="small">
            <Text fontWeight="bold">Validation Errors:</Text>
            {validationErrors.map((error, index) => (
              <Text key={index}>• {error}</Text>
            ))}
          </BlockStack>
        </Section>
      )}
    </BlockStack>
  );
}
