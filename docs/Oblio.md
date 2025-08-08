# Oblio API Documentation for Cursor

## Overview

Oblio is a Romanian SaaS accounting and invoicing platform serving over 150,000 small and medium-sized companies. The Oblio REST API provides comprehensive access to accounting features including document generation, client management, inventory tracking, and e-Invoice integration with the Romanian SPV (Private Virtual Space) system.

## Base URL

```
https://www.oblio.eu/api
```

## Authentication (OAuth 2.0)

### Get Access Token

**Endpoint:** `POST /authorize/token`
**Method:** HTTP POST
**Content-Type:** `application/x-www-form-urlencoded`

**Parameters:**

* `client_id` - Your Oblio email address
* `client_secret` - API token from Settings > Account Data

**Important Notes:**

* Access tokens expire after 3600 seconds (1 hour)
* The `client_secret` regenerates every time you reset your password
* Use Bearer token for all subsequent requests

**Example Request:**

```bash
curl -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_id=nume@exemplu.com&client_secret=1edd9e4f6..." \
     -X POST https://www.oblio.eu/api/authorize/token
```

**Example Response:**

```json
{
  "access_token": "67d6f8817c28d698bdae35728c7a30b02a75bd4d",
  "expires_in": "3600",
  "token_type": "Bearer",
  "scope": "",
  "request_time": "1540471129"
}
```

## Rate Limits

* **Document Generation:** 30 requests per 100 seconds
* **Other Operations:** 30 requests per 10 seconds

## Nomenclature Endpoints

### 1. Companies

**Endpoint:** `GET /nomenclature/companies`
Returns list of companies associated with your Oblio account.

**Example Response:**

```json
{
  "status": 200,
  "statusMessage": "Success",
  "data": [
    {
      "cif": "RO37311090",
      "company": "OBLIO SOFTWARE SRL",
      "userTypeAccess": "admin"
    }
  ]
}
```

### 2. VAT Rates

**Endpoint:** `GET /nomenclature/vat_rates`
**Parameters:**

* `cif` (required) - Company CIF

**Example Response:**

```json
{
  "status": 200,
  "statusMessage": "Success",
  "data": [
    {
      "name": "Normala",
      "percent": 19,
      "default": true
    },
    {
      "name": "Redusa", 
      "percent": 9,
      "default": false
    },
    {
      "name": "SFDD",
      "percent": 0,
      "default": false
    }
  ]
}
```

### 3. Clients

**Endpoint:** `GET /nomenclature/clients`
**Parameters:**

* `cif` (required) - Company CIF
* `name` (optional) - Search by client name
* `clientCif` (optional) - Search by client CIF
* `offset` (optional) - Results offset (multiples of 250)

### 4. Products

**Endpoint:** `GET /nomenclature/products`
**Parameters:**

* `cif` (required) - Company CIF
* `name` (optional) - Search by product name
* `code` (optional) - Search by product code
* `management` (optional) - Filter by inventory management
* `workStation` (optional) - Filter by work station
* `offset` (optional) - Results offset (multiples of 250)

**Example Response:**

```json
{
  "status": 200,
  "statusMessage": "Success",
  "data": [
    {
      "name": "Montare",
      "code": "",
      "description": "",
      "measuringUnit": "buc",
      "productType": "Serviciu",
      "price": "119.00",
      "currency": "RON",
      "vatName": "Normala",
      "vatPercentage": 19,
      "vatIncluded": true
    },
    {
      "name": "Birou",
      "code": "",
      "description": "",
      "measuringUnit": "buc",
      "productType": "Marfa",
      "stock": [
        {
          "workStation": "Sediu",
          "management": "Magazin",
          "quantity": 2,
          "price": "200.00",
          "currency": "RON",
          "vatName": "Normala",
          "vatPercentage": 19,
          "vatIncluded": false
        }
      ]
    }
  ]
}
```

### 5. Document Series

**Endpoint:** `GET /nomenclature/series`
**Parameters:**

* `cif` (required) - Company CIF

### 6. Languages

**Endpoint:** `GET /nomenclature/languages`
**Parameters:**

* `cif` (required) - Company CIF

### 7. Inventory Management

**Endpoint:** `GET /nomenclature/management`
**Parameters:**

* `cif` (required) - Company CIF
  **Note:** Only works if inventory is activated.

## Document Generation

### Proforma Invoice

**Endpoint:** `POST /docs/proforma`
**Method:** HTTP POST
**Content-Type:** `application/json`

**Required Parameters:**

* `cif` - Company CIF
* `client` - Client information object
* `seriesName` - Document series name
* `products` - Array of products

**Optional Parameters:**

* `issueDate` - Issue date (YYYY-MM-DD, default: today)
* `dueDate` - Due date (YYYY-MM-DD)
* `language` - Language code (default: "RO")
* `precision` - Decimal precision 2-4 (default: 2)
* `currency` - Currency (default: "RON")
* `exchangeRate` - Exchange rate for foreign currency
* `disableAutoSeries` - Disable auto numbering (0 or 1)
* `number` - Manual document number (if auto disabled)
* `sendEmail` - Send email notification (0 or 1)

