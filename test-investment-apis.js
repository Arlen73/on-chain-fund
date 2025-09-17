#!/usr/bin/env node

// 測試投資記錄 API 的完整功能
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3304/api';

async function testInvestmentAPIs() {
  console.log('🧪 測試投資記錄 API...\n');
  
  try {
    // 步驟 1: 創建一個測試基金
    console.log('📋 步驟 1: 創建測試基金...');
    const testFund = {
      fundName: '投資記錄測試基金',
      fundSymbol: 'TEST',
      vaultProxy: '0x1111111111111111111111111111111111111111',
      comptrollerProxy: '0x2222222222222222222222222222222222222222',
      denominationAsset: '0xA0b86a33E6441f8C8c36e42a1c8E8c42D1E8eDD8',
      creator: '0xtest123456789',
      txHash: '0xtestfundcreation'
    };
    
    const createFundResponse = await axios.post(`${API_BASE_URL}/funds`, testFund);
    const createdFund = createFundResponse.data.data;
    console.log(`✅ 基金創建成功: ${createdFund.fundName} (ID: ${createdFund.id})\n`);

    // 步驟 2: 記錄第一筆投資
    console.log('📋 步驟 2: 記錄第一筆投資...');
    const investment1 = {
      fundId: createdFund.id,
      investorAddress: '0xtest123456789',
      type: 'deposit',
      amount: '1000.50',
      shares: '1000.50',
      sharePrice: '1.00',
      txHash: '0xinvestment1hash'
    };
    
    const recordInvestment1 = await axios.post(`${API_BASE_URL}/funds/investments`, investment1);
    console.log('✅ 第一筆投資記錄成功:', recordInvestment1.data.data.id);

    // 步驟 3: 記錄第二筆投資
    console.log('📋 步驟 3: 記錄第二筆投資...');
    const investment2 = {
      fundId: createdFund.id,
      investorAddress: '0xtest123456789',
      type: 'deposit',
      amount: '500.25',
      shares: '500.00',
      sharePrice: '1.0005',
      txHash: '0xinvestment2hash'
    };
    
    const recordInvestment2 = await axios.post(`${API_BASE_URL}/funds/investments`, investment2);
    console.log('✅ 第二筆投資記錄成功:', recordInvestment2.data.data.id);

    // 步驟 4: 記錄贖回操作
    console.log('📋 步驟 4: 記錄贖回操作...');
    const redemption = {
      fundId: createdFund.id,
      investorAddress: '0xtest123456789',
      type: 'redeem',
      amount: '250.00',
      shares: '250.00',
      sharePrice: '1.00',
      txHash: '0xredemptionhash'
    };
    
    const recordRedemption = await axios.post(`${API_BASE_URL}/funds/investments`, redemption);
    console.log('✅ 贖回操作記錄成功:', recordRedemption.data.data.id);

    // 步驟 5: 獲取基金的所有投資記錄
    console.log('📋 步驟 5: 獲取基金投資記錄...');
    const fundHistoryResponse = await axios.get(`${API_BASE_URL}/funds/investments?fundId=${createdFund.id}`);
    console.log(`✅ 基金投資記錄 (共 ${fundHistoryResponse.data.data.length} 筆):`);
    fundHistoryResponse.data.data.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.type === 'deposit' ? '申購' : '贖回'}: $${record.amount} (${record.shares} 份額)`);
    });

    // 步驟 6: 獲取用戶在該基金的投資記錄
    console.log('\n📋 步驟 6: 獲取用戶投資記錄...');
    const userHistoryResponse = await axios.get(`${API_BASE_URL}/funds/investments?fundId=${createdFund.id}&investor=0xtest123456789`);
    console.log(`✅ 用戶投資記錄 (共 ${userHistoryResponse.data.data.length} 筆):`);
    userHistoryResponse.data.data.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.type === 'deposit' ? '申購' : '贖回'}: $${record.amount} (份額價格: $${record.sharePrice})`);
    });

    // 步驟 7: 獲取用戶投資總結
    console.log('\n📋 步驟 7: 獲取用戶投資總結...');
    const summaryResponse = await axios.get(`${API_BASE_URL}/funds/investments/summary?fundId=${createdFund.id}&investor=0xtest123456789`);
    const summary = summaryResponse.data.data;
    
    if (summary) {
      console.log('✅ 用戶投資總結:');
      console.log(`  📈 總投入金額: $${summary.totalDeposited}`);
      console.log(`  📉 總贖回金額: $${summary.totalRedeemed}`);
      console.log(`  💼 當前持有份額: ${summary.currentShares}`);
      console.log(`  💰 當前投資價值: $${summary.currentValue}`);
      console.log(`  📊 總收益: $${summary.totalReturn}`);
      console.log(`  📈 收益率: ${summary.returnPercentage}%`);
      console.log(`  📅 首次投資日期: ${new Date(summary.firstInvestmentDate).toLocaleDateString()}`);
      console.log(`  📅 最後交易日期: ${new Date(summary.lastTransactionDate).toLocaleDateString()}`);
    } else {
      console.log('⚠️ 沒有找到投資總結');
    }

    console.log('\n🎉 所有測試完成！投資記錄 API 運作正常。');

  } catch (error) {
    console.error('❌ 測試失敗:', error.response?.data || error.message);
    process.exit(1);
  }
}

// 如果直接執行此腳本
if (require.main === module) {
  testInvestmentAPIs();
}

module.exports = { testInvestmentAPIs };
