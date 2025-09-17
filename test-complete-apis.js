// 完整 API 測試腳本
const baseUrl = 'http://localhost:3304/api';

// 模擬數據
const testFundData = {
  fundName: '測試基金 API',
  fundSymbol: 'TESTAPI',
  vaultProxy: '0x1234567890123456789012345678901234567890',
  comptrollerProxy: '0x9876543210987654321098765432109876543210',
  denominationAsset: '0xA0b86a33E6411a3CE6AE0dB93bE7c5b7C0Af5c90', // USDC
  creator: '0xTestCreatorAddress123456789012345678901234',
  txHash: '0xTestTxHash123456789012345678901234567890abcdef'
};

const testInvestorAddress = '0xTestInvestorAddress123456789012345678901234';

async function testAPI(endpoint, options = {}) {
  try {
    console.log(`\n🧪 測試 ${options.method || 'GET'} ${endpoint}`);
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ 成功:', JSON.stringify(data.data, null, 2));
      return data.data;
    } else {
      console.log('❌ 失敗:', data.error);
      return null;
    }
  } catch (error) {
    console.log('❌ 錯誤:', error.message);
    return null;
  }
}

async function runAllTests() {
  console.log('🚀 開始 API 完整測試...\n');
  
  // 1. 測試獲取所有基金 (空數據庫)
  await testAPI('/funds');
  
  // 2. 測試創建基金
  const fund = await testAPI('/funds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testFundData)
  });
  
  if (!fund) {
    console.log('❌ 無法創建基金，停止測試');
    return;
  }
  
  const fundId = fund.id;
  console.log(`\n📝 創建的基金 ID: ${fundId}`);
  
  // 3. 測試獲取所有基金 (有數據)
  await testAPI('/funds');
  
  // 4. 測試根據創建者獲取基金
  await testAPI(`/funds?creator=${encodeURIComponent(testFundData.creator)}`);
  
  // 5. 測試根據 vault 地址獲取基金
  await testAPI(`/funds?vault=${encodeURIComponent(testFundData.vaultProxy)}`);
  
  // 6. 測試搜尋基金
  await testAPI(`/funds?search=測試`);
  
  // 7. 測試記錄存款投資
  const depositData = {
    fundId: fundId,
    investorAddress: testInvestorAddress,
    type: 'deposit',
    amount: '1000.50',
    shares: '1000.50',
    sharePrice: '1.00',
    txHash: '0xDepositTxHash123456789012345678901234567890'
  };
  
  const depositRecord = await testAPI('/funds/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(depositData)
  });
  
  // 8. 測試記錄贖回投資
  const redeemData = {
    fundId: fundId,
    investorAddress: testInvestorAddress,
    type: 'redeem',
    amount: '200.00',
    shares: '200.00',
    sharePrice: '1.00',
    txHash: '0xRedeemTxHash123456789012345678901234567890'
  };
  
  await testAPI('/funds/investments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(redeemData)
  });
  
  // 9. 測試獲取基金投資記錄
  await testAPI(`/funds/investments?fundId=${fundId}`);
  
  // 10. 測試獲取用戶在特定基金的投資記錄
  await testAPI(`/funds/investments?fundId=${fundId}&investor=${testInvestorAddress}`);
  
  // 11. 測試獲取用戶投資總結
  await testAPI(`/funds/investments/summary?fundId=${fundId}&investor=${testInvestorAddress}`);
  
  // 12. 測試錯誤處理 - 無效的基金 ID
  await testAPI('/funds/investments/summary?fundId=invalid&investor=' + testInvestorAddress);
  
  console.log('\n🎉 所有 API 測試完成！');
}

// 執行測試
runAllTests().catch(console.error);
