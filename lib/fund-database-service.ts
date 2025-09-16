// 客戶端 API 服務，用於與後端基金資料庫 API 交互

interface FundData {
  id: string;
  fundName: string;
  fundSymbol: string;
  vaultProxy: string;
  comptrollerProxy: string;
  denominationAsset: string;
  creator: string;
  txHash: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'paused' | 'closed';
  totalAssets?: string;
  sharePrice?: string;
  totalShares?: string;
  totalInvestors?: number;
}

interface CreateFundData {
  fundName: string;
  fundSymbol: string;
  vaultProxy: string;
  comptrollerProxy: string;
  denominationAsset: string;
  creator: string;
  txHash: string;
}

// 新增：投資記錄介面
interface InvestmentRecord {
  id: string;
  fundId: string;
  fundName: string;
  fundSymbol: string;
  investorAddress: string;
  type: 'deposit' | 'redeem';
  amount: string; // 投資/贖回的計價資產數量
  shares: string; // 獲得/贖回的份額數量
  sharePrice: string; // 當時的份額價格
  txHash: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
}

// 新增：用戶投資總結介面
interface UserInvestmentSummary {
  fundId: string;
  fundName: string;
  fundSymbol: string;
  totalDeposited: string; // 總投入金額
  totalRedeemed: string; // 總贖回金額
  currentShares: string; // 當前持有份額
  currentValue: string; // 當前投資價值
  totalReturn: string; // 總收益
  returnPercentage: string; // 收益率
  firstInvestmentDate: string;
  lastTransactionDate: string;
}

// 新增：Swap 記錄介面
interface SwapRecord {
  id: string;
  fundId: string;
  vaultProxy: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  txHash: string;
  initiator: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
}

class FundDatabaseService {
  private baseUrl = '/api/funds';

