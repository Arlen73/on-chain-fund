// 測試 FundDetails 組件的數據載入和投資功能
const baseUrl = 'http://localhost:3304/api';

async function testFundDetails() {
  console.log('🧪 測試 FundDetails 功能...\n');

  try {
    // 1. 獲取所有基金
    console.log('📋 載入基金數據...');
    const fundsResponse = await fetch(`${baseUrl}/funds`);
    const fundsResult = await fundsResponse.json();

    if (!fundsResult.success || fundsResult.data.length === 0) {
      console.log('❌ 沒有找到基金數據。請先創建一些基金。');
      return;
    }

    const testFund = fundsResult.data[0]; // 使用第一個基金進行測試
    console.log(`✅ 找到測試基金: ${testFund.fundName} (${testFund.fundSymbol})`);
    console.log(`   基金 ID: ${testFund.id}`);
    console.log(`   Vault 地址: ${testFund.vaultProxy}`);
    console.log(`   Comptroller 地址: ${testFund.comptrollerProxy}`);
    console.log(`   計價資產: ${testFund.denominationAsset}`);
    console.log('');

    // 2. 測試基金詳情頁面可以正確載入的數據
    console.log('📊 基金詳情頁面數據檢查:');
    console.log(`   基金名稱: ${testFund.fundName}`);
    console.log(`   基金代號: ${testFund.fundSymbol}`);
    console.log(`   創建者: ${testFund.creator}`);
    console.log(`   總資產: ${testFund.totalAssets || 'N/A'}`);
    console.log(`   份額價格: ${testFund.sharePrice || '1.00'}`);
    console.log(`   狀態: ${testFund.status}`);
    console.log(`   創建時間: ${new Date(testFund.createdAt).toLocaleDateString()}`);
    console.log('');

    // 3. 模擬投資流程測試
    const testInvestorAddress = '0x1cF1fb97E6A4AfaA4167FA19d52AD19D6689C677';
    
    console.log('💰 模擬投資流程測試:');
    console.log(`   投資人地址: ${testInvestorAddress}`);
    
    // 檢查是否已有投資記錄
    const existingSummary = await fetch(
      `${baseUrl}/funds/investments/summary?fundId=${testFund.id}&investor=${testInvestorAddress}`
    );
    const summaryResult = await existingSummary.json();
    
    if (summaryResult.success && summaryResult.data) {
      console.log('   ✅ 現有投資總結:');
      console.log(`      總投入: $${summaryResult.data.totalDeposited}`);
      console.log(`      總贖回: $${summaryResult.data.totalRedeemed}`);
      console.log(`      當前份額: ${summaryResult.data.currentShares}`);
      console.log(`      當前價值: $${summaryResult.data.currentValue}`);
      console.log(`      總收益: $${summaryResult.data.totalReturn} (${summaryResult.data.returnPercentage}%)`);
    } else {
      console.log('   ℹ️  尚無投資記錄');
    }

    // 4. 測試新投資記錄創建 (模擬前端投資操作)
    console.log('\n🔄 測試投資記錄創建:');
    const investmentData = {
      fundId: testFund.id,
      investorAddress: testInvestorAddress,
      type: 'deposit',
      amount: '1500.00',
      shares: (1500 / parseFloat(testFund.sharePrice || '1')).toString(),
      sharePrice: testFund.sharePrice || '1.00',
      txHash: `0xTestInvestment${Date.now()}Hash123456789012345678901234567890`
    };

    const investResponse = await fetch(`${baseUrl}/funds/investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(investmentData)
    });

    const investResult = await investResponse.json();
    if (investResult.success) {
      console.log('   ✅ 投資記錄創建成功');
      console.log(`      投資金額: $${investmentData.amount}`);
      console.log(`      獲得份額: ${investmentData.shares}`);
      console.log(`      份額價格: $${investmentData.sharePrice}`);
    } else {
      console.log(`   ❌ 投資記錄創建失敗: ${investResult.error}`);
    }

    // 5. 測試投資歷史記錄
    console.log('\n📈 檢查投資歷史記錄:');
    const historyResponse = await fetch(
      `${baseUrl}/funds/investments?fundId=${testFund.id}&investor=${testInvestorAddress}`
    );
    const historyResult = await historyResponse.json();

    if (historyResult.success && historyResult.data.length > 0) {
      console.log(`   ✅ 找到 ${historyResult.data.length} 筆投資記錄:`);
      historyResult.data.slice(0, 3).forEach((record, index) => {
        console.log(`   ${index + 1}. ${record.type} - $${record.amount} (${record.shares} 份額) - ${new Date(record.timestamp).toLocaleString()}`);
      });
    } else {
      console.log('   ℹ️  無投資歷史記錄');
    }

    // 6. 測試 UI 計算邏輯
    console.log('\n🧮 UI 計算邏輯測試:');
    const mockUserShares = '1000.5';
    const sharePrice = parseFloat(testFund.sharePrice || '1');
    const currentValue = parseFloat(mockUserShares) * sharePrice;
    
    console.log(`   用戶份額: ${mockUserShares}`);
    console.log(`   當前份額價格: $${sharePrice.toFixed(2)}`);
    console.log(`   計算當前價值: $${currentValue.toFixed(2)}`);
    
    // 預期份額計算 (投資時)
    const testInvestAmount = '500';
    const expectedShares = parseFloat(testInvestAmount) / sharePrice;
    console.log(`   投資 $${testInvestAmount} 預計獲得: ${expectedShares.toFixed(4)} 份額`);
    
    // 贖回金額計算
    const testRedeemShares = '200';
    const expectedAmount = parseFloat(testRedeemShares) * sharePrice;
    console.log(`   贖回 ${testRedeemShares} 份額預計獲得: $${expectedAmount.toFixed(2)}`);

    console.log('\n🎉 FundDetails 測試完成！');
    console.log('💡 建議: 在瀏覽器中訪問 /fund/[fundId] 頁面進行實際測試');

  } catch (error) {
    console.error('❌ 測試過程中發生錯誤:', error);
  }
}

// 執行測試
testFundDetails().catch(console.error);
