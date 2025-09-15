# Address Validation Debug Guide

## Issue: "The recipient's locality could not be matched!"

This error occurs when Cargus API cannot match the city/locality name in the shipping address with their internal database.

## 🔍 **Debugging Steps**

### 1. Test Address Validation

Run the address validation test to see what's happening:

```bash
# Test all common addresses
npm run test:address

# Test specific address
npm run test:address "Cluj-Napoca" "Cluj"
npm run test:address "Bucuresti" "Bucuresti"
```

### 2. Check Server Logs

Look for detailed logs about the locality validation process:

```bash
# Search for locality validation logs
grep "Starting locality validation" server.log
grep "Successfully mapped locality" server.log
grep "Locality not found" server.log
```

### 3. Common Issues & Solutions

#### **Issue: County Name Mismatch**
```
Error: County 'Bucharest' not found
```
**Solution**: Use Romanian county names:
- ❌ `Bucharest` → ✅ `Bucuresti`
- ❌ `Transylvania` → ✅ `Cluj`, `Brasov`, etc.

#### **Issue: City Name with Diacritics**
```
Error: Locality 'Brașov' not found
```
**Solution**: The system should auto-normalize, but try without diacritics:
- ❌ `Brașov` → ✅ `Brasov`
- ❌ `Timișoara` → ✅ `Timisoara`

#### **Issue: City Name with Prefixes**
```
Error: Locality 'Municipiul București' not found
```
**Solution**: Remove administrative prefixes:
- ❌ `Municipiul București` → ✅ `Bucuresti`
- ❌ `Orașul Cluj-Napoca` → ✅ `Cluj-Napoca`

#### **Issue: Hyphenated City Names**
```
Error: Locality 'Cluj Napoca' not found
```
**Solution**: Use correct hyphenation:
- ❌ `Cluj Napoca` → ✅ `Cluj-Napoca`
- ❌ `Targu Mures` → ✅ `Targu-Mures`

## 🛠️ **Manual Address Fixing**

### 1. Check Available Localities

The improved validation will show available localities in the error message:

```
Locality 'SomeCity' not found in county 'SomeCounty'. 
Available localities: Locality1, Locality2, Locality3...
```

### 2. Update Extension Form

If you find the correct locality name, you can:

1. **Update the extension** to auto-correct common mistakes
2. **Add address validation** in the extension UI
3. **Create a mapping table** for common address variations

### 3. Common Romanian Address Mappings

```javascript
const addressMappings = {
    // Cities
    'Bucharest': 'Bucuresti',
    'Brasov': 'Brasov',
    'Cluj': 'Cluj-Napoca',
    'Timisoara': 'Timisoara',
    'Constanta': 'Constanta',
    'Iasi': 'Iasi',
    'Craiova': 'Craiova',
    'Galati': 'Galati',
    
    // Counties  
    'Bucharest': 'Bucuresti',
    'Brasov County': 'Brasov',
    'Cluj County': 'Cluj',
    'Timis County': 'Timis'
};
```

## 🔧 **Advanced Debugging**

### 1. Enable Detailed Logging

The improved `CargusAdapter` now provides detailed logs:

- ✅ County search results
- ✅ Available localities list
- ✅ Normalization process
- ✅ Fuzzy matching attempts

### 2. Test with Real Cargus Data

```bash
# Test specific problematic address
node _tests/address-validation-test.js "ProblematicCity" "ProblematicCounty"
```

### 3. Check Cargus API Response

The logs will show:
- Available counties in Romania
- Available localities in the specific county
- Normalization steps
- Matching attempts (exact, partial, fuzzy)

## 📋 **Validation Process**

The improved validation follows these steps:

1. **Country Lookup**: Find Romania in Cargus countries
2. **County Matching**: Find exact county match
3. **Locality Retrieval**: Get all localities for county
4. **Normalization**: Remove diacritics, prefixes, extra spaces
5. **Exact Match**: Try exact normalized match
6. **Partial Match**: Try partial/contains matching
7. **Fuzzy Match**: Try fuzzy matching with prefix removal
8. **Error with Suggestions**: Show available localities if no match

## 🚨 **Error Prevention**

### 1. Extension Validation

Add client-side validation in the extension:

```javascript
const validateAddress = (address) => {
    const commonMappings = {
        'Bucharest': 'Bucuresti',
        'Brasov': 'Brasov'
        // Add more mappings
    };
    
    // Auto-correct common mistakes
    if (commonMappings[address.city]) {
        address.city = commonMappings[address.city];
    }
    
    return address;
};
```

### 2. Backend Validation

The improved `CargusAdapter` now:
- ✅ Provides detailed error messages
- ✅ Shows available alternatives
- ✅ Handles diacritics automatically
- ✅ Removes common prefixes
- ✅ Performs fuzzy matching

## 📞 **When All Else Fails**

1. **Check Cargus Documentation**: Verify if the locality exists in their system
2. **Contact Cargus Support**: Some localities might be missing or have different names
3. **Use Nearest Major City**: As a fallback, use the nearest major city that works
4. **Manual Address Override**: Allow manual address entry for edge cases

## 🧪 **Testing Checklist**

- [ ] Test common Romanian cities (București, Cluj-Napoca, Timișoara)
- [ ] Test cities with diacritics (Brașov, Iași, Târgu-Mureș)
- [ ] Test cities with prefixes (Municipiul, Orașul)
- [ ] Test hyphenated cities (Cluj-Napoca, Târgu-Mureș)
- [ ] Test edge cases (small villages, communes)
- [ ] Test county name variations
- [ ] Test address normalization
- [ ] Test error message clarity