**Client Object Parameters:**

* `name` (required) - Client name or company name
* `cif` - Client CIF or personal ID
* `rc` - Commerce Registry number
* `address`, `state`, `city`, `country` - Address information
* `phone`, `email`, `contact` - Contact information
* `vatPayer` - VAT payer status (0 or 1)
* `save` - Save client data (0 or 1)
* `autocomplete` - Auto-complete Romanian company data (0 or 1)

**Product Object Parameters:**

* `name` (required) - Product name
* `price` (required) - Product price
* `code` - Product code
* `description` - Product description
* `measuringUnit` - Unit of measure (default: "buc")
* `currency` - Product currency
* `vatName` - VAT rate name
* `vatPercentage` - VAT percentage
* `vatIncluded` - VAT included in price (0 or 1, default: 1)
* `quantity` - Quantity (default: 1)
* `productType` - Product type for inventory
* `management` - Inventory management name
* `save` - Save list price (0 or 1, default: 1)

**Discount Object (in products array):**

* `name` (required) - Discount description
* `discountType` - "procentual" or "valoric" (default: "valoric")
* `discount` (required) - Discount value
* `discountAllAbove` - Apply to all products above (0 or 1)

**Example Request:**

```json
{
  "cif": "RO37311090",
  "client": {
    "cif": "RO37311090",
    "name": "OBLIO SOFTWARE SRL",
    "rc": "J13/887/2017",
    "code": "oblio",
    "address": "",
    "state": "Constanta",
    "city": "Constanta",
    "vatPayer": true
  },
  "issueDate": "2018-10-15",
  "dueDate": "2018-10-30",
  "seriesName": "PR",
  "language": "RO",
  "precision": 2,
  "currency": "RON",
  "products": [
    {
      "name": "Test",
      "code": "test",
      "description": "Test description",
      "price": 200,
      "measuringUnit": "buc",
      "vatName": "Normala",
      "vatPercentage": 19,
      "vatIncluded": 0,
      "quantity": 2,
      "productType": "Serviciu"
    },
    {
      "name": "Discount 10% Test",
      "discount": 10,
      "discountType": "procentual"
    }
  ],
  "issuerName": "Ion Popescu",
  "issuerId": 1234567890123,
  "workStation": "Sediu"
}
```

### Invoice

**Endpoint:** `POST /docs/invoice`
Same parameters as proforma with additional options:

* `deliveryDate` - Delivery date (YYYY-MM-DD)
* `collectDate` - Collection date (YYYY-MM-DD)
* `referenceDocument` - Reference document object
* `collect` - Payment collection object
* `useStock` - Use inventory (0 or 1)

**Reference Document Object:**

* `type` (required) - "Factura", "Proforma", or "Aviz"
* `seriesName` (required) - Series name
* `number` (required) - Document number
* `refund` - Delete payment for canceled invoice (0 or 1)

**Collection Object:**

* `type` (required) - Payment type: "Chitanta", "Bon fiscal", "Ordin de plata", "Card", etc.
* `seriesName` - Receipt series name (for receipts)
* `documentNumber` - Payment document number
* `value` - Payment amount (default: invoice total)
* `issueDate` - Payment date (YYYY-MM-DD)

### Delivery Note (Aviz)

**Endpoint:** `POST /docs/notice`
Same as proforma but without `noticeNumber` parameter and with optional `useStock` parameter.

## Document Management

### View Document

**Endpoint:** `GET /docs/{type}`
**Types:** `invoice`, `proforma`, `notice`
**Parameters:**

* `cif` (required) - Company CIF
* `seriesName` (required) - Document series
* `number` (required) - Document number

### Cancel Document

**Endpoint:** `PUT /docs/{type}/cancel`
**Parameters:** Same as view document

### Restore Document

**Endpoint:** `PUT /docs/{type}/restore`
**Parameters:** Same as view document

### Delete Document

**Endpoint:** `DELETE /docs/{type}`
**Parameters:** Same as view document
**Note:** Only works for the last document in series

### List Documents

**Endpoint:** `GET /docs/{type}/list`
**Parameters:**

* `cif` (required) - Company CIF
* `seriesName` - Filter by series name
* `number` - Filter by document number
* `id` - Filter by document ID
* `draft` - Filter by draft status (-1=ignore, 0=not draft, 1=draft)
* `canceled` - Filter by canceled status (-1=ignore, 0=not canceled, 1=canceled)
* `client` - Filter by client (object with cif, email, phone, or code)
* `issuedAfter` - Start date filter (YYYY-MM-DD)
* `issuedBefore` - End date filter (YYYY-MM-DD)
* `withProducts` - Include products in result
* `withEinvoiceStatus` - Include e-Invoice status
* `orderBy` - Sort by: id, issueDate, number
* `orderDir` - Sort direction: ASC/DESC
* `limitPerPage` - Results per page (max 100)
* `offset` - Results offset (multiples of 100)