  // 創建新基金記錄
  async createFund(fundData: CreateFundData): Promise<FundData> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fundData),
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '創建基金記錄失敗');
    }

    return result.data;
  }

  // 獲取所有基金
  async getAllFunds(): Promise<FundData[]> {
    const response = await fetch(this.baseUrl);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '獲取基金列表失敗');
    }

    return result.data;
  }

  // 根據創建者獲取基金
  async getFundsByCreator(creator: string): Promise<FundData[]> {
    const url = `${this.baseUrl}?creator=${encodeURIComponent(creator)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '獲取基金列表失敗');
    }

    return result.data;
  }

  // 根據 Vault 地址獲取基金
  async getFundByVaultAddress(vaultAddress: string): Promise<FundData | null> {
    const url = `${this.baseUrl}?vault=${encodeURIComponent(vaultAddress)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '獲取基金詳情失敗');
    }

    return result.data;
  }

  // 搜尋基金
  async searchFunds(query: string): Promise<FundData[]> {
    const url = `${this.baseUrl}?search=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '搜尋基金失敗');
    }

    return result.data;
  }

  // ========== 投資記錄相關方法 ==========

  // 記錄投資操作
  async recordInvestment(data: {
    fundId: string;
    investorAddress: string;
    type: 'deposit' | 'redeem';
    amount: string;
    shares: string;
    sharePrice: string;
    txHash: string;
  }): Promise<InvestmentRecord> {
    const response = await fetch(`${this.baseUrl}/investments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '記錄投資操作失敗');
    }

    return result.data;
  }

  // 獲取特定基金的所有投資記錄
  async getFundInvestmentHistory(fundId: string): Promise<InvestmentRecord[]> {
    const url = `${this.baseUrl}/investments?fundId=${encodeURIComponent(fundId)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '獲取基金投資記錄失敗');
    }

    return result.data;
  }

  // 獲取用戶在特定基金的投資記錄
  async getUserFundInvestmentHistory(fundId: string, userAddress: string): Promise<InvestmentRecord[]> {
    const url = `${this.baseUrl}/investments?fundId=${encodeURIComponent(fundId)}&investor=${encodeURIComponent(userAddress)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '獲取用戶投資記錄失敗');
    }

    return result.data;
  }

  // 獲取用戶投資總結
  async getUserInvestmentSummary(fundId: string, userAddress: string): Promise<UserInvestmentSummary | null> {
    const url = `${this.baseUrl}/investments/summary?fundId=${encodeURIComponent(fundId)}&investor=${encodeURIComponent(userAddress)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '獲取投資總結失敗');
    }

    return result.data;
  }

  // ========== Swap 記錄相關方法 ========== 

  // 記錄 swap 操作
  async recordSwap(data: {
    fundId: string;
    vaultProxy: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    toAmount: string;
    txHash: string;
    initiator: string;
    status?: 'pending' | 'completed' | 'failed';
  }): Promise<SwapRecord> {
    const response = await fetch(`${this.baseUrl}/swaps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '記錄 swap 操作失敗');
    }
    return result.data;
  }

  // 取得特定基金的所有 swap 記錄
  async getFundSwapHistory(fundId: string): Promise<SwapRecord[]> {
    const url = `${this.baseUrl}/swaps?fundId=${encodeURIComponent(fundId)}`;
    const response = await fetch(url);
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '獲取 swap 記錄失敗');
    }
    return result.data;
  }

  // 取得用戶的所有 swap 記錄
  async getUserSwapHistory(initiator: string): Promise<SwapRecord[]> {
    const url = `${this.baseUrl}/swaps?initiator=${encodeURIComponent(initiator)}`;
    const response = await fetch(url);
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '獲取 swap 記錄失敗');
    }
    return result.data;
  }

  // ========== 基金統計數據方法 ==========

  // 獲取基金統計數據
  async getFundStatistics(fundId: string): Promise<{
    totalAssets: string;
    totalInvestors: number;
    totalDeposits: string;
    totalRedemptions: string;
    netAssets: string;
    totalShares: string;
    currentSharePrice: string;
  }> {
    try {
      const investments = await this.getFundInvestmentHistory(fundId);
      
      // 計算總投入、總贖回
      let totalDeposits = 0;
      let totalRedemptions = 0;
      let totalSharesDeposited = 0;
      let totalSharesRedeemed = 0;
      const uniqueInvestors = new Set<string>();

      investments.forEach(inv => {
        const amount = parseFloat(inv.amount);
        const shares = parseFloat(inv.shares);
        
        uniqueInvestors.add(inv.investorAddress.toLowerCase());
        
        if (inv.type === 'deposit') {
          totalDeposits += amount;
          totalSharesDeposited += shares;
        } else if (inv.type === 'redeem') {
          totalRedemptions += amount;
          totalSharesRedeemed += shares;
        }
      });

      const netAssets = totalDeposits - totalRedemptions;
      const totalShares = totalSharesDeposited - totalSharesRedeemed;
      const currentSharePrice = totalShares > 0 ? (netAssets / totalShares) : 1.0;

      return {
        totalAssets: netAssets.toFixed(2),
        totalInvestors: uniqueInvestors.size,
        totalDeposits: totalDeposits.toFixed(2),
        totalRedemptions: totalRedemptions.toFixed(2),
        netAssets: netAssets.toFixed(2),
        totalShares: totalShares.toFixed(6),
        currentSharePrice: currentSharePrice.toFixed(4)
      };
    } catch (error) {
      console.error('Error calculating fund statistics:', error);
      return {
        totalAssets: '0.00',
        totalInvestors: 0,
        totalDeposits: '0.00',
        totalRedemptions: '0.00',
        netAssets: '0.00',
        totalShares: '0.000000',
        currentSharePrice: '1.0000'
      };
    }
  }

  // 獲取基金績效數據 (模擬數據，實際應該從鏈上或歷史數據計算)
  async getFundPerformance(fundId: string): Promise<{
    performance24h: string;
    performance7d: string;
    performance30d: string;
    performanceColor24h: string;
    performanceColor7d: string;
    performanceColor30d: string;
  }> {
    try {
      // 實際應該從歷史價格數據計算，這裡先用模擬數據
      const performances = [
        { perf24h: '+2.34%', perf7d: '+8.67%', perf30d: '+15.43%' },
        { perf24h: '-0.88%', perf7d: '+5.44%', perf30d: '+12.33%' },
        { perf24h: '+0.02%', perf7d: '+0.15%', perf30d: '+0.85%' },
        { perf24h: '+1.45%', perf7d: '+12.33%', perf30d: '+22.11%' }
      ];
      
      // 根據基金ID選擇績效數據
      const index = parseInt(fundId) % performances.length;
      const perf = performances[index];
      
      return {
        performance24h: perf.perf24h,
        performance7d: perf.perf7d,
        performance30d: perf.perf30d,
        performanceColor24h: perf.perf24h.startsWith('+') ? 'text-success-600' : 'text-danger-600',
        performanceColor7d: perf.perf7d.startsWith('+') ? 'text-success-600' : 'text-danger-600',
        performanceColor30d: perf.perf30d.startsWith('+') ? 'text-success-600' : 'text-danger-600'
      };
    } catch (error) {
      console.error('Error getting fund performance:', error);
      return {
        performance24h: '+0.00%',
        performance7d: '+0.00%',
        performance30d: '+0.00%',
        performanceColor24h: 'text-gray-600',
        performanceColor7d: 'text-gray-600',
        performanceColor30d: 'text-gray-600'
      };
    }
  }
}

// 導出單例實例
export const fundDatabaseService = new FundDatabaseService();
export type { FundData, CreateFundData, InvestmentRecord, UserInvestmentSummary, SwapRecord };
