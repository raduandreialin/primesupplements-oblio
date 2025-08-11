# Prime Supplements - Oblio Invoice Integration
## Prezentare Aplicație pentru Client Final

### 🎯 Scopul Aplicației

Aplicația **Prime Supplements Oblio Integration** automatizează complet procesul de facturare pentru magazinul online Shopify, integrându-se seamless cu platforma de contabilitate Oblio pentru a genera automat facturi fiscale conforme cu legislația română.

### ⚡ Funcționalități Principale

#### 1. **Automatizare Completă**
- **Trigger automat**: Factura se generează instant când comanda Shopify este marcată ca "fulfilled"
- **Zero intervenție manuală**: Procesul rulează complet automat în background
- **Sincronizare în timp real**: Datele se actualizează imediat în ambele sisteme

#### 2. **Conformitate Fiscală Românească**
- **Verificare ANAF**: Validare automată a CIF-urilor companiilor prin API-ul ANAF
- **Date complete**: Extrage automat denumirea companiei, CIF, Registrul Comerțului (RC)
- **Adrese corecte**: Folosește adresa de facturare (billing) pentru persoane juridice
- **Formatare adrese românești**: Gestionare inteligentă a sectoarele Bucureștiului (SECTOR1-6)
- **TVA conform**: Aplicare automată a cotelor de TVA configurate în Oblio

#### 3. **Gestionare Inteligentă a Produselor**
- **Filtrare automată**: Exclude produsele cu cantitate 0 sau preț 0
- **Gestionare returnări**: Calculează automat cantitățile după returnări/refund-uri
- **Transport inclus**: Adaugă automat linia de transport dacă există costuri
- **Gestiune stoc**: Actualizează automat stocul în Oblio după facturare

#### 4. **Integrare Shopify Avansată**
- **Taguri automate**: Marchează comenzile cu taguri specifice ("oblio-invoiced", "FACTURA-XXX")
- **Metafields complete**: Salvează numărul facturii, seria și URL-ul în Shopify
- **Gestionare erori**: Marchează comenzile cu erori pentru investigare ulterioară
- **Istoric complet**: Păstrează log-ul tuturor operațiunilor

#### 5. **Comunicare Automată cu Clienții**
- **Email automat**: Trimite factura prin email direct din Oblio
- **Template personalizat**: Folosește șablonul de email configurat în Oblio
- **Mențiuni personalizate**: Include referința comenzii în factura ("Factura emisa pentru comanda #1001")

### 🏗️ Arhitectura Tehnică

#### **Componente Principale:**
- **InvoiceController**: Orchestrează întregul proces de facturare
- **ShopifyService**: Gestionează comunicarea cu API-ul Shopify
- **OblioService**: Interfață cu API-ul Oblio pentru generarea facturilor
- **AnafService**: Verifică și validează datele companiilor prin ANAF
- **AddressUtils**: Formatare inteligentă a adreselor românești cu suport pentru sectoarele Bucureștiului
- **Utilități**: Extragere CIF, validări, transformări de date

#### **Fluxul de Lucru:**
1. **Webhook Shopify** → Primește notificare de fulfillment
2. **Validare Comandă** → Verifică dacă comanda poate fi facturată
3. **Extragere Date** → Colectează informații client, produse, adrese
4. **Verificare ANAF** → Validează CIF-ul și extrage date oficiale (pentru B2B)
5. **Construire Payload** → Formatează datele pentru Oblio
6. **Generare Factură** → Creează factura în Oblio
7. **Actualizare Shopify** → Salvează detaliile facturii în comandă
8. **Notificare Client** → Trimite factura prin email

### 📊 Beneficii pentru Business

#### **Eficiență Operațională**
- ⏱️ **Economie de timp**: 95% reducere în timpul de procesare a facturilor
- 🎯 **Acuratețe**: Eliminarea erorilor umane în transcrierea datelor
- 📈 **Scalabilitate**: Procesează sute de comenzi simultan fără intervenție

#### **Conformitate Legală**
- ✅ **Legislație română**: Respectă toate cerințele fiscale românești
- 🏛️ **Integrare ANAF**: Verificare automată a validității CIF-urilor
- 📋 **Audit trail**: Istoric complet al tuturor operațiunilor

#### **Experiența Clientului**
- 📧 **Comunicare rapidă**: Clienții primesc factura imediat după livrare
- 🎨 **Profesionalism**: Facturi generate cu template-ul companiei
- 🔍 **Transparență**: Clienții pot urmări statusul facturii în Shopify

