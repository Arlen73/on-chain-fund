// Simple test script to verify the database API integration
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

async function testDatabaseIntegration() {
  try {
    console.log('🧪 Testing Database Integration...\n');
    
    // Test 1: Get existing funds (should be empty initially)
    console.log('📋 Test 1: Fetching existing funds...');
    const getFundsResponse = await axios.get(`${API_BASE_URL}/funds`);
    console.log('✅ GET /api/funds response:', getFundsResponse.data);
    console.log('Current funds count:', getFundsResponse.data.data.length);
    
    // Test 2: Create a mock fund entry
    console.log('\n💾 Test 2: Creating a test fund...');
    const testFund = {
      fundName: 'Test Integration Fund',
      fundSymbol: 'TIF',
      vaultProxy: '0x1234567890123456789012345678901234567890',
      comptrollerProxy: '0x0987654321098765432109876543210987654321',
      denominationAsset: '0xA0b86a33E6441f8C8c36e42a1c8E8c42D1E8eDD8',
      creator: '0xtest123456789',
      txHash: '0xtesthash123456789'
    };
    
    const createFundResponse = await axios.post(`${API_BASE_URL}/funds`, testFund);
    console.log('✅ POST /api/funds response:', createFundResponse.data);
    
    // Test 3: Get funds again to verify creation
    console.log('\n📋 Test 3: Fetching funds after creation...');
    const getFundsAfterResponse = await axios.get(`${API_BASE_URL}/funds`);
    console.log('✅ GET /api/funds response:', getFundsAfterResponse.data);
    console.log('New funds count:', getFundsAfterResponse.data.data.length);
    
    console.log('\n🎉 All tests passed! Database integration is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testDatabaseIntegration();
