import { 
    extractBucharestSector,
    formatRomanianLocality,
    formatRomanianAddress,
    isBucharestAddress,
    getBucharestSectors,
    isValidBucharestSector
} from './utils/index.js';

console.log('🧪 Testing Address Utils...\n');

// Test data - Shopify order addresses
const testAddresses = [
    {
        name: 'Bucharest Sector 1',
        address: {
            address1: 'Strada Victoriei 15, Sector 1',
            city: 'Bucuresti',
            province: 'Bucuresti',
            province_code: 'B',
            zip: '010071',
            country: 'Romania'
        }
    },
    {
        name: 'Bucharest Sector 3',
        address: {
            address1: 'Bulevardul Unirii 45, sector 3',
            city: 'Bucuresti',
            province: 'Bucuresti',
            province_code: 'B',
            zip: '030825',
            country: 'Romania'
        }
    },
    {
        name: 'Bucharest without sector',
        address: {
            address1: 'Strada Amzei 10',
            city: 'Bucuresti',
            province: 'Bucuresti',
            province_code: 'B',
            zip: '010024',
            country: 'Romania'
        }
    },
    {
        name: 'Cluj-Napoca',
        address: {
            address1: 'Strada Memorandumului 28',
            city: 'Cluj-Napoca',
            province: 'Cluj',
            province_code: 'CJ',
            zip: '400114',
            country: 'Romania'
        }
    },
    {
        name: 'Timisoara',
        address: {
            address1: 'Piata Victoriei 2',
            city: 'Timisoara',
            province: 'Timis',
            province_code: 'TM',
            zip: '300006',
            country: 'Romania'
        }
    }
];

console.log('🔍 Testing Address Processing:');
console.log('=' .repeat(60));

testAddresses.forEach((test, index) => {
    console.log(`\n${index + 1}. ${test.name}`);
    console.log(`   Original: ${test.address.address1}, ${test.address.city}`);
    
    // Test sector extraction
    const sector = extractBucharestSector(test.address.address1);
    console.log(`   Sector: ${sector || 'Not found'}`);
    
    // Test Bucharest detection
    const isBucharest = isBucharestAddress(test.address);
    console.log(`   Is Bucharest: ${isBucharest}`);
    
    // Test locality formatting
    const locality = formatRomanianLocality(test.address);
    console.log(`   Formatted Locality: ${locality}`);
    
    // Test complete address formatting
    const formattedAddress = formatRomanianAddress(test.address);
    console.log(`   Formatted Address:`, formattedAddress);
});

console.log('\n\n🔍 Testing Sector Validation:');
console.log('=' .repeat(60));

const testSectors = ['1', '2', '3', '4', '5', '6', '7', '8', 'invalid'];
testSectors.forEach(sector => {
    const isValid = isValidBucharestSector(sector);
    console.log(`   Sector ${sector}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
});

console.log('\n\n📋 Available Bucharest Sectors:');
console.log('=' .repeat(60));
const sectors = getBucharestSectors();
console.log(`   ${sectors.join(', ')}`);

console.log('\n✅ Address utils testing completed!');
