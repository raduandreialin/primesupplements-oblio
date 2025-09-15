# Cargus API v3 Documentation

**Version:** 3.1.7  
**Base URL:** `https://urgentcargus.portal.azure-api.net/`  
**Technology:** REST Web API Microsoft  

## Table of Contents

1. [Registering for API](#registering-for-api)
2. [PHP Call Example](#php-call-example)
3. [Authentication](#authentication)
4. [Geography](#geography)
5. [Pick up Points](#pick-up-points)
6. [Address Book](#address-book)
7. [Ship & Go Centers](#ship--go-centers)
8. [Rates](#rates)
9. [Transport Waybills Administration](#transport-waybills-administration)
10. [Order Management](#order-management)
11. [Cash on Delivery Tracking](#cash-on-delivery-tracking)
12. [Invoices](#invoices)
13. [Workflow for Integration](#workflow-for-integration)
14. [Implementation Conditions](#implementation-conditions)
15. [Annex](#annex)

---

## 1. Registering for API

### Steps to Register

1. **Create Account**: Go to the portal and SIGN IN, then SIGN UP
2. **Fill Required Data**: Complete registration and confirm via email link
3. **Access Products**: Click on PRODUCTS after logging in
4. **Subscribe to API**: Subscribe to `StandardUrgentOnlineAPI`
5. **Approval**: Wait for administrator approval and confirmation email
6. **Get API Key**: Navigate to PRODUCTS → StandardUrgentOnlineAPI → StandardUrgentOnlineAPI and retain the Primary Key

### API Headers Required

All API requests must include these headers:

```
Ocp-Apim-Subscription-Key: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Ocp-Apim-Trace: true
Authorization: Bearer TOKEN
Content-Type: application/json
```

**Note:** The `Authorization` header is not required for the `LoginUser` method.

---

## 2. PHP Call Example

```php
<?php
class UrgentCurier
{
    private $Curl;
    public $url = 'https://urgentcargus.azure-api.net/api';
    
    function __construct()
    {
        $this->Curl = curl_init();
        curl_setopt($this->Curl, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($this->Curl, CURLOPT_CONNECTTIMEOUT, 2);
        curl_setopt($this->Curl, CURLOPT_TIMEOUT, 3);
    }
    
    function CallMethod($function, $parameters = "", $verb, $token = null)
    {
        curl_setopt($this->Curl, CURLOPT_POSTFIELDS, $parameters);
        curl_setopt($this->Curl, CURLOPT_CUSTOMREQUEST, $verb);
        curl_setopt($this->Curl, CURLOPT_URL, $this->url . '/' . $function);
        
        // LoginUser is the only method that doesn't require a token
        if ($function == "LoginUser") {
            curl_setopt($this->Curl, CURLOPT_HTTPHEADER, array(
                'Ocp-Apim-Subscription-Key: xxxxxxxxxxxxxxxxxxxxxxxxxx',
                'Ocp-Apim-Trace: true',
                'Content-Type: application/json',
                'Content-Length: ' . strlen($parameters)
            ));
        } else {
            curl_setopt($this->Curl, CURLOPT_HTTPHEADER, array(
                'Ocp-Apim-Subscription-Key: xxxxxxxxxxxxxxxxxxxxxxxxxx',
                'Ocp-Apim-Trace: true',
                'Authorization: Bearer ' . $token,
                'Content-Type: application/json',
                'Content-Length: ' . strlen($parameters)
            ));
        }
        
        $result = curl_exec($this->Curl);
        $header = curl_getinfo($this->Curl);
        $output['message'] = $result;
        $output['status'] = $header['http_code'];
        return $output;
    }
}

$urgent = new UrgentCurier();
?>
```

---

## 3. Authentication

### 3.1 Login and Obtain Token

**Method:** `LoginUser`  
**Type:** POST  
**Description:** Authenticate and obtain a token valid for 24 hours.

**Request Parameters:**
- `UserName` - WebExpress username
- `Password` - User password

**Response:**
- `Token` - Authentication token for subsequent API calls

**Example:**
```php
$fields = array('UserName' => 'test.integration9', 'Password' => 'a');
$json = json_encode($fields);
$login = $urgent->CallMethod('LoginUser', $json, 'POST');

if ($login['status'] != "200") {
    echo "<b class='bad'>LoginUser: FALSE</b>";
} else {
    $token = json_decode($login['message']);
    echo "<b class='good'>LoginUser: </b>" . $token;
}
```

### 3.2 Token Verification

**Method:** `TokenVerification`  
**Type:** GET  
**Description:** Verify if the authentication token is valid.

**Response:** `true` / `false`

**Example:**
```php
$result = $urgent->CallMethod('TokenVerification', "", 'GET', $token);
```

---

## 4. Geography

### 4.1 List of Countries

**Method:** `Countries`  
**Type:** GET  
**Description:** Returns the list of countries in the Cargus system.

**Response Fields:**
- `CountryId` - Country ID
- `CountryName` - Country name  
- `Abbreviation` - Country code

### 4.2 List of Counties in a Country

**Method:** `Counties?countryId={countryId}`  
**Type:** GET

**Parameters:**
- `countryId` - Country ID from Countries method

**Response Fields:**
- `CountyId` - County ID
- `Name` - County name
- `Abbreviation` - County code

### 4.3 List of Localities in a County

**Method:** `Localities?countryId={countryId}&countyId={countyId}`  
**Type:** GET

**Parameters:**
- `countryId` - Country ID
- `countyId` - County ID

**Response Fields:**
- `LocalityId` - Locality ID
- `Name` - Locality name
- `ParentId` - Territorial agency ID
- `ParentName` - Territorial agency name
- `ExtraKm` - Chargeable extra kilometers
- `InNetwork` - In network status
- `CountyId` - County ID
- `CountryId` - Country ID
- `CodPostal` - Postal code
- `MaxHour` - Pickup hour

### 4.4 List of Streets in a Locality

**Method:** `Streets?localityId={localityId}`  
**Type:** GET

**Parameters:**
- `localityId` - Locality ID

**Response Fields:**
- `StreetId` - Street ID
- `Name` - Street name

---

## 5. Pick up Points

### 5.1 List of Pick up Points per Customer

**Method:** `PickupLocations/GetForClient`  
**Type:** GET  
**Description:** Returns pick up points for a customer.

**Response Fields:**
- `LocationId` - Pick up point ID
- `Name` - Pick up point name
- `CountyId` - County ID
- `CountyName` - County name
- `LocalityId` - Locality ID
- `LocalityName` - Locality name
- `StreetId` - Street ID
- `StreetName` - Street name
- `BuildingNumber` - Street number
- `AddressText` - Address
- `ContactPerson` - Contact person
- `PhoneNumber` - Contact phone number
- `Email` - Email address
- `CodPostal` - Postal code

### 5.2 Assign Pick up Point to User

**Method:** `PickupLocations/AssignToUser?LocationId={locationId}`  
**Type:** POST

**Parameters:**
- `LocationId` - Pick up point ID to assign

**Response:** `1` if successful, error message if not

### 5.3 List Active Pick up Points for User

**Method:** `PickupLocations`  
**Type:** GET  
**Description:** Lists active pick up points for the authenticated user.

### 5.4 Add Pick up Point for User

**Method:** `PickupLocations`  
**Type:** POST

**Request Body:**
```json
{
    "AutomaticEOD": "17:30",
    "LocationId": "",
    "Name": "Pickup Point Name",
    "CountyId": 5,
    "CountyName": "Arges",
    "LocalityId": 157,
    "LocalityName": "Pitesti",
    "StreetId": 0,
    "StreetName": "Street Name",
    "BuildingNumber": "5",
    "AddressText": "Full Address",
    "ContactPerson": "Contact Name",
    "PhoneNumber": "072769821",
    "CodPostal": "postal_code",
    "Email": "email@example.com"
}
```

### 5.5 Modify Pick up Point

**Method:** `PickupLocations`  
**Type:** PUT  
**Description:** Modify an existing pick up point using the same structure as adding.

---

## 6. Address Book

**Method:** `Recipients`  
**Type:** GET  
**Description:** Lists the established address book.

**Response:** List of recipients with same fields as pickup locations.

---

## 7. Ship & Go Centers

**Method:** `PUDO_Get`  
**Type:** GET  
**Description:** Returns the list of Ship & Go delivery points.

**Response Example:**
```json
{
    "Id": 114142,
    "Name": "CARGUS SHIP & GO MAGURELE",
    "LocationId": 1,
    "CityId": 1793631,
    "City": "Magurele",
    "StreetId": 39689,
    "ZoneId": 8728,
    "PostalCode": "077125",
    "AdditionalAddressInfo": "",
    "Longitude": 26.041645,
    "Latitude": 44.367229,
    "PointType": 5,
    "OpenHoursMoStart": "08:00",
    "OpenHoursMoEnd": "18:00",
    "StreetNo": "99-115",
    "PhoneNumber": "021 9330",
    "ServiceCOD": false,
    "PaymentType": 1,
    "CountyId": 27,
    "County": "Ilfov",
    "Email": "",
    "StreetName": "Atomistilor"
}
```

**Key Fields:**
- `PaymentType`: 1 - no payment, 2 - card only, 3 - cash or card, 4 - cash only
- Opening hours for each day of the week
- GPS coordinates (Longitude, Latitude)

---

## 8. Rates

### 8.1 List of Contracted Prices

**Method:** `PriceTables`  
**Type:** GET

**Response Fields:**
- `PriceTableId` - Price ID
- `Name` - Price name

### 8.2 Price Calculation for Shipment

**Method:** `ShippingCalculation`  
**Type:** POST

**Request Parameters:**
- `FromLocalityId` - Sender locality ID
- `ToLocalityId` - Recipient locality ID
- `FromCountyName` - Sender county name (optional)
- `FromLocalityName` - Sender locality name (optional)
- `ToCountyName` - Recipient county name (optional)
- `ToLocalityName` - Recipient locality name (optional)
- `Parcels` - Number of parcels
- `Envelopes` - Number of envelopes
- `TotalWeight` - Total weight
- `ServiceId` - Service ID (34: ≤31kg, 35: 31-50kg, 50: >50kg)
- `DeclaredValue` - Declared value
- `CashRepayment` - Cash repayment
- `BankRepayment` - Bank repayment
- `OtherRepayment` - Other repayment
- `PaymentInstrumentId` - Payment instrument (1: cheque, 2: BO, 3: other)
- `PaymentInstrumentValue` - Payment instrument value
- `OpenPackage` - Open package (true/false)
- `ShipmentPayer` - Payer (1: sender, 2: recipient)
- `PriceTableId` - Price table ID

**Response Fields:**
- `BaseCost` - Base price without contract
- `ExtraKmCost` - Extra kilometers price
- `WeightCost` - Contracted price
- `InsuranceCost` - Insurance cost
- `SpecialCost` - Special taxes
- `RepaymentCost` - Repayment cost
- `Subtotal` - Total without VAT
- `Tax` - VAT
- `GrandTotal` - Total price

---

## 9. Transport Waybills Administration

### 9.1 Pick-up from Another Location

**Method:** `AwbPickup`  
**Type:** POST  
**Description:** Generate a new AWB and send a pickup order to courier.

**Alternative Method:** `AwbPickup/WithGetAwb`  
**Type:** POST  
**Description:** Generate a new AWB with pickup order and return full AWB data (recommended for integrations).

**Request Structure:**
```json
{
    "PickupStartDate": "2017-10-25T14:11",
    "PickupEndDate": "2017-10-25T18:55",
    "SenderClientId": null,
    "TertiaryClientId": null,
    "Sender": {
        "Name": "Sender Name",
        "CountyName": "County",
        "LocalityName": "Locality",
        "AddressText": "Full Address",
        "ContactPerson": "Contact Person",
        "PhoneNumber": "0723222222",
        "CodPostal": "postal_code",
        "Email": "email@example.com"
    },
    "Recipient": {
        "LocationId": 201165677
    },
    "Parcels": 2,
    "Envelopes": 0,
    "TotalWeight": 25,
    "ServiceId": 34,
    "DeclaredValue": 0,
    "CashRepayment": 0,
    "BankRepayment": 0,
    "OtherRepayment": "",
    "OpenPackage": true,
    "PriceTableId": 0,
    "ShipmentPayer": 1,
    "SaturdayDelivery": true,
    "MorningDelivery": true,
    "Observations": "",
    "PackageContent": "",
    "CustomString": "",
    "ParcelCodes": [
        {
            "Code": "0",
            "Type": 1,
            "Weight": 25,
            "Length": 20,
            "Width": 20,
            "Height": 20,
            "ParcelContent": "Description"
        }
    ]
}
```

### 9.2 Generate Transport Waybill

**Method:** `Awbs`  
**Type:** POST  
**Description:** Add a new AWB from a pickup location.

### 9.3 Easy Collect Transport Waybill

For Ship & Go delivery points:
1. Use `PUDO_Get` to get delivery points
2. Use `Awbs` with `ServiceId: 38` and `DeliveryPudoPoint` parameter

### 9.4 Generate AWB with Custom Number

**Method:** `Awbs`  
**Type:** POST  
**Description:** Generate AWB with predetermined barcode using `BarCode` and `CustomString` fields.

### 9.5 Delete Transport Note

**Method:** `Awbs?barCode={barCode}`  
**Type:** DELETE  
**Description:** Delete AWB that has no checkpoints.

### 9.6 Get Routing Details by Address

**Method:** `GetRoutingAddress`  
**Type:** POST

**Request:**
```json
{
    "TotalWeight": 1,
    "Sender": {
        "CountyName": "IASI",
        "LocalityName": "IASI",
        "ZipCode": "700259"
    },
    "Recipient": {
        "CountyName": "CONSTANTA",
        "LocalityName": "CONSTANTA",
        "AddressText": "Address Details",
        "ZipCode": "900320"
    }
}
```

### 9.7 List Transport Notes by Date Range

**Method:** `Awbs/GetByDate?FromDate={mm-dd-yyyy}&ToDate={mm-dd-yyyy}&pageNumber={page}&itemsPerPage={count}`  
**Type:** GET

### 9.8 Get Transport Note Information

**Method:** `Awbs?barCode={barCode}` or `Awbs?orderId={orderId}`  
**Type:** GET

### 9.9 Print Transport Notes

**Method:** `AwbDocuments?barCodes={jsonArray}&type={PDF|HTML}&format={0|1}&printMainOnce={0|1|2}`  
**Type:** GET

**Parameters:**
- `format`: 0 = A4, 1 = Label 10x14
- `printMainOnce`: 0 = print twice, 1 = print once, 2 = print once label format

### 9.10 Track Shipments with Redirected AWBs

**Method:** `AwbTrace/WithRedirect?barCode={jsonArray}`  
**Type:** GET

### 9.11 List Returning AWBs

**Method:** `AwbRetur?data={yyyy-mm-dd}`  
**Type:** GET

### 9.12 Check Last Events from Interval

**Method:** `AwbTrace/GetDeltaEvents?FromDate={mm-dd-yyyy}&ToDate={mm-dd-yyyy}`  
**Type:** GET

### 9.13 Display Confirmation Picture

**Method:** `AwbScan?barCodes={barCode}`  
**Type:** GET  
**Returns:** Base64 encoded image

---

## 10. Order Management

### 10.1 Launch or Cancel Order for Pick up Point

**Method:** `Orders?locationId={id}&action={0|1}&PickupStartDate={date}&PickupEndDate={date}`  
**Type:** PUT

**Parameters:**
- `action`: 0 = cancel, 1 = validate
- `locationId`: 0 for headquarters

### 10.2 Launch or Cancel All Orders

**Method:** `Orders/PutAll?action={0|1}&PickupStartDate={date}&PickupEndDate={date}`  
**Type:** PUT

### 10.3 List Order Information for Pick up Point

**Method:** `Orders?locationId={id}&status={0|1}&pageNumber={page}&itemsPerPage={count}`  
**Type:** GET

**Parameters:**
- `status`: 0 = current orders, 1 = validated orders

### 10.4 List Orders by Date Range

**Method:** `Orders/GetByDate?FromDate={yyyy-mm-dd}&ToDate={yyyy-mm-dd}&pageNumber={page}&itemsPerPage={count}`  
**Type:** GET

### 10.5 Get Order by ID

**Method:** `Orders/GetByOrderId?orderId={orderId}`  
**Type:** GET

---

## 11. Cash on Delivery Tracking

### 11.1 List COD by Date Range

**Method:** `CashAccount/GetByDate?FromDate={yyyy-mm-dd}&ToDate={yyyy-mm-dd}`  
**Type:** GET

### 11.2 List Refunds After Date

**Method:** `CashAccount/GetByDeductionDate?DeductionDate={yyyy-mm-dd}`  
**Type:** GET

### 11.3 Refund by Barcode

**Method:** `CashAccount?barCode={barCode}`  
**Type:** GET

---

## 12. Invoices

### 12.1 List Invoices

**Method:** `Invoices?FromDate={yyyy-mm-dd}&ToDate={yyyy-mm-dd}&pageNumber={page}&itemsPerPage={count}`  
**Type:** GET

**Response Fields:**
- `InvoiceId` - Invoice ID
- `Date` - Emission date
- `DueDate` - Due date
- `Series` - Invoice series
- `Number` - Invoice number
- `Value` - Value without VAT
- `Total` - Total amount
- `Closed` - Closed status
- `Balance` - Balance
- `CurrencyId` - Currency

### 12.2 Print Invoice PDF

**Method:** `InvoiceDocuments?InvoiceId={invoiceId}`  
**Type:** GET  
**Returns:** Base64 encoded PDF

---

## 13. Workflow for Integration

1. **Add Pickup Location:** Use `PickupLocations` to add pickup point
2. **Get Location Details:** Use `Localities` and `Streets` for location data
3. **Create AWB:** Use `Awbs` method with sender using pickup location ID
4. **Close Order:** Either:
   - Call `Orders` with PUT and `action=1`
   - Wait for AutomaticEOD time

---

## 14. Implementation Conditions

### Multipiece Service Limitations

- Maximum 31 kg per piece
- Maximum 15 pieces per shipment  
- Maximum 465 kg total weight per shipment

---

## 15. Annex

### Service IDs

| ID | Service Name |
|----|-------------|
| 34 | Economic Standard |
| 35 | Standard Plus |
| 36 | Pallet Standard |
| 38 | PUDO Delivery |
| 39 | Multipiece |

### Order Status

- `0` - Open order
- `1` - Closed order

### Order Types

| ID | Type |
|----|------|
| 1 | Online (WebExpress) |
| 2 | Telephone |
| 3 | External (API) |
| 4 | Pickup |
| 5 | Email |
| 6 | Predetermined |

### Payment Types (Ship & Go)

| ID | Type |
|----|------|
| 1 | No payment available |
| 2 | Card only |
| 3 | Cash or card |
| 4 | Cash only |

---

## Important Notes

- Tokens are valid for 24 hours
- All dates should be in specified formats (yyyy-mm-dd or mm-dd-yyyy depending on endpoint)
- LocationId = 0 refers to headquarters
- Maximum 9 envelopes per shipment
- Base64 decoding required for PDF/image responses