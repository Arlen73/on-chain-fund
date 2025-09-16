'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount } from '../lib/web3-context';
import { fundDatabaseService, FundData } from '../lib/fund-database-service';
import { DENOMINATION_ASSETS, formatTokenAmount } from '../lib/contracts';
import PerformanceChart from './ui/PerformanceChart';
import LoadingSpinner from './ui/LoadingSpinner';

// 基金顯示介面
interface DisplayFund extends FundData {
  performance24h: string;
  performance7d: string;  
  performance30d: string;
  performanceColor: string;
  totalInvestors: number;
  strategy: string;
  riskLevel: string;
  minInvestment: string;
}

export default function ExploreFunds() {
  const { isConnected } = useAccount();
  const [funds, setFunds] = useState<DisplayFund[]>([]);
  const [sortBy, setSortBy] = useState('performance30d');
  const [filterBy, setFilterBy] = useState('all');
  const [selectedChartFund, setSelectedChartFund] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFundsData();
  }, []);

  const loadFundsData = async () => {
    setIsLoading(true);
    try {
      const fundsData = await fundDatabaseService.getAllFunds();
      
      // 轉換基金數據為顯示格式，添加 mock 的展示數據
      const displayFunds: DisplayFund[] = fundsData.map((fund, index) => {
        // 生成模擬的績效數據 (實際應該從鏈上或其他數據源獲取)
        const mockPerformances = [
          { perf24h: '+2.34%', perf7d: '+15.67%', perf30d: '+25.43%' },
          { perf24h: '-0.55%', perf7d: '+8.32%', perf30d: '+18.94%' },
          { perf24h: '+0.02%', perf7d: '+0.15%', perf30d: '+0.85%' },
          { perf24h: '+1.45%', perf7d: '+12.33%', perf30d: '+22.11%' },
          { perf24h: '-0.88%', perf7d: '+5.44%', perf30d: '+15.67%' }
        ];
        
        const mockData = mockPerformances[index % mockPerformances.length];
        const isPositive24h = mockData.perf24h.startsWith('+');
        
        // 根據計價資產決定策略和風險等級
        const strategies = [
          '多元化配置主流加密貨幣和DeFi藍籌項目',
          '專注於經過驗證的DeFi協議和藍籌代幣', 
          '利用不同平台間穩定幣價差進行低風險套利',
          '高頻交易和量化策略',
          '跨鏈套利和流動性挖礦'
        ];
        
        const riskLevels = ['低', '中等', '中高', '高'];
        const minInvestments = ['50', '100', '500', '1000'];
        
        return {
          ...fund,
          performance24h: mockData.perf24h,
          performance7d: mockData.perf7d,
          performance30d: mockData.perf30d,
          performanceColor: isPositive24h ? 'text-success-600' : 'text-danger-600',
          totalInvestors: Math.floor(Math.random() * 800) + 50, // 50-850
          strategy: strategies[index % strategies.length],
          riskLevel: riskLevels[index % riskLevels.length],
          minInvestment: minInvestments[index % minInvestments.length]
        };
      });
      
      setFunds(displayFunds);
    } catch (error) {
      console.error('Error loading funds:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getDenominationAsset = (address: string) => {
    return DENOMINATION_ASSETS.find(asset => asset.address === address) || DENOMINATION_ASSETS[0];
  };

  const formatCurrency = (amount: string | undefined, asset: any) => {
    if (!amount) return '0 ' + asset.symbol;
    const value = parseFloat(amount);
    return `${formatTokenAmount(amount)} ${asset.symbol}`;
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case '低': return 'text-success-600 bg-success-50';
      case '中等': return 'text-yellow-600 bg-yellow-50';
      case '中高': return 'text-orange-600 bg-orange-50';
      case '高': return 'text-danger-600 bg-danger-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const sortedFunds = [...funds].sort((a, b) => {
    switch (sortBy) {
      case 'performance30d':
        return parseFloat(b.performance30d.replace('%', '').replace('+', '')) - parseFloat(a.performance30d.replace('%', '').replace('+', ''));
      case 'totalAssets':
        return parseFloat(b.totalAssets || '0') - parseFloat(a.totalAssets || '0');
      case 'sharePrice':
        return parseFloat(b.sharePrice || '0') - parseFloat(a.sharePrice || '0');
      default:
        return 0;
    }
  });

  const filteredFunds = sortedFunds.filter(fund => {
    if (filterBy === 'all') return true;
    if (filterBy === 'high-performance') return parseFloat(fund.performance30d.replace('%', '').replace('+', '')) > 20;
    if (filterBy === 'low-risk') return fund.riskLevel === '低';
    if (filterBy === 'defi') return fund.fundName.toLowerCase().includes('defi');
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 頁面標題 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">探索基金</h1>
          <p className="text-gray-600 mt-2">發現並投資符合您需求的區塊鏈基金</p>
        </div>

        {/* 載入狀態 */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && (
          <>
        {/* 篩選和排序 */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterBy('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBy === 'all' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              全部基金
            </button>
            <button
              onClick={() => setFilterBy('high-performance')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBy === 'high-performance' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              高收益基金
            </button>
            <button
              onClick={() => setFilterBy('low-risk')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBy === 'low-risk' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              低風險基金
            </button>
            <button
              onClick={() => setFilterBy('defi')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterBy === 'defi' 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              DeFi 基金
            </button>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="performance30d">30天收益率排序</option>
            <option value="totalAssets">資產規模排序</option>
            <option value="sharePrice">份額淨值排序</option>
          </select>
        </div>

        {/* Performance Chart Section */}
        {selectedChartFund && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">基金表現圖表</h2>
              <button
                onClick={() => setSelectedChartFund(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕ 關閉圖表
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PerformanceChart
                fundId={selectedChartFund}
                fundName={funds.find(f => f.id === selectedChartFund)?.fundName}
                height={300}
              />
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">基金詳情</h3>
                {(() => {
                  const fund = funds.find(f => f.id === selectedChartFund);
                  return fund ? (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">基金名稱:</span>
                        <span className="font-medium">{fund.fundName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">管理規模:</span>
                        <span className="font-medium">{formatCurrency(fund.totalAssets, getDenominationAsset(fund.denominationAsset))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">份額淨值:</span>
                        <span className="font-medium">${fund.sharePrice || '0'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">30天收益:</span>
                        <span className={`font-medium ${fund.performanceColor}`}>
                          {fund.performance30d}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">投資人數:</span>
                        <span className="font-medium">{fund.totalInvestors.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">風險等級:</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getRiskColor(fund.riskLevel)}`}>
                          {fund.riskLevel}
                        </span>
                      </div>
                      <div className="pt-4 border-t">
                        <Link 
                          href={`/fund/${fund.id}`}
                          className="btn-primary w-full text-center"
                        >
                          開始投資
                        </Link>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        )}

        {/* 基金卡片 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFunds.map((fund) => {
            const denominationAsset = getDenominationAsset(fund.denominationAsset);
            
            return (
              <div key={fund.id} className="card hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{fund.fundName}</h3>
                    <p className="text-sm text-gray-600">{fund.fundSymbol}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(fund.riskLevel)}`}>
                    {fund.riskLevel}風險
                  </span>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">投資策略</p>
                  <p className="text-sm text-gray-800">{fund.strategy}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <p className="text-gray-600">總資產</p>
                    <p className="font-medium">{formatCurrency(fund.totalAssets, denominationAsset)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">份額淨值</p>
                    <p className="font-medium">${fund.sharePrice || '1.00'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">投資人數</p>
                    <p className="font-medium">{fund.totalInvestors}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">最小投資</p>
                    <p className="font-medium">{fund.minInvestment} {denominationAsset.symbol}</p>
                  </div>
                </div>

                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">績效表現</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-gray-500">24小時</p>
                      <p className={fund.performance24h.startsWith('+') ? 'text-success-600' : 'text-danger-600'}>
                        {fund.performance24h}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">7天</p>
                      <p className={fund.performance7d.startsWith('+') ? 'text-success-600' : 'text-danger-600'}>
                        {fund.performance7d}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">30天</p>
                      <p className={fund.performance30d.startsWith('+') ? 'text-success-600' : 'text-danger-600'}>
                        {fund.performance30d}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">計價資產:</span>
                    <span className="font-medium">{denominationAsset.icon} {denominationAsset.symbol}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedChartFund(selectedChartFund === fund.id ? null : fund.id)}
                    className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                      selectedChartFund === fund.id
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {selectedChartFund === fund.id ? '關閉圖表' : '查看圖表'}
                  </button>
                  <Link
                    href={`/fund/${fund.id}`}
                    className="flex-1 text-center py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    查看詳情
                  </Link>
                  {isConnected && (
                    <Link
                      href={`/fund/${fund.id}#invest`}
                      className="flex-1 text-center py-2 px-4 bg-success-500 hover:bg-success-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      立即投資
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredFunds.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">沒有找到符合條件的基金</h3>
            <p className="text-gray-600 mb-6">請嘗試調整篩選條件</p>
            <button
              onClick={() => setFilterBy('all')}
              className="btn-primary"
            >
              查看全部基金
            </button>
          </div>
        )}

        {!isConnected && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="text-blue-400 mr-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h4 className="text-blue-800 font-medium mb-1">連接錢包開始投資</h4>
                <p className="text-blue-700 text-sm">請連接您的錢包以投資基金並管理您的投資組合。</p>
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
