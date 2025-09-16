// 測試 ExploreFunds 組件的數據載入功能
const baseUrl = 'http://localhost:3304/api';

async function testExploreFunds() {
  console.log('🧪 測試 ExploreFunds 數據載入...\n');

  try {
    // 1. 獲取所有基金數據
    console.log('📋 載入所有基金數據...');
    const response = await fetch(`${baseUrl}/funds`);
    const result = await response.json();

    if (!result.success) {
      console.log('❌ API 請求失敗:', result.error);
      return;
    }

    const funds = result.data;
    console.log(`✅ 成功載入 ${funds.length} 個基金\n`);

    if (funds.length === 0) {
      console.log('⚠️  沒有找到任何基金數據。');
      console.log('💡 建議: 先在 ManagerDashboard 中創建一些基金。');
      return;
    }

    // 2. 顯示每個基金的詳細資訊
    funds.forEach((fund, index) => {
      console.log(`💼 基金 #${index + 1}:`);
      console.log(`  名稱: ${fund.fundName} (${fund.fundSymbol})`);
      console.log(`  管理者: ${fund.creator}`);
      console.log(`  Vault 地址: ${fund.vaultProxy}`);
      console.log(`  計價資產: ${fund.denominationAsset}`);
      console.log(`  總資產: ${fund.totalAssets || 'N/A'}`);
      console.log(`  份額價格: $${fund.sharePrice || 'N/A'}`);
      console.log(`  狀態: ${fund.status}`);
      console.log(`  創建時間: ${new Date(fund.createdAt).toLocaleString()}`);
      console.log('');
    });

    // 3. 測試計價資產識別
    console.log('🪙 計價資產分析:');
    const assetCounts = {};
    funds.forEach(fund => {
      const asset = fund.denominationAsset;
      assetCounts[asset] = (assetCounts[asset] || 0) + 1;
    });

    for (const [asset, count] of Object.entries(assetCounts)) {
      console.log(`  ${asset}: ${count} 個基金使用此資產`);
    }

    // 4. 模擬 UI 顯示邏輯
    console.log('\n📊 UI 顯示模擬:');

    // 計算模擬績效數據（和組件中的邏輯一致）
    const mockPerformances = [
      { perf24h: '+2.34%', perf7d: '+15.67%', perf30d: '+25.43%' },
      { perf24h: '-0.55%', perf7d: '+8.32%', perf30d: '+18.94%' },
      { perf24h: '+0.02%', perf7d: '+0.15%', perf30d: '+0.85%' },
      { perf24h: '+1.45%', perf7d: '+12.33%', perf30d: '+22.11%' },
      { perf24h: '-0.88%', perf7d: '+5.44%', perf30d: '+15.67%' }
    ];

    const strategies = [
      '多元化配置主流加密貨幣和DeFi藍籌項目',
      '專注於經過驗證的DeFi協議和藍籌代幣', 
      '利用不同平台間穩定幣價差進行低風險套利',
      '高頻交易和量化策略',
      '跨鏈套利和流動性挖礦'
    ];

    const riskLevels = ['低', '中等', '中高', '高'];

    funds.forEach((fund, index) => {
      const mockData = mockPerformances[index % mockPerformances.length];
      const strategy = strategies[index % strategies.length];
      const riskLevel = riskLevels[index % riskLevels.length];
      const totalInvestors = Math.floor(Math.random() * 800) + 50;

      console.log(`🎨 ${fund.fundName} UI 顯示:`);
      console.log(`  策略: ${strategy}`);
      console.log(`  風險等級: ${riskLevel}`);
      console.log(`  模擬投資人數: ${totalInvestors}`);
      console.log(`  24h 績效: ${mockData.perf24h}`);
      console.log(`  7d 績效: ${mockData.perf7d}`);
      console.log(`  30d 績效: ${mockData.perf30d}`);
      console.log('');
    });

    // 5. 篩選功能測試
    console.log('🔍 篩選功能測試:');

    // 高收益基金 (30天收益 > 20%)
    const highPerformanceFunds = funds.filter((_, index) => {
      const mockData = mockPerformances[index % mockPerformances.length];
      return parseFloat(mockData.perf30d.replace('%', '').replace('+', '')) > 20;
    });
    console.log(`  高收益基金: ${highPerformanceFunds.length} 個`);

    // DeFi 基金
    const defiFunds = funds.filter(fund => 
      fund.fundName.toLowerCase().includes('defi')
    );
    console.log(`  DeFi 基金: ${defiFunds.length} 個`);

    // 低風險基金
    const lowRiskCount = funds.filter((_, index) => 
      riskLevels[index % riskLevels.length] === '低'
    ).length;
    console.log(`  低風險基金: ${lowRiskCount} 個`);

    console.log('\n🎉 ExploreFunds 測試完成！');
    console.log('💡 建議: 在瀏覽器中查看 /explore 頁面以驗證 UI 顯示');

  } catch (error) {
    console.error('❌ 測試過程中發生錯誤:', error);
  }
}

// 執行測試
testExploreFunds().catch(console.error);
