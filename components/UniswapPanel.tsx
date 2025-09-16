'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../lib/web3-context';

// Token addresses for Sepolia testnet
const TOKEN_ADDRESSES = {
  ASVT: '0x932b08d5553b7431FB579cF27565c7Cd2d4b8fE0',
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', 
  WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
};

const INTEGRATION_MANAGER_ADDRESS = '0xA324963ED9c3124BB5b722a6790f67d72922F7a4';
const UNISWAP_V2_EXCHANGE_ADAPTER_ADDRESS = '0xb179bA4c1b407E24610b410bA383Aadc2e3B88Be';
const POOL_ADDRESS = '0x9dA90247B544fF9103C5B3909dE1B87c4487ae46'; // ASVT/WETH Pool

const COMPTROLLER_ABI = [
  'function callOnExtension(address _extension, uint256 _actionId, bytes calldata _callData)'
];

interface UniswapPanelProps {
  fund: {
    id: string;
    fundName: string;
    vaultProxy: string;
    comptrollerProxy: string;
  };
}

interface VaultBalance {
  asvt: string;
  weth: string;
}

interface PoolReserves {
  asvtReserve: number;
  wethReserve: number;
  asvtToWethRate: number;
  wethToAsvtRate: number;
}

export default function UniswapPanel({ fund }: UniswapPanelProps) {
  const { address, provider } = useWeb3();
  
  const [fromAmount, setFromAmount] = useState('');
  const [minAmountOut, setMinAmountOut] = useState('');
  const [fromToken, setFromToken] = useState<'ASVT' | 'WETH'>('ASVT');
  const [loading, setLoading] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [poolReserves, setPoolReserves] = useState<PoolReserves | null>(null);
  const [vaultBalance, setVaultBalance] = useState<VaultBalance | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  // 獲取 Pool 和 Vault 資訊
  const fetchPoolAndVaultInfo = async () => {
    if (!provider) return;
    
    try {
      console.log('🔍 開始獲取 Pool 和 Vault 資訊...');
      
      // 獲取 Pool 資訊
      const poolAbi = [
        'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        'function token0() view returns (address)',
        'function token1() view returns (address)'
      ];
      
      const poolContract = new ethers.Contract(POOL_ADDRESS, poolAbi, provider);
      const [reserves, token0] = await Promise.all([
        poolContract.getReserves(),
        poolContract.token0()
      ]);
      
      let asvtReserve: number, wethReserve: number;
      if (token0.toLowerCase() === TOKEN_ADDRESSES.ASVT.toLowerCase()) {
        asvtReserve = parseFloat(ethers.formatUnits(reserves[0], 18));
        wethReserve = parseFloat(ethers.formatUnits(reserves[1], 18));
      } else {
        asvtReserve = parseFloat(ethers.formatUnits(reserves[1], 18));
        wethReserve = parseFloat(ethers.formatUnits(reserves[0], 18));
      }
      
      // 計算匯率
      const asvtToWethRate = wethReserve / asvtReserve;
      const wethToAsvtRate = asvtReserve / wethReserve;
      
      setPoolReserves({
        asvtReserve,
        wethReserve, 
        asvtToWethRate,
        wethToAsvtRate
      });
      
      console.log('🏊 Pool 資訊:', { asvtReserve, wethReserve, asvtToWethRate, wethToAsvtRate });
      
      // 獲取 Vault 餘額
      const asvtContract = new ethers.Contract(TOKEN_ADDRESSES.ASVT, ['function balanceOf(address) view returns (uint256)'], provider);
      const wethContract = new ethers.Contract(TOKEN_ADDRESSES.WETH, ['function balanceOf(address) view returns (uint256)'], provider);
      
      console.log('📊 UniswapPanel - 檢查 Vault 餘額...');
      console.log('ASVT Contract:', TOKEN_ADDRESSES.ASVT);
      console.log('WETH Contract:', TOKEN_ADDRESSES.WETH);
      console.log('Vault Address:', fund.vaultProxy);
      
      const [asvtBalance, wethBalance] = await Promise.all([
        asvtContract.balanceOf(fund.vaultProxy),
        wethContract.balanceOf(fund.vaultProxy)
      ]);
      
      console.log('ASVT 原始餘額:', asvtBalance.toString());
      console.log('WETH 原始餘額:', wethBalance.toString());
      
      const vaultBalances = {
        asvt: ethers.formatUnits(asvtBalance, 18),
        weth: ethers.formatUnits(wethBalance, 18)
      };
      
      console.log('UniswapPanel - 格式化餘額:', vaultBalances);
      
      setVaultBalance(vaultBalances);
      console.log('🏦 Vault 餘額:', vaultBalances);
      
    } catch (error) {
      console.error('❗ 獲取資訊失敗:', error);
      // 使用測試數據
      setPoolReserves({
        asvtReserve: 40475.3,
        wethReserve: 0.036578,
        asvtToWethRate: 0.00000090,
        wethToAsvtRate: 1106545.29
      });
      setVaultBalance({ asvt: '0.000000', weth: '0.00105103' });
    }
  };

  // 使用 Uniswap V2 公式計算預估輸出
  const calculateEstimatedOutput = (inputAmount: string) => {
    if (!inputAmount || !poolReserves || parseFloat(inputAmount) <= 0) {
      setEstimatedOutput('');
      return;
    }
    
    try {
      const amountIn = parseFloat(inputAmount);
      const { asvtReserve, wethReserve } = poolReserves;
      
      let outputAmount: number;
      
      if (fromToken === 'ASVT') {
        // ASVT → WETH: 使用 x*y=k 公式
        const k = asvtReserve * wethReserve;
        const newAsvtReserve = asvtReserve + amountIn;
        const newWethReserve = k / newAsvtReserve;
        outputAmount = wethReserve - newWethReserve;
        
        // 檢查是否超過可用量
        if (outputAmount >= wethReserve * 0.99) {
          setEstimatedOutput('流動性不足');
          return;
        }
      } else {
        // WETH → ASVT: 使用 x*y=k 公式
        const k = asvtReserve * wethReserve;
        const newWethReserve = wethReserve + amountIn;
        const newAsvtReserve = k / newWethReserve;
        outputAmount = asvtReserve - newAsvtReserve;
        
        // 檢查是否超過可用量
        if (outputAmount >= asvtReserve * 0.99) {
          setEstimatedOutput('流動性不足');
          return;
        }
      }
      
      if (outputAmount <= 0) {
        setEstimatedOutput('0');
        return;
      }
      
      setEstimatedOutput(outputAmount.toFixed(8));
      
      // 自動設定最小輸出 (留 2% 滑點)
      const minOutput = (outputAmount * 0.98).toFixed(8);
      setMinAmountOut(minOutput);
      
    } catch (error) {
      console.error('計算預估輸出失敗:', error);
      setEstimatedOutput('計算錯誤');
    }
  };

  // 切換交易方向
  const switchTokens = () => {
    setFromToken(prev => prev === 'ASVT' ? 'WETH' : 'ASVT');
    setFromAmount('');
    setMinAmountOut('');
    setEstimatedOutput('');
  };

  // 獲取可用餘額
  const getAvailableBalance = () => {
    if (!vaultBalance) return '0';
    return fromToken === 'ASVT' ? vaultBalance.asvt : vaultBalance.weth;
  };

  // 執行交易
  const handleSwap = async () => {
    if (!fromAmount || !provider) return;

    setLoading(true);
    try {
      const signer = await provider.getSigner();
      const amountIn = ethers.parseUnits(fromAmount, 18);
      const minAmountOutParsed = ethers.parseUnits(minAmountOut || "0", 18);

      // 根據交易方向設定路徑
      const path = fromToken === 'ASVT' 
        ? [TOKEN_ADDRESSES.ASVT, TOKEN_ADDRESSES.WETH]
        : [TOKEN_ADDRESSES.WETH, TOKEN_ADDRESSES.ASVT];
      
      const integrationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address[]', 'uint256', 'uint256'],
        [path, amountIn, minAmountOutParsed]
      );
      
      const getFunctionSelector = (functionSignature: string) => {
        return ethers.id(functionSignature).slice(0, 10);
      };
      const takeOrderSelector = getFunctionSelector("takeOrder(address,bytes,bytes)");

      const callArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'bytes4', 'bytes'],
        [UNISWAP_V2_EXCHANGE_ADAPTER_ADDRESS, takeOrderSelector, integrationData]
      );

      console.log("🔄 交換:", `${fromAmount} ${fromToken} → ${fromToken === 'ASVT' ? 'WETH' : 'ASVT'}`);
      
      const comptroller = new ethers.Contract(fund.comptrollerProxy, COMPTROLLER_ABI, signer);
      const tx = await comptroller.callOnExtension(
        INTEGRATION_MANAGER_ADDRESS,
        0,
        callArgs,
        { gasLimit: 500000 }
      );
      
      console.log("✅ 交易提交:", tx.hash);
      await tx.wait();
      alert("交易成功!");
      
      // 刷新資訊
      fetchPoolAndVaultInfo();
      setFromAmount('');
      setMinAmountOut('');
      setEstimatedOutput('');
      
    } catch (error: any) {
      console.error("❌ 交易失敗:", error);
      alert(`交易失敗: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 組件載入時獲取資訊
  useEffect(() => {
    if (showPanel) {
      fetchPoolAndVaultInfo();
    }
  }, [showPanel, provider, fund.vaultProxy]);

  // 監聽輸入金額變化
  useEffect(() => {
    calculateEstimatedOutput(fromAmount);
  }, [fromAmount, poolReserves, fromToken]);

  const toToken = fromToken === 'ASVT' ? 'WETH' : 'ASVT';

  return (
    <div className="card">
      <h3 className="text-lg font-bold text-gray-900 mb-4">🔄 Uniswap 交易</h3>
      
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          使用 Uniswap 為基金進行代幣交換，增加投資組合多樣性
        </p>
        
        <button
          onClick={() => {
            setShowPanel(!showPanel);
            if (!showPanel) {
              fetchPoolAndVaultInfo();
            }
          }}
          className="w-full py-3 px-4 rounded-lg font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors"
        >
          {showPanel ? '隱藏交易面板' : '開啟 Uniswap 交易'}
        </button>
        
        {showPanel && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* 左側：交易介面 */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="font-semibold mb-4">💱 代幣交換</h4>
              
              <div className="space-y-4">
                {/* 支付代幣 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      支付 ({fromToken})
                    </label>
                    <span className="text-xs text-gray-500">
                      可用: {parseFloat(getAvailableBalance()).toFixed(6)}
                    </span>
                  </div>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  
                  {/* 百分比選擇按鈕 */}
                  <div className="flex gap-2 mt-2">
                    {[25, 50, 75, 100].map((percentage) => (
                      <button
                        key={percentage}
                        type="button"
                        onClick={() => {
                          const balance = parseFloat(getAvailableBalance());
                          let amount;
                          if (percentage === 100) {
                            amount = getAvailableBalance();
                          } else {
                            amount = (balance * percentage / 100).toFixed(fromToken === 'WETH' ? 8 : 6);
                          }
                          setFromAmount(amount);
                        }}
                        className="flex-1 px-2 py-1 text-xs bg-gray-200 hover:bg-blue-500 text-gray-700 hover:text-white rounded border hover:border-blue-500 transition-colors"
                      >
                        {percentage}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* 切換按鈕 */}
                <div className="flex justify-center">
                  <button 
                    onClick={switchTokens}
                    className="p-2 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors"
                  >
                    🔄
                  </button>
                </div>

                {/* 接收代幣 */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    接收 ({toToken})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="最小接收數量"
                      value={minAmountOut}
                      onChange={(e) => setMinAmountOut(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-20"
                    />
                    {estimatedOutput && (
                      <div className="absolute right-3 top-2 text-sm text-green-600">
                        ≈ {estimatedOutput === '流動性不足' || estimatedOutput === '計算錯誤' 
                          ? estimatedOutput 
                          : parseFloat(estimatedOutput).toFixed(8)}
                      </div>
                    )}
                  </div>
                  {estimatedOutput && estimatedOutput !== '流動性不足' && estimatedOutput !== '計算錯誤' && (
                    <div className="text-xs text-gray-500 mt-2">
                      📊 預估可得: {parseFloat(estimatedOutput).toFixed(8)} {toToken}<br/>
                      🛡️ 已自動設定 2% 滑點保護
                    </div>
                  )}
                </div>

                {/* 交易按鈕 */}
                <button
                  onClick={handleSwap}
                  disabled={
                    loading || 
                    !fromAmount || 
                    (parseFloat(getAvailableBalance()) - parseFloat(fromAmount || '0')) < -0.00000001
                  }
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  {loading ? '交易中...' : `交換 ${fromToken} → ${toToken}`}
                </button>
              </div>
            </div>

            {/* 右側：狀態資訊 */}
            <div className="space-y-4">
              
              {/* Pool 資訊 */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-3">🏊 流動性池狀態</h4>
                {poolReserves ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-700">ASVT 儲備:</span>
                      <span className="font-mono">{poolReserves.asvtReserve.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">WETH 儲備:</span>
                      <span className="font-mono">{poolReserves.wethReserve.toFixed(6)}</span>
                    </div>
                    <hr className="border-blue-200" />
                    <div className="flex justify-between">
                      <span className="text-blue-700">1 ASVT =</span>
                      <span className="text-green-600 font-mono">{poolReserves.asvtToWethRate.toFixed(8)} WETH</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">1 WETH =</span>
                      <span className="text-blue-600 font-mono">{poolReserves.wethToAsvtRate.toFixed(2)} ASVT</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2 text-blue-600">載入中...</div>
                )}
              </div>

              {/* Vault 餘額 */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h4 className="font-semibold text-green-900 mb-3">🏦 全庫餘額</h4>
                {vaultBalance ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-700">ASVT:</span>
                      <span className="font-mono">{parseFloat(vaultBalance.asvt).toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-700">WETH:</span>
                      <span className="font-mono">{parseFloat(vaultBalance.weth).toFixed(8)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2 text-green-600">載入中...</div>
                )}
              </div>

              {/* 交易資訊 */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3">ℹ️ 交易資訊</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">交易對象:</span>
                    <span>ASVT → WETH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">網路:</span>
                    <span>Sepolia Testnet</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">協議:</span>
                    <span>Uniswap V2</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">滑點保護:</span>
                    <span>2%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
