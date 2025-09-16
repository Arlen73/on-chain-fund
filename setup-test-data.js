#!/usr/bin/env node

// 測試腳本：創建測試基金資料並驗證 ManagerDashboard 載入
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001/api';

async function setupTestData() {
  console.log('🧪 設置測試資料...\n');
  
  try {
    // 創建幾個測試基金
    const testFunds = [
      {
        fundName: '穩健增長基金',
        fundSymbol: 'SGF',
        vaultProxy: '0x1111111111111111111111111111111111111111',
        comptrollerProxy: '0x2222222222222222222222222222222222222222',
        denominationAsset: '0xA0b86a33E6441f8C8c36e42a1c8E8c42D1E8eDD8',
        creator: '0xtest123456789',
        txHash: '0xhash1'
      },
      {
        fundName: 'DeFi 精選基金',
        fundSymbol: 'DIF',
        vaultProxy: '0x3333333333333333333333333333333333333333',
        comptrollerProxy: '0x4444444444444444444444444444444444444444',
        denominationAsset: '0xA0b86a33E6441f8C8c36e42a1c8E8c42D1E8eDD8',
        creator: '0xtest123456789',
        txHash: '0xhash2'
      },
      {
        fundName: '他人創建的基金',
        fundSymbol: 'OTHER',
        vaultProxy: '0x5555555555555555555555555555555555555555',
        comptrollerProxy: '0x6666666666666666666666666666666666666666',
        denominationAsset: '0xA0b86a33E6441f8C8c36e42a1c8E8c42D1E8eDD8',
        creator: '0xother987654321',
        txHash: '0xhash3'
      }
    ];

    for (const fund of testFunds) {
      const response = await axios.post(`${API_BASE_URL}/funds`, fund);
      console.log(`✅ 已創建基金: ${fund.fundName} (${fund.fundSymbol})`);
    }

    console.log('\n📋 獲取所有基金...');
    const allFundsResponse = await axios.get(`${API_BASE_URL}/funds`);
    console.log(`總共 ${allFundsResponse.data.data.length} 個基金`);

    console.log('\n🔍 獲取特定創建者的基金...');
    const creatorFundsResponse = await axios.get(`${API_BASE_URL}/funds?creator=0xtest123456789`);
    console.log(`創建者 0xtest123456789 有 ${creatorFundsResponse.data.data.length} 個基金:`);
    creatorFundsResponse.data.data.forEach((fund, index) => {
      console.log(`  ${index + 1}. ${fund.fundName} (${fund.fundSymbol}) - ${fund.vaultProxy}`);
    });

    console.log('\n🎉 測試資料設置完成！');
    console.log('\n💡 使用說明:');
    console.log('1. 打開 http://localhost:3001/manager/dashboard');
    console.log('2. 連接錢包地址 0xtest123456789');
    console.log('3. 應該看到 2 個基金（穩健增長基金和 DeFi 精選基金）');
    console.log('4. 第三個基金不會顯示，因為創建者不同');

  } catch (error) {
    console.error('❌ 測試失敗:', error.response?.data || error.message);
    process.exit(1);
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  setupTestData();
}

module.exports = { setupTestData };
