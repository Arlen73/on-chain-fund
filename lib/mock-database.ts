// 模擬資料庫服務 - 使用 JSON 檔案儲存基金資料
import fs from 'fs';
import path from 'path';

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

// 投資記錄介面
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

// 用戶投資總結介面
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

interface Database {
  funds: FundData[];
  investments: InvestmentRecord[];
  lastFundId: number;
  lastInvestmentId: number;
}

class MockDatabase {
  private dbPath: string;
  private db: Database = { funds: [], investments: [], lastFundId: 0, lastInvestmentId: 0 };

  constructor() {
    this.dbPath = path.join(process.cwd(), 'data', 'funds.json');
    this.ensureDataDirectory();
    this.loadDatabase();
  }

  private ensureDataDirectory() {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadDatabase() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = fs.readFileSync(this.dbPath, 'utf8');
        this.db = JSON.parse(data);
        
        // 確保新版本的資料結構
        if (!this.db.investments) {
          this.db.investments = [];
        }
        if ((this.db as any).lastId !== undefined && this.db.lastFundId === undefined) {
          this.db.lastFundId = (this.db as any).lastId;
          delete (this.db as any).lastId;
        }
        if (!this.db.lastInvestmentId) {
          this.db.lastInvestmentId = 0;
        }
      } else {
        this.db = { 
          funds: [], 
          investments: [],
          lastFundId: 0,
          lastInvestmentId: 0
        };
        this.saveDatabase();
      }
    } catch (error) {
      console.error('Error loading database:', error);
      this.db = { 
        funds: [], 
        investments: [],
        lastFundId: 0,
        lastInvestmentId: 0
      };
    }
  }

  private saveDatabase() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }

  // 創建新基金記錄
  createFund(fundData: Omit<FundData, 'id' | 'createdAt' | 'updatedAt' | 'status'>): FundData {
    const now = new Date().toISOString();
    const newId = (this.db.lastFundId + 1).toString();
    
    const fund: FundData = {
      ...fundData,
      id: newId,
      createdAt: now,
      updatedAt: now,
      status: 'active'
    };

    this.db.funds.push(fund);
    this.db.lastFundId += 1;
    this.saveDatabase();

    return fund;
  }

  // 獲取所有基金
  getAllFunds(): FundData[] {
    return [...this.db.funds];
  }

  // 根據 ID 獲取基金
  getFundById(id: string): FundData | null {
    return this.db.funds.find(fund => fund.id === id) || null;
  }

  // 根據 Vault Proxy 地址獲取基金
  getFundByVaultAddress(vaultProxy: string): FundData | null {
    return this.db.funds.find(fund => fund.vaultProxy.toLowerCase() === vaultProxy.toLowerCase()) || null;
  }

  // 根據創建者獲取基金
  getFundsByCreator(creator: string): FundData[] {
    return this.db.funds.filter(fund => fund.creator.toLowerCase() === creator.toLowerCase());
  }

  // 搜尋基金
  searchFunds(query: string): FundData[] {
    const lowercaseQuery = query.toLowerCase();
    return this.db.funds.filter(fund =>
      fund.fundName.toLowerCase().includes(lowercaseQuery) ||
      fund.fundSymbol.toLowerCase().includes(lowercaseQuery)
    );
  }

  // ========== 投資記錄相關方法 ==========

  // 記錄投資操作
  recordInvestment(data: {
    fundId: string;
    investorAddress: string;
    type: 'deposit' | 'redeem';
    amount: string;
    shares: string;
    sharePrice: string;
    txHash: string;
  }): InvestmentRecord {
    const now = new Date().toISOString();
    const newId = (this.db.lastInvestmentId + 1).toString();
    
    // 獲取基金資訊
    const fund = this.db.funds.find(f => f.id === data.fundId);
    if (!fund) {
      throw new Error('找不到指定的基金');
    }

    const investment: InvestmentRecord = {
      id: newId,
      fundId: data.fundId,
      fundName: fund.fundName,
      fundSymbol: fund.fundSymbol,
      investorAddress: data.investorAddress,
      type: data.type,
      amount: data.amount,
      shares: data.shares,
      sharePrice: data.sharePrice,
      txHash: data.txHash,
      timestamp: now,
      status: 'completed'
    };

    this.db.investments.push(investment);
    this.db.lastInvestmentId += 1;
    this.saveDatabase();

    return investment;
  }

  // 獲取特定基金的所有投資記錄
  getFundInvestmentHistory(fundId: string): InvestmentRecord[] {
    return this.db.investments
      .filter(investment => investment.fundId === fundId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // 獲取用戶在特定基金的投資記錄
  getUserFundInvestmentHistory(fundId: string, userAddress: string): InvestmentRecord[] {
    return this.db.investments
      .filter(investment => 
        investment.fundId === fundId && 
        investment.investorAddress.toLowerCase() === userAddress.toLowerCase()
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // 獲取用戶投資總結
  getUserInvestmentSummary(fundId: string, userAddress: string): UserInvestmentSummary | null {
    const userInvestments = this.getUserFundInvestmentHistory(fundId, userAddress);
    
    if (userInvestments.length === 0) {
      return null;
    }

    const fund = this.db.funds.find(f => f.id === fundId);
    if (!fund) {
      return null;
    }

    let totalDeposited = 0;
    let totalRedeemed = 0;
    let currentShares = 0;

    userInvestments.forEach(investment => {
      const amount = parseFloat(investment.amount);
      const shares = parseFloat(investment.shares);
      
      if (investment.type === 'deposit') {
        totalDeposited += amount;
        currentShares += shares;
      } else {
        totalRedeemed += amount;
        currentShares -= shares;
      }
    });

    const currentSharePrice = parseFloat(fund.sharePrice || '1');
    const currentValue = currentShares * currentSharePrice;
    const totalReturn = currentValue + totalRedeemed - totalDeposited;
    const returnPercentage = totalDeposited > 0 ? (totalReturn / totalDeposited) * 100 : 0;

    const timestamps = userInvestments.map(inv => new Date(inv.timestamp).getTime());
    const firstInvestmentDate = new Date(Math.min(...timestamps)).toISOString();
    const lastTransactionDate = new Date(Math.max(...timestamps)).toISOString();

    return {
      fundId,
      fundName: fund.fundName,
      fundSymbol: fund.fundSymbol,
      totalDeposited: totalDeposited.toFixed(2),
      totalRedeemed: totalRedeemed.toFixed(2),
      currentShares: Math.max(0, currentShares).toFixed(6),
      currentValue: Math.max(0, currentValue).toFixed(2),
      totalReturn: totalReturn.toFixed(2),
      returnPercentage: returnPercentage.toFixed(2),
      firstInvestmentDate,
      lastTransactionDate
    };
  }
}

// 單例實例
let databaseInstance: MockDatabase | null = null;

export function getDatabase(): MockDatabase {
  if (!databaseInstance) {
    databaseInstance = new MockDatabase();
  }
  return databaseInstance;
}