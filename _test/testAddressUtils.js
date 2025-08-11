import { 
    extractBucharestSector, 
    formatRomanianLocality, 
    formatRomanianAddress, 
    isBucharestAddress, 
    getBucharestSectors, 
    isValidBucharestSector 
} from '../utils/addressUtils.js';

console.log('🧪 Testing Address Utils Functionality\n');

// Test data - various Romanian address scenarios
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
        name: 'Bucharest Sector 3 (different format)',
        address: {
            address1: 'Bulevardul Unirii 45, sector3',
            city: 'Bucharest',
            province: 'Bucuresti',
            province_code: 'B',
            zip: '030823',
            country: 'Romania'
        }
    },
    {
        name: 'Bucharest without sector in address',
        address: {
            address1: 'Calea Dorobantilor 123',
            city: 'Bucuresti',
            province: 'Bucuresti',
            province_code: 'B',
            zip: '010573',
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
        name: 'Brasov',
        address: {
            address1: 'Egretei 11, Bl 26, ap 15',
            city: 'Brasov',
            province: 'Brașov',
            province_code: 'BV',
            zip: '500461',
            country: 'Romania'
        }
    },
    {
        name: 'Constanta',
        address: {
            address1: 'Bulevardul Mamaia 124',
            city: 'Constanta',
            province: 'Constanta',
            province_code: 'CT',
            zip: '900527',
            country: 'Romania'
        }
    },
    {
        name: 'Empty address',
        address: null
    },
    {
        name: 'Incomplete address',
        address: {
            address1: 'Some street',
            city: '',
            province_code: ''
        }
    }
];

console.log('='.repeat(60));
console.log('1. Testing extractBucharestSector()');
console.log('='.repeat(60));

const sectorTestStrings = [
    'Strada Victoriei 15, Sector 1',
    'Bulevardul Unirii 45, sector3',
    'Calea Dorobantilor 123, SECTOR 2',
    'Piata Universitatii, sector 4',
    'Random street without sector',
    'sector5 at the beginning',
    'Multiple sector1 and sector2 mentions',
    null,
    ''
];

sectorTestStrings.forEach(str => {
    const sector = extractBucharestSector(str);
    console.log(`"${str}" → Sector: ${sector || 'none'}`);
});

console.log('\n' + '='.repeat(60));
console.log('2. Testing isBucharestAddress()');
console.log('='.repeat(60));

testAddresses.forEach(test => {
    const isBucharest = isBucharestAddress(test.address);
    console.log(`${test.name}: ${isBucharest ? '✅ Bucharest' : '❌ Not Bucharest'}`);
});

console.log('\n' + '='.repeat(60));
console.log('3. Testing formatRomanianLocality()');
console.log('='.repeat(60));

testAddresses.forEach(test => {
    if (test.address) {
        const locality = formatRomanianLocality(test.address);
        console.log(`${test.name}: "${locality}"`);
    }
});

console.log('\n' + '='.repeat(60));
console.log('4. Testing formatRomanianAddress()');
console.log('='.repeat(60));

testAddresses.forEach(test => {
    const formatted = formatRomanianAddress(test.address);
    console.log(`\n${test.name}:`);
    console.log(`  Street: "${formatted.street}"`);
    console.log(`  City: "${formatted.city}"`);
    console.log(`  State: "${formatted.state}"`);
    console.log(`  ZIP: "${formatted.zip}"`);
    console.log(`  Country: "${formatted.country}"`);
});

console.log('\n' + '='.repeat(60));
console.log('5. Testing getBucharestSectors() and isValidBucharestSector()');
console.log('='.repeat(60));

const sectors = getBucharestSectors();
console.log(`Available sectors: [${sectors.join(', ')}]`);

const testSectors = ['1', '2', '3', '4', '5', '6', '7', '0', 'invalid', null];
testSectors.forEach(sector => {
    const isValid = isValidBucharestSector(sector);
    console.log(`Sector "${sector}": ${isValid ? '✅ Valid' : '❌ Invalid'}`);
});

console.log('\n' + '='.repeat(60));
console.log('6. Integration Test - Complete Address Processing');
console.log('='.repeat(60));

// Simulate how addresses are processed in the invoice controller
testAddresses.forEach(test => {
    if (test.address) {
        console.log(`\n📍 Processing: ${test.name}`);
        
        const formatted = formatRomanianAddress(test.address);
        const singleLineAddress = [formatted.street, formatted.zip, formatted.country]
            .filter(Boolean)
            .join(', ');
        
        console.log(`  Formatted for Oblio:`);
        console.log(`    address: "${singleLineAddress}"`);
        console.log(`    city: "${formatted.city}"`);
        console.log(`    state: "${formatted.state}"`);
        console.log(`    country: "${formatted.country}"`);
        
        if (isBucharestAddress(test.address)) {
            const sector = extractBucharestSector(test.address.address1);
            console.log(`    🏛️ Bucharest detected - Sector: ${sector || 'default (2)'}`);
        }
    }
});

console.log('\n' + '='.repeat(60));
console.log('✅ Address Utils Testing Complete');
console.log('='.repeat(60));
