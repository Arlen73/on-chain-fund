'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount } from '../lib/web3-context';
import { fundDatabaseService, FundData, UserInvestmentSummary } from '../lib/fund-database-service';
import { DENOMINATION_ASSETS, ERC20_ABI, formatTokenAmount, VAULT_PROXY_ABI } from '../lib/contracts';
import LoadingSpinner from './ui/LoadingSpinner';
import { ethers } from 'ethers';
import { FundService } from '@/lib/fund-service';

// 投資組合項目介面
interface PortfolioItem {
  fundId: string;
  fundName: string;
  fundSymbol: string;
  vaultProxy: string;
  denominationAsset: string;
  currentShares: string;
  currentValue: string;
  sharePrice: string;
}

// 投資組合總結介面
interface PortfolioSummary {
  totalValue: string;
  totalDeposited: string;
  totalReturn: string;
  returnPercentage: string;
  totalFunds: number;
  bestPerformer?: {
    symbol: string;
    performance: string;
  };
}

export default function InvestorDashboard() {
  const { address, isConnected } = useAccount();
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary>({
    totalValue: '0',
    totalDeposited: '0',
    totalReturn: '0',
    returnPercentage: '0',
    totalFunds: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  useEffect(() => {
    if (isConnected && address) {
      loadPortfolioData();
    } else {
      // Reset data when wallet disconnected
      setPortfolio([]);
      setPortfolioSummary({
        totalValue: '0',
        totalDeposited: '0',
        totalReturn: '0',
        returnPercentage: '0',
        totalFunds: 0
      });
    }
  }, [isConnected, address]);

  // useEffect(() => {
  //   if (portfolio.length > 0) {
  //     const summary = calculatePortfolioSummary(portfolio);
  //     setPortfolioSummary(summary);
  //   }
  // }, [portfolio]);

  // const calculatePortfolioSummary = (portfolioData: PortfolioItem[]): PortfolioSummary => {
  //   let totalValue = 0;
  //   let totalDeposited = 0;
  //   let totalRedeemed = 0;
  //   let bestPerformer: { symbol: string; performance: string } | undefined;
  //   let bestPerformanceValue = -Infinity;

  //   portfolioData.forEach(item => {
  //     // 計算實際淨投入：總投入 - 總贖回
  //     const itemDeposited = parseFloat(item.totalDeposited);
  //     const itemRedeemed = parseFloat(item.totalRedeemed);
  //     const netInvestment = itemDeposited - itemRedeemed;
      
  //     totalValue += parseFloat(item.currentValue);
  //     totalDeposited += itemDeposited;
  //     totalRedeemed += itemRedeemed;
      
  //     const returnPercentage = parseFloat(item.returnPercentage);
  //     if (returnPercentage > bestPerformanceValue) {
  //       bestPerformanceValue = returnPercentage;
  //       bestPerformer = {
  //         symbol: item.fundSymbol,
  //         performance: `${returnPercentage >= 0 ? '+' : ''}${returnPercentage.toFixed(2)}%`
  //       };
  //     }
  //   });

  //   // 計算總收益：當前價值 - (總投入 - 總贖回)
  //   const netInvestment = totalDeposited - totalRedeemed;
  //   const totalReturn = totalValue - netInvestment;
  //   const returnPercentage = netInvestment > 0 ? (totalReturn / netInvestment) * 100 : 0;

  //   return {
  //     totalValue: totalValue.toFixed(2),
  //     totalDeposited: netInvestment.toFixed(2), // 顯示淨投入
  //     totalReturn: totalReturn.toFixed(2),
  //     returnPercentage: returnPercentage.toFixed(2),
  //     totalFunds: portfolioData.length,
  //     bestPerformer
  //   };
  // };

  const loadPortfolioData = async () => {
    if (!address) return;
    
    setIsLoading(true);
    try {
      // 1. 獲取所有基金
      const allFunds = await fundDatabaseService.getAllFunds();

      console.log('All Funds:', allFunds);
      
      if (allFunds.length === 0) {
        setPortfolio([]);
        setLastUpdated(new Date());
        return;
      }

      // 2. 為每個基金獲取用戶的投資總結
      const portfolioPromises = allFunds.map(async (fund) => {
        try {
            if (!window.ethereum) {
              alert('請先連接您的錢包');
              return {...fund};
            }
            const provider = new ethers.BrowserProvider(window.ethereum);
            const fundService = new FundService(provider);


            const vault = new ethers.Contract(fund.vaultProxy, VAULT_PROXY_ABI, provider);
            const underlying = new ethers.Contract(fund.denominationAsset, ERC20_ABI, provider);
            
            const decimals = getDenominationAsset(fund.denominationAsset).decimals;
            const totalSupplyRaw = await vault.totalSupply();
            const totalSupply = ethers.formatUnits(totalSupplyRaw, 18);
            const vaultBalanceRaw = await underlying.balanceOf(fund.vaultProxy);
            const vaultBalance = ethers.formatUnits(vaultBalanceRaw, decimals);

            const userShares = await fundService.getUserBalance(fund.vaultProxy, address);

            const sharePrice =
              parseFloat(totalSupply) > 0
                ? (parseFloat(vaultBalance) / parseFloat(totalSupply)).toFixed(6)
                : "1.000000";
                
            return {
              fundId: fund.id,
              fundName: fund.fundName,
              fundSymbol: fund.fundSymbol,
              vaultProxy: fund.vaultProxy,
              denominationAsset: fund.denominationAsset,
              currentShares: userShares,
              currentValue: vaultBalance,
              sharePrice
            } as PortfolioItem;
        } catch (error) {
          console.warn(`Failed to get investment summary for fund ${fund.id}:`, error);
          return null;
        }
      });

      const portfolioResults = await Promise.all(portfolioPromises);
      const validPortfolio = portfolioResults.filter(
        (item): item is PortfolioItem =>
          item !== null &&
          typeof item === 'object' &&
          'currentShares' in item &&
          Number(item.currentShares) > 0
      );

      setPortfolio(validPortfolio);
      setLastUpdated(new Date());
      
    } catch (error) {
      console.error('Error loading portfolio:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getDenominationAsset = (address: string) => {
    return DENOMINATION_ASSETS.find(asset => asset.address === address) || DENOMINATION_ASSETS[0];
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">需要連接錢包</h2>
          <p className="text-gray-600 mb-6">請先連接您的錢包以查看您的投資組合</p>
          <div className="text-4xl mb-4">🔗</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">投資人儀表板</h1>
          <p className="text-gray-600 mt-2">
            歡迎回來，{address?.slice(0, 6)}...{address?.slice(-4)}。查看您的投資組合表現。
          </p>
          {lastUpdated && (
            <p className="text-sm text-gray-500 mt-1">
              最後更新: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {isLoading && (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        )}

        {/* Portfolio Overview */}
        {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"> */}
          {/* <div className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-600">當前投資價值</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">${portfolioSummary.totalValue}</p>
              </div>
              <div className="text-2xl">📈</div>
            </div>
          </div> */}

          {/* <div className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-600">淨投入金額</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${portfolioSummary.totalDeposited}</p>
                <p className="text-xs text-gray-500 mt-1">投入 - 贖回</p>
              </div>
              <div className="text-2xl">�</div>
            </div>
          </div> */}

          {/* <div className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-600">總收益</p>
                <p className={`text-2xl font-bold mt-1 ${
                  parseFloat(portfolioSummary.returnPercentage) >= 0 ? 'text-success-600' : 'text-danger-600'
                }`}>
                  {parseFloat(portfolioSummary.returnPercentage) >= 0 ? '+' : ''}${portfolioSummary.totalReturn}
                </p>
                <p className={`text-sm mt-1 ${
                  parseFloat(portfolioSummary.returnPercentage) >= 0 ? 'text-success-600' : 'text-danger-600'
                }`}>
                  ({portfolioSummary.returnPercentage}%)
                </p>
              </div>
              <div className="text-2xl">
                {parseFloat(portfolioSummary.returnPercentage) >= 0 ? '📊' : '�'}
              </div>
            </div>
          </div> */}

          {/* <div className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-600">持有基金</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{portfolioSummary.totalFunds}</p>
              </div>
              <div className="text-2xl">🏆</div>
            </div>
          </div> */}
        {/* </div> */}

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">快速操作</h2>
          <div className="flex gap-4">
            <Link href="/explore" className="btn-primary">
              🔍 探索新基金
            </Link>
          </div>
        </div>

        {/* Portfolio Table */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">我的投資組合</h2>
            {isLoading && (
              <div className="flex items-center text-gray-500">
                <div className="loading-spinner mr-2"></div>
                載入中...
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">基金名稱</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">持有份額</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">份額淨值</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">當前價值</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">計價資產</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((investment) => {
                  const asset = getDenominationAsset(investment.denominationAsset);
                  return (
                    <tr key={investment.fundId} className="border-b border-gray-100">
                      <td className="py-4 px-4">
                        <div>
                          <div className="font-medium text-gray-900">{investment.fundName}</div>
                          <div className="text-sm text-gray-500">{investment.fundSymbol}</div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-900">
                        {parseFloat(investment.currentShares).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}
                      </td>
                      <td className="py-4 px-4 text-gray-900">
                        ${parseFloat(investment.sharePrice).toFixed(4)}
                      </td>
                      <td className="py-4 px-4 text-gray-900">${investment.currentValue}</td>
                      <td className="py-4 px-4 text-gray-500 text-sm">{asset.symbol}</td>
                      <td className="py-4 px-4">
                        <div className="flex space-x-2">
                          <Link
                            href={`/fund/${investment.fundId}`}
                            className="btn-success text-sm"
                          >
                            申購
                          </Link>
                          <Link
                            href={`/fund/${investment.fundId}#redeem`}
                            className="btn-danger text-sm"
                          >
                            贖回
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {portfolio.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">尚無投資組合</h3>
              <p className="text-gray-600 mb-6">開始探索基金並進行您的第一筆投資</p>
              <Link href="/explore" className="btn-primary">
                探索基金
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
