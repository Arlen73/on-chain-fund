export interface Fund {
  id: string;
  name: string;
  symbol: string;
  vaultProxy: string;
  comptrollerProxy: string;
  manager: string;
  denominationAsset: string;
  totalAssets: string;
  sharePrice: string;
  totalShares: string;
  investors: number;
  performance: string;
  isActive: boolean;
  createdAt: Date;
}

export interface Investment {
  fundId: string;
  fundName: string;
  fundSymbol: string;
  shares: string;
  currentValue: string;
  initialInvestment: string;
  performance: string;
  sharePrice: string;
}

export interface DenominationAsset {
  symbol: string;
  name: string;
  address: string;
  icon: string;
  decimals: number;
}

export interface CreateFundParams {
  fundName: string;
  fundSymbol: string;
  denominationAsset: string;
  managementFee?: number;
  performanceFee?: number;
  enableWhitelist?: boolean;
  whitelist?: string[];
}

export interface FundMetrics {
  totalAUM: string;
  activeFunds: number;
  totalInvestors: number;
  pendingActions: number;
}