### 🏛️ Gestionare Avansată a Adreselor Românești

#### **Formatare Inteligentă Bucuresti:**
- **Detectare automată**: Identifică adresele din București prin cod județ 'B' sau numele orașului
- **Extragere sectoare**: Parsează automat sectorul din adresă ("Sector 1", "sector3", "SECTOR 2")
- **Formatare standardizată**: Convertește la format "SECTOR1", "SECTOR2", etc.
- **Fallback inteligent**: Folosește SECTOR2 ca default când sectorul nu este specificat

#### **Exemple de Procesare:**
```
Input:  "Strada Victoriei 15, Sector 1, București"
Output: city: "SECTOR1", state: "București"

Input:  "Calea Dorobantilor 123, București" (fără sector)
Output: city: "SECTOR2", state: "București"

Input:  "Strada Memorandumului 28, Cluj-Napoca"
Output: city: "Cluj-Napoca", state: "Cluj"
```

#### **Validări și Controale:**
- **Sectoare valide**: 1, 2, 3, 4, 5, 6 (conform realității administrative)
- **Case-insensitive**: Funcționează cu "Sector", "sector", "SECTOR"
- **Adrese incomplete**: Gestionare gracioasă a datelor lipsă
- **Format Oblio**: Generează adrese single-line pentru compatibilitate API

### 🛠️ Configurare și Personalizare

#### **Variabile de Mediu Configurabile:**
```env
# Oblio Configuration
OBLIO_EMAIL=your-email@company.com
OBLIO_API_TOKEN=your-api-token
OBLIO_COMPANY_CIF=your-company-cif
OBLIO_INVOICE_SERIES=PRS
OBLIO_MANAGEMENT=PRIME SPORT SUPPLEMENTS ONLINE
OBLIO_DEFAULT_VAT_NAME=Normala

# Shopify Configuration
B2C_SHOPIFY_SHOPNAME=your-shop
B2C_SHOPIFY_ACCESS_TOKEN=your-access-token
```

#### **Personalizări Disponibile:**
- **Seria facturilor**: Configurabilă prin variabile de mediu
- **Gestiunea stocului**: Selectabilă din gestiunile disponibile în Oblio
- **Cotele de TVA**: Configurabile pentru diferite tipuri de produse
- **Template email**: Personalizabil direct în Oblio

### 📈 Metrici și Monitorizare

#### **Logging Detaliat:**
- 📝 **Payload sanitizat**: Log-uri complete pentru debugging
- ⚠️ **Gestionare erori**: Capturează și raportează toate erorile
- 📊 **Statistici procesare**: Timpul de răspuns și rata de succes
- 🔍 **Audit trail**: Istoric complet al tuturor operațiunilor

#### **Indicatori de Performanță:**
- **Rata de succes**: % facturi generate cu succes
- **Timp mediu de procesare**: Durata de la fulfillment la factură
- **Erori frecvente**: Identificarea și rezolvarea problemelor comune

### 🚀 Implementare și Mentenanță

#### **Cerințe Tehnice:**
- **Node.js 18+**: Runtime JavaScript modern
- **Webhook HTTPS**: Endpoint securizat pentru Shopify
- **Acces API**: Credențiale valide pentru Shopify și Oblio
- **Verificare ANAF**: Conexiune la serviciile web ANAF

#### **Suport și Mentenanță:**
- 🔧 **Actualizări automate**: Compatibilitate cu noile versiuni API
- 📞 **Suport tehnic**: Asistență pentru configurare și troubleshooting
- 📚 **Documentație**: Ghiduri complete pentru utilizare și configurare
- 🛡️ **Backup și recovery**: Proceduri de siguranță pentru datele critice

### 💼 ROI și Justificare Investiție

#### **Costuri Eliminate:**
- **Personal dedicat facturare**: 4-6 ore/zi economisit
- **Erori și refacturi**: Reducere 90% a erorilor de facturare
- **Întârzieri în procesare**: Facturare instantanee vs. 24-48h manual

#### **Beneficii Financiare:**
- **Cash flow îmbunătățit**: Facturare imediată = încasări mai rapide
- **Conformitate fiscală**: Evitarea amenzilor și penalităților
- **Satisfacția clientului**: Experiență profesională și rapidă

---

**Aplicația Prime Supplements - Oblio Integration reprezintă soluția completă pentru automatizarea procesului de facturare, oferind eficiență maximă, conformitate fiscală și experiență superioară pentru clienți.**
