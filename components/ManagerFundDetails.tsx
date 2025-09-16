'use client';

import { useState, useEffect } from 'react';
import { useWeb3 } from '../lib/web3-context';
import { ethers } from 'ethers';
import { DENOMINATION_ASSETS } from '../lib/contracts';
import { formatTokenAmount } from '../lib/contracts';
import { Chart, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import { FundService } from '../lib/fund-service';
import { fundDatabaseService, FundData, InvestmentRecord, UserInvestmentSummary } from '../lib/fund-database-service';
import { getHistoricalSharePrices, getRealtimeSharePrice, getVaultGAV } from '@/lib/infura-service';
import { Line } from 'react-chartjs-2';
import { SEPOLIA_MAINNET_RPC } from '@/lib/constant';
import FundLineChart from './FundLineChart';
import UniswapPanel from './UniswapPanel';

interface ManagerFundDetailsProps {
  fundId: string;
}

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);
export default function ManagerFundDetails({ fundId }: ManagerFundDetailsProps) {
  const { address, isConnected, provider } = useWeb3();
  const [fund, setFund] = useState<FundData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fundNotFound, setFundNotFound] = useState(false);
  
  // Deposit/Redeem states
  const [depositAmount, setDepositAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [userBalance, setUserBalance] = useState('0');
  const [userShares, setUserShares] = useState('0');
  
  // 新增：投資記錄相關狀態
  const [investmentHistory, setInvestmentHistory] = useState<InvestmentRecord[]>([]);
  const [investmentSummary, setInvestmentSummary] = useState<UserInvestmentSummary | null>(null);
  const [fundInvestmentHistory, setFundInvestmentHistory] = useState<InvestmentRecord[]>([]);
  
  // Trading states (keep existing)
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeAsset, setTradeAsset] = useState('ETH');
  const [tradeType, setTradeType] = useState('buy'); // 'buy' or 'sell'
  const [isTrading, setIsTrading] = useState(false);

  // Portfolio states - 改為動態獲取
  const [portfolioAssets, setPortfolioAssets] = useState<{
    symbol: string;
    address: string;
    balance: string;
    percentage: number;
    decimals: number;
  }[]>([]);

  const [historicalPrices, setHistoricalPrices] = useState<{ blockNumber: number, sharePrice: number }[]>(
    [
  { blockNumber: 10001, sharePrice: 1.02 },
  { blockNumber: 10003, sharePrice: 1.04 },
  { blockNumber: 10005, sharePrice: 1.10 },
  { blockNumber: 10007, sharePrice: 1.13 },
  { blockNumber: 10009, sharePrice: 1.14 },
]
  );
  const [realtimePrice, setRealtimePrice] = useState<number | null>(null);

  const [gavHistory, setGavHistory] = useState<{ blockNumber: number, gav: number }[]>([]);
  const [realtimeGAV, setRealtimeGAV] = useState<number | null>(null);

  const [wethUsdPrice, setWethUsdPrice] = useState<number | null>(null);
  const [wethUsdHisPrice, setWethUsdHisPrice] = useState<{ date: string; price: number }[] | null>([]);

  const [chartType, setChartType] = useState<'sharePrice' | 'gavUsd' | 'wethUsd'>('sharePrice');

  // 獲取計價資產
  const denominationAsset = DENOMINATION_ASSETS.find(
    asset => asset.address === fund?.denominationAsset
  ) || DENOMINATION_ASSETS[0];

  // useEffect(() => {
  //   const loadHistory = async () => {
  //     if (fund?.comptrollerProxy) {
  //       try {
  //         const prices = await getHistoricalSharePrices(fund.comptrollerProxy, denominationAsset.decimals);
  //         setHistoricalPrices(prices);
  //       } catch (e) {
  //         console.warn('歷史價格查詢失敗', e);
  //       }
  //     }
  //   };
  //   loadHistory();
  // }, [fund]);


  // useEffect(() => {
  //   const loadRealtime = async () => {
  //     if (fund?.vaultProxy) {
  //       try {
  //         const price = await getRealtimeSharePrice(fund.vaultProxy, denominationAsset.decimals);
  //         console.log("Realtime Share Price:", price);
  //         setRealtimePrice(Number(price));
  //       } catch (e) {
  //         console.warn('即時價格查詢失敗', e);
  //       }
  //     }
  //   };
  //   loadRealtime();
  // }, []);

  /*useEffect(() => {
    const loadGavHistory = async () => {
      if (fund?.vaultProxy && historicalPrices.length > 0) {
        try {
          const provider = new ethers.JsonRpcProvider(SEPOLIA_MAINNET_RPC);
          const decimals = denominationAsset.decimals || 18;
          const gavs = await Promise.all(
            historicalPrices.map(async p => {
              // 直接用 vaultProxy 查 GAV（可加 blockTag 但 Infura 可能不支援）
              const gav = await getVaultGAV(fund.vaultProxy);
              return { blockNumber: p.blockNumber, gav: Number(ethers.formatUnits(gav, decimals)) };
            })
          );

          console.log("GAV History:", gavs);
          setGavHistory(gavs);
        } catch (e) {
          console.warn('GAV 歷史查詢失敗', e);
        }
      }
    };
    loadGavHistory();
  }, [fund, historicalPrices]);

  // 查詢即時 GAV
  // useEffect(() => {
  //   const loadRealtimeGAV = async () => {
  //     if (fund?.vaultProxy) {
  //       try {
  //         const gav = await getVaultGAV(fund.vaultProxy);
  //         setRealtimeGAV(Number(ethers.formatUnits(gav, denominationAsset.decimals || 18)));
  //       } catch (e) {
  //         console.warn('即時 GAV 查詢失敗', e);
  //       }
  //     }
  //   };
  //   loadRealtimeGAV();
  // }, [fund]);

  useEffect(() => {
    const loadWethHistoricalPrice = async () => {
      try {
        const priceFeedAddress = "0x694AA1769357215DE4FAC081bf1f309aDC325306"; // Sepolia WETH/USD
        const priceFeedAbi = [
          "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
          "function getRoundData(uint80 _roundId) view returns (uint80, int256, uint256, uint256, uint80)"
        ];
        // 用 RPC provider，不用 web3 context 的 provider
        const rpcProvider = new ethers.JsonRpcProvider(SEPOLIA_MAINNET_RPC);
        const priceFeed = new ethers.Contract(priceFeedAddress, priceFeedAbi, rpcProvider);
        const [latestRoundId] = await priceFeed.latestRoundData();

        const [, answer] = await priceFeed.latestRoundData();
        setWethUsdPrice(Number(answer) / 1e8);
        const history = [];
        for (let i = 4; i >= 0; i--) { // 只查 5 筆
          try {
            const roundId = latestRoundId - BigInt(i);
            const [, answer, , timestamp] = await priceFeed.getRoundData(roundId);
            console.log(`WETH/USD Round ${roundId}:`, { answer: Number(answer) / 1e8, timestamp: Number(timestamp) });
            history.push({
              date: new Date(Number(timestamp) * 1000).toISOString().replace('T', ' ').slice(0, 19), // "2025-09-01 14:23:00"
              price: Number(answer) / 1e8
            });
          } catch (e) {
            // 快速跳過查不到的 round
            continue;
          }
        }
        setWethUsdHisPrice(history);
      } catch (e) {
        console.warn('WETH/USD 歷史價格查詢失敗', e);
        setWethUsdHisPrice([]);
      }
    };
    loadWethHistoricalPrice();
  }, []);*/

  // 載入基金資料 - 只有在連接錢包且有地址時才載入
  useEffect(() => {
    if (isConnected && address) {
      loadFundFromDatabase();
    } else {
      // 如果沒有連接錢包，停止載入狀態
      setIsLoading(false);
    }
  }, [fundId, isConnected, address]);

  // 當基金資料載入且用戶連接錢包時，載入用戶資料
  useEffect(() => {
    if (isConnected && address && provider && fund) {
      console.log('📄 Triggering loadUserData from useEffect...');
      loadUserData();
    } else {
      console.log('🚫 loadUserData not triggered:', { isConnected, address: !!address, provider: !!provider, fund: !!fund });
    }
  }, [isConnected, address, provider, fund]);

  // 新增：在基金載入後直接載入資產組合（不依賴區塊鏈資料）
  useEffect(() => {
    if (fund && provider) {
      console.log('🔄 Directly loading portfolio assets after fund is loaded...');
      loadPortfolioAssets();
    }
  }, [fund, provider]);

  const loadFundFromDatabase = async () => {
    if (!address) {
      console.warn('Cannot load fund: No wallet address');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setFundNotFound(false);
    
    try {
      console.log('Loading fund with ID:', fundId, 'for address:', address);
      
      // 先獲取所有基金，然後看看是否有這個 ID
      const allFunds = await fundDatabaseService.getAllFunds();
      console.log('All funds in database:', allFunds.length);
      
      // 從資料庫載入基金資料
      const fundsList = await fundDatabaseService.getFundsByCreator(address);
      console.log('Funds list from database for address', address, ':', fundsList);
      const foundFund = fundsList.find(f => f.id === fundId);
      
      // 詳細的地址比較調試
      console.log('=== Address Comparison Debug ===');
      console.log('Current wallet address:', address);
      console.log('Current wallet address (lowercase):', address.toLowerCase());
      console.log('Looking for fund ID:', fundId);
      
      if (fundsList.length > 0) {
        console.log('User\'s funds:');
        fundsList.forEach(fund => {
          console.log(`- Fund ${fund.id}: ${fund.fundName}, creator: ${fund.creator}, creator(lowercase): ${fund.creator.toLowerCase()}`);
        });
      } else {
        console.log('No funds found for this user');
        // 檢查所有基金的創建者
        console.log('All funds creators:');
        allFunds.forEach(fund => {
          console.log(`- Fund ${fund.id}: creator: ${fund.creator}, matches current: ${fund.creator.toLowerCase() === address.toLowerCase()}`);
        });
      }
      
      // 如果沒有找到，檢查是否在所有基金中存在
      if (!foundFund) {
        const anyFund = allFunds.find(f => f.id === fundId);
        if (anyFund) {
          console.warn('Fund exists but not owned by current address. Fund creator:', anyFund.creator, 'Current address:', address);
          setFundNotFound(true);
          setFund(null);
          setIsLoading(false); // 明確設置載入狀態為 false
          return;
        }
      }
      
      if (!foundFund) {
        console.warn('Fund not found in database');
        setFundNotFound(true);
        setFund(null);
        setIsLoading(false); // 明確設置載入狀態為 false
        return;
      }

      setFund(foundFund);
      console.log('Loaded fund from database:', foundFund);
      console.log('Setting isLoading to false...');
      setIsLoading(false); // 在這裡先設置為 false
      
      // 如果有區塊鏈連接，嘗試載入區塊鏈資料
      if (provider && foundFund.vaultProxy && foundFund.comptrollerProxy) {
        try {
          console.log('Loading blockchain data...');
          
          // 添加超時機制
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Blockchain data loading timeout')), 10000)
          );
          
          const fundService = new FundService(provider);
          const blockchainPromise = fundService.getFundDetails(foundFund.vaultProxy, foundFund.comptrollerProxy);
          
          const realFundData = await Promise.race([blockchainPromise, timeoutPromise]);
          
          console.log('Loaded fund data from blockchain:', realFundData);
          // 更新基金資料，結合資料庫和區塊鏈資料
          setFund(prev => prev ? {
            ...prev,
            totalAssets: realFundData.totalAssets || prev.totalAssets,
            sharePrice: realFundData.sharePrice || prev.sharePrice,
            totalShares: realFundData.totalShares || prev.totalShares,
            totalInvestors: (realFundData as any).investors || prev.totalInvestors || 0
          } : null);
          
          console.log('Updated with blockchain data:', realFundData);
        } catch (error) {
          console.warn('Failed to load blockchain data:', error);
          // 即使區塊鏈資料載入失敗，也要繼續顯示基金資訊
          console.log('Continuing with database data only');
        }
      }
    } catch (error) {
      console.error('Error loading fund:', error);
      setFundNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserData = async () => {
    if (!provider || !address || !fund) {
      console.warn('loadUserData: Missing dependencies:', { provider: !!provider, address: !!address, fund: !!fund });
      return;
    }
    
    console.log('📄 開始載入用戶資料...');
    
    try {
      const fundService = new FundService(provider);
      
      // Get user's denomination asset balance
      const balance = await fundService.getTokenBalance(fund.denominationAsset, address);
      setUserBalance(balance);
      console.log('💰 User balance loaded:', balance);
      
      // Get user's fund shares
      const shares = await fundService.getUserBalance(fund.vaultProxy, address);
      setUserShares(shares);
      console.log('📊 User shares loaded:', shares);

      // 載入基金的代幣持倉
      console.log('🔄 即將載入資產組合...');
      await loadPortfolioAssets();

      // 載入投資記錄和總結
      try {
        const [userHistory, userSummary, fundHistory] = await Promise.all([
          fundDatabaseService.getUserFundInvestmentHistory(fund.id, address),
          fundDatabaseService.getUserInvestmentSummary(fund.id, address),
          fundDatabaseService.getFundInvestmentHistory(fund.id)
        ]);

        setInvestmentHistory(userHistory);
        setInvestmentSummary(userSummary);
        setFundInvestmentHistory(fundHistory);
        
        console.log('Loaded investment data:', { userHistory, userSummary, fundHistory });
      } catch (error) {
        console.warn('Failed to load investment records:', error);
      }
      
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // 載入基金資產組合
  const loadPortfolioAssets = async () => {
    if (!provider || !fund) {
      console.warn('loadPortfolioAssets: Missing provider or fund:', { provider: !!provider, fund: !!fund });
      return;
    }
    
    console.log('🔍 開始載入基金資產組合...');
    console.log('Fund info:', {
      id: fund.id,
      name: fund.fundName,
      vaultProxy: fund.vaultProxy,
      denominationAsset: fund.denominationAsset
    });
    
    try {
      const tokenAddresses = {
        ASVT: '0x932b08d5553b7431FB579cF27565c7Cd2d4b8fE0',
        WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
      };
      
      console.log('Token addresses to check:', tokenAddresses);
      
      const tokenInfos = [
        { symbol: 'ASVT', address: tokenAddresses.ASVT, decimals: 18 },
        { symbol: 'WETH', address: tokenAddresses.WETH, decimals: 18 },
        { symbol: 'USDC', address: tokenAddresses.USDC, decimals: 6 }
      ];
      
      const assets = [];
      let totalValue = 0;
      
      // 獲取每個代幣的餘額
      for (const tokenInfo of tokenInfos) {
        try {
          console.log(`📊 檢查 ${tokenInfo.symbol} 餘額...`);
          console.log(`Contract address: ${tokenInfo.address}`);
          console.log(`Vault address: ${fund.vaultProxy}`);
          
          const contract = new ethers.Contract(
            tokenInfo.address,
            ['function balanceOf(address) view returns (uint256)'],
            provider
          );
          
          console.log(`🔍 正在調用 ${tokenInfo.symbol}.balanceOf(${fund.vaultProxy})...`);
          
          const balance = await contract.balanceOf(fund.vaultProxy);
          const balanceFormatted = ethers.formatUnits(balance, tokenInfo.decimals);
          const balanceNum = parseFloat(balanceFormatted);
          
          console.log(`${tokenInfo.symbol} 原始餘額:`, balance.toString());
          console.log(`${tokenInfo.symbol} 格式化餘額:`, balanceFormatted);
          console.log(`${tokenInfo.symbol} 數值:`, balanceNum);
          
          if (balanceNum > 0) {
            // 這裡可以加入價格轉換，暫時使用簡單的假設
            let value = balanceNum;
            if (tokenInfo.symbol === 'WETH') {
              value = balanceNum * (wethUsdPrice || 1840); // 使用 WETH 價格
            } else if (tokenInfo.symbol === 'ASVT') {
              value = balanceNum * 0.001; // 假設 ASVT 價格
            }
            
            totalValue += value;
            
            console.log(`✅ ${tokenInfo.symbol} 有餘額! 數量: ${balanceNum}, 價值: ${value}`);
            
            assets.push({
              symbol: tokenInfo.symbol,
              address: tokenInfo.address,
              balance: balanceFormatted,
              percentage: 0, // 稍後計算
              decimals: tokenInfo.decimals,
              value: value
            });
          } else {
            console.log(`❌ ${tokenInfo.symbol} 餘額為 0`);
          }
        } catch (error) {
          console.error(`❗ Failed to get balance for ${tokenInfo.symbol}:`, error);
          console.error('Error details:', {
            message: error.message,
            code: error.code,
            data: error.data
          });
        }
      }
      
      console.log('📈 總資產數組:', assets);
      console.log('💰 總價值:', totalValue);
      
      // 計算百分比
      const assetsWithPercentage = assets.map(asset => ({
        ...asset,
        percentage: totalValue > 0 ? (asset.value / totalValue) * 100 : 0
      }));
      
      setPortfolioAssets(assetsWithPercentage);
      console.log('✅ Portfolio assets loaded successfully:', assetsWithPercentage);
      
    } catch (error) {
      console.error('❌ Error loading portfolio assets:', error);
      console.error('Error stack:', error.stack);
    }
  };

  const handleDeposit = async () => {
    if (!provider || !address || !depositAmount || !fund) return;

    setIsDepositing(true);
    try {
      const fundService = new FundService(provider);
      
      // Check if user has enough balance
      const balance = parseFloat(userBalance);
      const amount = parseFloat(depositAmount);
      
      if (amount > balance) {
        alert('餘額不足');
        return;
      }

      // Check and approve token allowance first
      const allowance = await fundService.getTokenAllowance(
        fund.denominationAsset, 
        address, 
        fund.comptrollerProxy
      );
      
      if (parseFloat(allowance) < amount) {
        console.log('Approving token...');
        await fundService.approveToken(fund.denominationAsset, fund.comptrollerProxy, depositAmount);
        // Wait a moment for approval to be mined
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Buy shares (deposit)
      const txHash = await fundService.buyShares(fund.comptrollerProxy, depositAmount);
      console.log('Deposit transaction:', txHash);
      
      // 記錄投資操作到資料庫
      try {
        const estimatedShares = (parseFloat(depositAmount) / parseFloat(fund.sharePrice || '1')).toString();
        await fundDatabaseService.recordInvestment({
          fundId: fund.id,
          investorAddress: address,
          type: 'deposit',
          amount: depositAmount,
          shares: estimatedShares,
          sharePrice: fund.sharePrice || '1.00',
          txHash: txHash
        });
        console.log('Investment recorded in database');
      } catch (error) {
        console.warn('Failed to record investment in database:', error);
      }
      
      alert(`成功投資 ${depositAmount} ${denominationAsset.symbol}！`);
      setDepositAmount('');
      
      // Refresh data
      await loadFundFromDatabase();
      await loadUserData();
      
    } catch (error: any) {
      console.error('Deposit failed:', error);
      alert(`投資失敗：${error.message}`);
    } finally {
      setIsDepositing(false);
    }
  };

  // async function settlePerformanceFee(comptrollerProxyAddress: string, signer: any) {
  //   const performanceFeeAbi = [
  //     "function settle(address _comptrollerProxy) external"
  //   ];
  //   const performanceFee = new ethers.Contract("0x82EDeB07c051D6461acD30c39b5762D9523CEf1C", performanceFeeAbi, signer);
  //   try {
  //     const tx = await performanceFee.settle(comptrollerProxyAddress);
  //     await tx.wait();
  //     console.log(`Performance fee settled for ${comptrollerProxyAddress}, tx: ${tx.hash}`);
  //     return tx.hash;
  //   } catch (error: any) {
  //     console.error("Settle performance fee failed:", error);
  //     throw error;
  //   }
  // }

  const handleRedeem = async () => {
    if (!provider || !address || !redeemAmount || !fund) return;

    setIsRedeeming(true);
    try {
      const fundService = new FundService(provider);
      
      // Check if user has enough shares
      const shares = parseFloat(userShares);
      const amount = parseFloat(redeemAmount);
      
      if (amount > shares) {
        alert('持有份額不足');
        return;
      }

      // Redeem shares
      const txHash = await fundService.redeemShares(fund.comptrollerProxy, redeemAmount);
      console.log('Redeem transaction:', txHash);
      
      // 記錄贖回操作到資料庫
      try {
        const estimatedAmount = (parseFloat(redeemAmount) * parseFloat(fund.sharePrice || '1')).toString();
        await fundDatabaseService.recordInvestment({
          fundId: fund.id,
          investorAddress: address,
          type: 'redeem',
          amount: estimatedAmount,
          shares: redeemAmount,
          sharePrice: fund.sharePrice || '1.00',
          txHash: txHash
        });
        console.log('Redemption recorded in database');
      } catch (error) {
        console.warn('Failed to record redemption in database:', error);
      }
      
      alert(`成功贖回 ${redeemAmount} 份額！`);
      setRedeemAmount('');
      
      // Refresh data
      await loadFundFromDatabase();
      await loadUserData();
      
    } catch (error: any) {
      console.error('Redeem failed:', error);
      alert(`贖回失敗：${error.message}`);
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleTrade = async () => {
    if (!isConnected || !window.ethereum || !tradeAmount) return;

    setIsTrading(true);
    try {
      // In a real application, this would execute trades through the fund
      console.log(`${tradeType} ${tradeAmount} ${tradeAsset}`);
      alert(`${tradeType === 'buy' ? '購買' : '出售'} ${tradeAmount} ${tradeAsset} 成功！`);
      setTradeAmount('');
      await loadFundFromDatabase(); // Refresh fund data
    } catch (error: any) {
      console.error('Trade failed:', error);
      alert(`交易失敗：${error.message}`);
    } finally {
      setIsTrading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">需要連接錢包</h2>
          <p className="text-gray-600 mb-6">請先連接您的錢包以管理基金</p>
          <div className="text-4xl mb-4">🔗</div>
          <a href="/manager" className="btn-primary">
            返回管理儀表板
          </a>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">載入中...</h2>
          <p className="text-gray-600">正在載入基金詳情</p>
        </div>
      </div>
    );
  }

  if (fundNotFound || !fund) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md w-full text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">無法訪問基金</h2>
          <p className="text-gray-600 mb-6">
            找不到指定的基金，或您沒有權限管理此基金。<br/>
            請確認您是否為此基金的創建者。
          </p>
          <div className="space-y-2">
            <a href="/manager" className="btn-primary block">
              返回管理儀表板
            </a>
            <p className="text-xs text-gray-500">基金 ID: {fundId}</p>
            <p className="text-xs text-gray-500">當前地址: {address}</p>
          </div>
        </div>
      </div>
    );
  }

  // 計算已發行份額
  const totalShares = fundInvestmentHistory.reduce((sum, r) => {
    const shares = parseFloat(r.shares);
    return r.type === 'deposit'
      ? sum + shares
      : sum - shares;
  }, 0);

  // 取得最新 sharePrice（可用 fund.sharePrice 或最後一筆投資記錄的 sharePrice）
  const latestSharePrice =
    fundInvestmentHistory.length > 0
      ? parseFloat(fundInvestmentHistory[fundInvestmentHistory.length - 1].sharePrice)
      : parseFloat(fund?.sharePrice || '1');

  // 計算總資產 (AUM)
  const totalAssets = totalShares * latestSharePrice;

  const totalAssetsUSD = wethUsdPrice !== null ? totalAssets * wethUsdPrice : null;

  console.log("gavHistory:", gavHistory);
  console.log("wethUsdHisPrice:", wethUsdHisPrice);
  const aumUsdHistory = gavHistory.map((g, i) => {
    const wethUsdHisArr = wethUsdHisPrice ?? [];
    return {
      date: wethUsdHisArr[i]?.date || `#${g.blockNumber}`,
      value: wethUsdHisArr[i] ? g.gav * wethUsdHisArr[i].price : g.gav * (wethUsdPrice || 1840)
    };
  });
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Fund Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{fund.fundName}</h1>
          <p className="text-gray-600 mt-2">基金管理 - {fund.fundSymbol}</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Fund Overview and Assets */}
          <div className="lg:col-span-2 space-y-6">
            {/* Fund Overview */}
            <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-6">基金概覽</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {totalAssets > 0
                      ? `${totalAssets.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : '--'}
                  </p>
                  <p className="text-sm text-gray-600">總資產 (AUM)</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {latestSharePrice > 0
                      ? `${latestSharePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                      : '--'}
                  </p>
                  <p className="text-sm text-gray-600">份額淨值</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {totalAssets.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </p>
                  <p className="text-sm text-gray-600">已發行份額</p>
                </div>
                {/* <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {totalAssetsUSD !== null ? `${totalAssetsUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '--'}
                  </p>
                  <p className="text-sm text-gray-600">WETH/USD</p>
                </div> */}

                {/* <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{fund.totalInvestors || 0}</p>
                  <p className="text-sm text-gray-600">投資人數</p>
                </div> */}
              </div>

              {/* <div className="border-t pt-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">24小時收益</p>
                    <p className="font-medium text-success-600">+0.00%</p>
                  </div>
                  <div>
                    <p className="text-gray-600">7天收益</p>
                    <p className="font-medium text-success-600">+0.00%</p>
                  </div>
                  <div>
                    <p className="text-gray-600">30天收益</p>
                    <p className="font-medium text-success-600">+0.00%</p>
                  </div>
                </div>
              </div> */}
            </div>

            {/* Portfolio Holdings */}
            <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-6">資產組合 (Token Holdings)</h2>
              
              <div className="space-y-4">
                {portfolioAssets.length > 0 ? portfolioAssets.map((asset, index) => {
                  const balanceValue = parseFloat(asset.balance);
                  const totalValue = asset.value || 0;
                  
                  return (
                    <div key={asset.symbol} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mr-4">
                          <span className="text-primary-600 font-bold text-sm">{asset.symbol.substring(0, 2)}</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{asset.symbol}</p>
                          <p className="text-sm text-gray-600">{asset.percentage.toFixed(1)}% 配置</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-900">
                          {balanceValue.toLocaleString(undefined, { maximumFractionDigits: asset.decimals === 6 ? 2 : 6 })} {asset.symbol}
                        </p>
                        {totalValue > 0 && (
                          <p className="text-sm text-gray-600">
                            ≈ ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">💼</div>
                    <p>暫無資產持倉</p>
                    <p className="text-sm mt-1">使用 Uniswap 進行交易後資產會顯示在這裡</p>
                  </div>
                )}
                
                {/* 重新整理按鈕 */}
                {portfolioAssets.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <button
                      onClick={loadPortfolioAssets}
                      className="w-full py-2 px-4 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                    >
                      🔄 重新整理資產組合
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Asset Allocation */}
            {/* <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-6">資產配置</h2>
              
              <div className="space-y-4">
                {[
                  { symbol: 'ETH', percentage: 40, value: fund.totalAssets ? (parseFloat(formatTokenAmount(fund.totalAssets)) * 0.4).toFixed(2) : '0' },
                  { symbol: 'BTC', percentage: 30, value: fund.totalAssets ? (parseFloat(formatTokenAmount(fund.totalAssets)) * 0.3).toFixed(2) : '0' },
                  { symbol: 'ASVT', percentage: 20, value: fund.totalAssets ? (parseFloat(formatTokenAmount(fund.totalAssets)) * 0.2).toFixed(2) : '0' },
                  { symbol: 'USDC', percentage: 10, value: fund.totalAssets ? (parseFloat(formatTokenAmount(fund.totalAssets)) * 0.1).toFixed(2) : '0' }
                ].map((asset: any, index: number) => (
                  <div key={asset.symbol} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center mr-4">
                        <span className="text-primary-600 font-bold">{asset.symbol.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{asset.symbol}</p>
                        <p className="text-sm text-gray-600">{asset.percentage}% 配置</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        ${parseFloat(asset.value).toLocaleString(undefined, {maximumFractionDigits: 2})}
                      </p>
                      <p className="text-sm text-gray-600">{denominationAsset.symbol}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div> */}
            {/* <div className="flex gap-2 mb-4">
              <button
                className={`px-4 py-2 rounded ${chartType === 'sharePrice' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setChartType('sharePrice')}
              >份額價格走勢</button>
              <button
                className={`px-4 py-2 rounded ${chartType === 'gavUsd' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setChartType('gavUsd')}
              >AUM 美元化走勢</button>
              <button
                className={`px-4 py-2 rounded ${chartType === 'wethUsd' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                onClick={() => setChartType('wethUsd')}
              >WETH/USD 價格走勢</button>
            </div>

            {chartType === 'sharePrice' && (
              <FundLineChart
                title="基金歷史份額價格走勢"
                labels={[
                  ...historicalPrices.map(p => p.blockNumber),
                  realtimePrice !== null ? '即時' : null
                ].filter(Boolean)}
                data={[
                  ...historicalPrices.map(p => p.sharePrice),
                  ...(realtimePrice !== null ? [realtimePrice] : [])
                ]}
                color="rgba(54, 162, 235, 1)"
                yLabel="份額價格"
              />
            )}

            {chartType === 'gavUsd' && (
              <FundLineChart
                title="基金總資產 (AUM, USD) 走勢"
                labels={aumUsdHistory.map(a => a.date)}
                data={aumUsdHistory.map(a => a.value)}
                color="rgba(255, 99, 132, 1)"
                yLabel="AUM (USD)"
              />
            )}

            {chartType === 'wethUsd' && (
              <FundLineChart
                title="WETH/USD 價格走勢"
                labels={(wethUsdHisPrice ?? []).map(p => p.date)}
                data={(wethUsdHisPrice ?? []).map(p => p.price)}
                color="rgba(75, 192, 192, 1)"
                yLabel="WETH/USD"
              />
            )} */}

            {/* Uniswap Panel - 移動到這裡 */}
            <UniswapPanel fund={fund} />

            {/* Fund Investment History */}
            <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-6">基金投資記錄</h2>
              <div className="space-y-3">
                {fundInvestmentHistory.length > 0 ? (
                  fundInvestmentHistory.slice(0, 10).map((record, index) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">
                          {record.type === 'deposit' ? '投資人申購' : '投資人贖回'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(record.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {record.investorAddress.substring(0, 6)}...{record.investorAddress.substring(38)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-medium ${record.type === 'deposit' ? 'text-success-600' : 'text-danger-600'}`}>
                          {record.type === 'deposit' ? '+' : '-'}${parseFloat(record.amount).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {parseFloat(record.shares).toFixed(4)} 份額
                        </p>
                        <p className="text-xs text-gray-500">
                          ${parseFloat(record.sharePrice).toFixed(4)}/份額
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📊</div>
                    <p>暫無投資記錄</p>
                    <p className="text-sm mt-1">投資記錄會在有申購或贖回活動後顯示</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Deposit/Redeem Panel and Settings */}
          <div className="space-y-6">
            {/* User Balance Info */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">我的資產</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">錢包餘額</span>
                  <span className="font-medium">{parseFloat(userBalance).toFixed(6)} {denominationAsset.symbol}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">持有份額</span>
                  <span className="font-medium">{parseFloat(userShares).toFixed(6)} 份額</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">投資價值</span>
                  <span className="font-medium">${(parseFloat(userShares) * parseFloat(fund.sharePrice || '1')).toFixed(2)}</span>
                </div>
                
                {/* 顯示投資總結 */}
                {investmentSummary && (
                  <>
                    <div className="border-t pt-3 mt-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">總投入金額</span>
                        <span className="font-medium">${parseFloat(investmentSummary.totalDeposited).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">總贖回金額</span>
                        <span className="font-medium">${parseFloat(investmentSummary.totalRedeemed).toFixed(2)}</span>
                      </div>
                      {/* <div className="flex justify-between">
                        <span className="text-gray-600">總收益</span>
                        <span className={`font-medium ${parseFloat(investmentSummary.totalReturn) >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                          ${parseFloat(investmentSummary.totalReturn).toFixed(2)} ({investmentSummary.returnPercentage}%)
                        </span>
                      </div> */}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Deposit Panel */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">💰 投資基金</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    投資金額 ({denominationAsset.symbol})
                  </label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder={`可用餘額: ${parseFloat(userBalance).toFixed(4)}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    預計獲得約 {
                    (() => {
                            const amount = parseFloat(depositAmount);
                            const sharePrice = parseFloat(fund.sharePrice || '1');
                            const decimals = denominationAsset.decimals || 18;
                            if (!depositAmount || isNaN(amount) || !isFinite(amount) || sharePrice <= 0 || isNaN(sharePrice)) {
                              return '0';
                            }
                            // 先將金額轉為最小單位（如 USDC 6 decimals）
                            const amountInWei = amount * Math.pow(10, decimals);
                            const sharePriceInWei = sharePrice * Math.pow(10, decimals);
                            const shares = amountInWei / sharePriceInWei;
                            return shares.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
                          })()
                        }
                     份額
                  </p>
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={isDepositing || !depositAmount || parseFloat(depositAmount) > parseFloat(userBalance)}
                  className="w-full py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center bg-success-500 hover:bg-success-600 text-white"
                >
                  {isDepositing && <div className="loading-spinner mr-2"></div>}
                  {isDepositing ? '投資中...' : '投資基金'}
                </button>
              </div>
            </div>

            {/* Redeem Panel */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">💸 贖回基金</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    贖回份額
                  </label>
                  <input
                    type="number"
                    value={redeemAmount}
                    onChange={(e) => setRedeemAmount(e.target.value)}
                    placeholder={`持有份額: ${parseFloat(userShares).toFixed(4)}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    預計贖回約 ${redeemAmount ? (parseFloat(redeemAmount) * parseFloat(fund.sharePrice || '1')).toFixed(2) : '0'}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setRedeemAmount((parseFloat(userShares) * 0.25).toString())}
                    className="flex-1 py-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    25%
                  </button>
                  <button
                    onClick={() => setRedeemAmount((parseFloat(userShares) * 0.5).toString())}
                    className="flex-1 py-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => setRedeemAmount((parseFloat(userShares) * 0.75).toString())}
                    className="flex-1 py-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    75%
                  </button>
                  <button
                    onClick={() => setRedeemAmount(userShares)}
                    className="flex-1 py-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    全部
                  </button>
                </div>

                <button
                  onClick={handleRedeem}
                  disabled={isRedeeming || !redeemAmount || parseFloat(redeemAmount) > parseFloat(userShares)}
                  className="w-full py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center bg-danger-500 hover:bg-danger-600 text-white"
                >
                  {isRedeeming && <div className="loading-spinner mr-2"></div>}
                  {isRedeeming ? '贖回中...' : '贖回份額'}
                </button>
              </div>
            </div>

            {/* Fund Settings */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">基金設定</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">管理費</span>
                  <span className="font-medium">{fund.managementFee}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">績效費</span>
                  <span className="font-medium">{fund.performanceFee}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">計價資產</span>
                  <span className="font-medium">{denominationAsset.symbol}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">狀態</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    fund.status === 'active' ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {fund.status === 'active' ? '活躍' : '暫停'}
                  </span>
                </div>
              </div>
            </div>

            {/* <button
              className="w-full py-2 px-4 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white mt-4"
              disabled={!provider || !fund?.comptrollerProxy}
              onClick={async () => {
                if (!provider || !fund?.comptrollerProxy) return;
                try {
                  const signer = await provider.getSigner();
                  const txHash = await settlePerformanceFee(fund.comptrollerProxy, signer);
                  alert(`結算成功！TxHash: ${txHash}`);
                } catch (e: any) {
                  alert(`結算失敗：${e.message || e}`);
                }
              }}
            >
              結算績效費
            </button> */}

            {/* Fund Statistics */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">基金統計</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">創立日期</span>
                  <span className="font-medium">{new Date(fund.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">累計申購</span>
                  <span className="font-medium text-success-600">
                    ${fundInvestmentHistory
                      .filter(r => r.type === 'deposit')
                      .reduce((sum, r) => sum + parseFloat(r.amount), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">累計贖回</span>
                  <span className="font-medium text-danger-600">
                    ${fundInvestmentHistory
                      .filter(r => r.type === 'redeem')
                      .reduce((sum, r) => sum + parseFloat(r.amount), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">投資筆數</span>
                  <span className="font-medium">{fundInvestmentHistory.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">當前狀態</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    fund.status === 'active' ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {fund.status === 'active' ? '活躍' : '暫停'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