### Collect Invoice Payment

**Endpoint:** `PUT /docs/invoice/collect`
**Parameters:**

* `cif` (required) - Company CIF
* `seriesName` (required) - Invoice series
* `number` (required) - Invoice number
* `collect` (required) - Collection object

## e-Invoice Integration (SPV)

### Send to SPV

**Endpoint:** `POST /docs/einvoice`
**Parameters:**

* `cif` (required) - Company CIF
* `seriesName` (required) - Invoice series
* `number` (required) - Invoice number

**Response Codes:**

* `-1` - e-Invoice not sent to SPV
* `0` - e-Invoice sent to SPV and processing
* `1` - e-Invoice successfully sent to SPV
* `2` - e-Invoice has errors and not sent

### Download SPV Archive

**Endpoint:** `GET /docs/einvoice`
**Parameters:** Same as send to SPV
Returns the SPV archive file for processed invoices.

## Webhooks

### Create Webhook

**Endpoint:** `POST /webhooks`
**Content-Type:** `application/json`

**Parameters:**

* `cif` (required) - Company CIF
* `topic` (required) - Event to subscribe to
* `endpoint` (required) - Webhook URL

**Available Topics:**

* `stock` - Inventory changes
* `Invoice/SaveDraft` - Invoice draft saved
* `Proforma/SaveDraft` - Proforma draft saved
* `Notice/SaveDraft` - Delivery note draft saved
* `TaxReceipt/SaveDraft` - Tax receipt draft saved
* `Invoice/Update` - Invoice updated
* `Proforma/Update` - Proforma updated
* `Notice/Update` - Delivery note updated
* `Invoice/Cancel` - Invoice canceled
* `Proforma/Cancel` - Proforma canceled
* `Notice/Cancel` - Delivery note canceled
* `TaxReceipt/Cancel` - Tax receipt canceled
* `Collect/Inserted` - Payment collected

**Example Request:**

```json
{
  "cif": 37311090,
  "topic": "stock",
  "endpoint": "https://example.com/update-stock/"
}
```

**Note:** Webhook endpoint must respond with status 200 and return the base64-encoded value of the `X-Oblio-Request-Id` header.

### List Webhooks

**Endpoint:** `GET /webhooks`

### Delete Webhook

**Endpoint:** `DELETE /webhooks/{id}`

## Error Handling

All API responses follow this format:

```json
{
  "status": 200,
  "statusMessage": "Success",
  "data": {}
}
```

**Success:** Status code 200
**Error:** Status code 400 or 401 with error message

## Common Romanian Business Fields

**Product Types:**

* "Marfa" - Merchandise
* "Materii prime" - Raw materials
* "Materiale consumabile" - Consumable materials
* "Semifabricate" - Semi-finished products
* "Produs finit" - Finished product
* "Produs rezidual" - Residual product
* "Produse agricole" - Agricultural products
* "Animale si pasari" - Animals and birds
* "Ambalaje" - Packaging
* "Obiecte de inventar" - Inventory objects
* "Serviciu" - Service

**Payment Types:**

* "Chitanta" - Receipt
* "Bon fiscal" - Fiscal receipt
* "Alta incasare numerar" - Other cash collection
* "Ordin de plata" - Payment order
* "Mandat postal" - Postal mandate
* "Card" - Card payment
* "CEC" - Check
* "Bilet ordin" - Order note
* "Alta incasare banca" - Other bank collection

## Integration Examples

### Generate Invoice with Payment

```json
{
  "cif": "RO37311090",
  "client": {
    "name": "Test Client SRL",
    "cif": "RO12345678",
    "vatPayer": true
  },
  "seriesName": "FCT",
  "products": [
    {
      "name": "Web Development Service",
      "price": 1000,
      "vatName": "Normala",
      "vatPercentage": 19,
      "vatIncluded": false
    }
  ],
  "collect": {
    "type": "Ordin de plata",
    "documentNumber": "OP 001"
  }
}
```

### Generate Invoice from Proforma

```json
{
  "cif": "RO37311090",
  "seriesName": "FCT",
  "referenceDocument": {
    "type": "Proforma",
    "seriesName": "PR",
    "number": 8
  }
}
```

## GitHub Resources

Official PHP implementation and examples available at:

* **Main API:** https://github.com/OblioSoftware/OblioApi
* **WooCommerce Integration:** https://github.com/OblioSoftware/oblio-woocommerce

## Important Notes

1. All dates use YYYY-MM-DD format
2. Decimal precision can be 2-4 digits
3. Default currency is RON (Romanian Leu)
4. VAT rates are company-specific
5. Inventory features require activation in Oblio
6. e-Invoice integration is mandatory for Romanian companies
7. Document numbering is automatic unless disabled
8. All text responses support Romanian and English languages
