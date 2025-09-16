"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAccount } from "../lib/web3-context";
import {
  performanceService,
  PerformanceData,
} from "../lib/performance-service";
import { fundDatabaseService, FundData } from "../lib/fund-database-service";
import PerformanceChart from "./ui/PerformanceChart";
import LoadingSpinner from "./ui/LoadingSpinner";

interface ManagedFund {
  id: string;
  name: string;
  symbol: string;
  address: string; // vaultProxy 地址
  // NOTE: totalAssets is stored/displayed as a formatted string in DB; for calculations use numericAUM
  totalAssets: string; // formatted display, e.g. "$1,234"
  sharePrice: string; // formatted NAV/share string, e.g. "$1.0000"
  performance: string; // formatted pct string
  performanceColor: string;
  investors: number;
  lastUpdated: number;

  // New: normalized numeric fields for accurate math (not persisted)
  __numeric?: {
    navPerShare?: number; // in denomination units
    totalShares?: number; // raw number of shares
    aum?: number; // navPerShare * totalShares (denomination units)
    aumUSD?: number; // optional, if your perf service provides USD conversion
    pct24h?: number; // priceChangePercentage24h
  };

  comptrollerProxy?: string;
  denominationAsset?: string;
  creator?: string;
  txHash?: string;
  status?: string;
}

export default function ManagerDashboard() {
  const { address: walletAddress, isConnected } = useAccount();
  const [funds, setFunds] = useState<ManagedFund[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState<
    Map<string, PerformanceData>
  >(new Map());
  const [selectedFund, setSelectedFund] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && walletAddress) {
      loadFundData();
      const cleanup = setupRealTimeUpdates();
      return cleanup;
    }
  }, [isConnected, walletAddress]);

  const loadFundData = async () => {
    setIsLoading(true);
    try {
      const fundDataList = await fundDatabaseService.getFundsByCreator(
        walletAddress!
      );
      const managedFunds = fundDataList.map(
        (fund: FundData): ManagedFund => ({
          id: fund.id,
          name: fund.fundName,
          symbol: fund.fundSymbol,
          address: fund.vaultProxy,
          totalAssets: fund.totalAssets || "$0",
          sharePrice: fund.sharePrice || "$1.0000",
          performance: "+0.00%",
          performanceColor: "text-success-600",
          investors: fund.totalInvestors || 0,
          lastUpdated: new Date(fund.updatedAt || fund.createdAt).getTime(),
          comptrollerProxy: fund.comptrollerProxy,
          denominationAsset: fund.denominationAsset,
          creator: fund.creator,
          txHash: fund.txHash,
          status: fund.status,
        })
      );
      setFunds(managedFunds);
    } catch (error) {
      console.error("Error loading fund data:", error);
      setFunds([]);
    } finally {
      setIsLoading(false);
    }
  };

  const setupRealTimeUpdates = () => {
    const fundAddresses = funds.map((f) => f.address);
    const cleanup = performanceService.startRealTimeUpdates((updates) => {
      setRealTimeUpdates(new Map(updates));
      setFunds((currentFunds) =>
        currentFunds.map((fund) => {
          const u = updates.get(fund.address);
          if (!u) return fund;

          // Normalize numeric values to compute AUM correctly
          const navPerShare = Number(u.sharePrice); // denomination units per share
          const totalShares = Number(u.totalShares || 0);
          const aum = isFinite(navPerShare * totalShares)
            ? navPerShare * totalShares
            : 0;
          const pct24h = Number(u.priceChangePercentage24h || 0);

          return {
            ...fund,
            sharePrice: isFinite(navPerShare)
              ? `$${navPerShare.toFixed(6)}`
              : fund.sharePrice,
            performance: `${pct24h >= 0 ? "+" : ""}${pct24h.toFixed(2)}%`,
            performanceColor:
              pct24h >= 0 ? "text-success-600" : "text-danger-600",
            totalAssets: isFinite(aum)
              ? `$${Math.round(aum).toLocaleString()}`
              : fund.totalAssets,
            lastUpdated: Date.now(),
            __numeric: {
              navPerShare,
              totalShares,
              aum,
              pct24h,
            },
          };
        })
      );
    }, fundAddresses);
    return cleanup;
  };

  // Calculate portfolio-wide metrics using normalized numeric AUM
  const metrics = useMemo(() => {
    const aums = funds.map((f) => {
      const parsed = parseFloat(
        String(f.totalAssets).replace(/[^0-9.\-]/g, "")
      );
      const safeParsed = Number.isFinite(parsed) ? parsed : 0;
      return f.__numeric?.aum ?? safeParsed;
    });
    const totalAUMNow = aums.reduce((a, b) => a + (isFinite(b) ? b : 0), 0);

    // Reconstruct yesterday's NAV per share using pct24h; assume shares roughly constant intra-day
    // prevNAV = nav / (1 + pct)
    let prevTotal = 0;
    funds.forEach((f) => {
      const nav = f.__numeric?.navPerShare;
      const shares = f.__numeric?.totalShares;
      const pct = f.__numeric?.pct24h;
      if (nav && shares && isFinite(nav) && isFinite(shares)) {
        const prevNav = pct !== undefined ? nav / (1 + pct / 100) : nav;
        prevTotal += prevNav * shares;
      } else {
        // fallback to formatted totalAssets if available
        const a =
          parseFloat(String(f.totalAssets).replace(/[^0-9.\-]/g, "")) || 0;
        prevTotal += a;
      }
    });

    const pctChange =
      prevTotal > 0 ? ((totalAUMNow - prevTotal) / prevTotal) * 100 : 0;

    return {
      totalAUM: `$${Math.round(totalAUMNow).toLocaleString()}`,
      pct24h: isFinite(pctChange) ? pctChange : 0,
      activeFunds: funds.length,
      totalInvestors: funds.reduce((s, f) => s + (f.investors || 0), 0),
      pendingActions: 0,
    };
  }, [funds]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 頁面標題 */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">基金經理儀表板</h1>
            <p className="text-gray-600 mt-2">總覽您所有基金的表現與狀態。</p>
          </div>
          <Link href="/manager/create" className="btn-success">
            創建新基金
          </Link>
        </div>

        {/* 指標卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-600">管理總資產 (AUM)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {metrics.totalAUM}
                </p>
                <p
                  className={`text-sm mt-1 ${
                    metrics.pct24h >= 0 ? "text-success-600" : "text-danger-600"
                  }`}
                >
                  {metrics.pct24h >= 0 ? "+" : ""}
                  {metrics.pct24h.toFixed(2)}% 近24小時
                </p>
              </div>
            </div>
          </div>

          <div className="card">
            <div>
              <p className="text-sm text-gray-600">旗下基金數量</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {metrics.activeFunds}
              </p>
              <p className="text-sm text-gray-600 mt-1">檔活躍基金</p>
            </div>
          </div>
        </div>

        {/* Performance Charts Section */}
        {selectedFund && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">基金表現詳情</h2>
              <button
                onClick={() => setSelectedFund(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PerformanceChart
                fundId={selectedFund}
                fundName={funds.find((f) => f.address === selectedFund)?.name}
                height={300}
              />
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">基金統計</h3>
                {(() => {
                  const fund = funds.find((f) => f.address === selectedFund);
                  const update = realTimeUpdates.get(selectedFund);
                  return fund ? (
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-gray-600">總資產 (AUM)</span>
                        <span className="font-medium">{fund.totalAssets}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">份額淨值 (NAV)</span>
                        <span className="font-medium">{fund.sharePrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">投資人數量</span>
                        <span className="font-medium">{fund.investors}</span>
                      </div>
                      {update && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-600">總份額</span>
                            <span className="font-medium">
                              {Number(update.totalShares || 0).toLocaleString(
                                undefined,
                                { maximumFractionDigits: 2 }
                              )}
                            </span>
                          </div>
                          <div
                            className={`flex justify-between ${
                              Number(update.priceChangePercentage24h) >= 0
                                ? "text-success-600"
                                : "text-danger-600"
                            }`}
                          >
                            <span className="text-gray-600">24小時變化</span>
                            <span className="font-medium">
                              {Number(update.priceChangePercentage24h) >= 0
                                ? "+"
                                : ""}
                              {Number(update.priceChangePercentage24h).toFixed(
                                2
                              )}
                              %
                            </span>
                          </div>
                        </>
                      )}
                      <div className="pt-4 border-t">
                        <Link
                          href={`/manager/fund/${fund.id}`}
                          className="btn-primary w-full text-center"
                        >
                          管理基金
                        </Link>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>
          </div>
        )}

        {/* 基金列表 */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">我的基金</h2>
            {isLoading && <LoadingSpinner />}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">
                    基金名稱
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">
                    總資產 (AUM)
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">
                    份額淨值 (NAV)
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">
                    日漲跌
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">
                    投資人數
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {funds.map((fund) => {
                  const isUpdating = realTimeUpdates.has(fund.address);
                  const timeSinceUpdate = Date.now() - fund.lastUpdated;
                  const isRecent = timeSinceUpdate < 60000; // Less than 1 minute
                  return (
                    <tr key={fund.id} className="border-b border-gray-100">
                      <td className="py-4 px-4">
                        <div className="flex items-center">
                          <div>
                            <div className="font-medium text-gray-900 flex items-center">
                              {fund.name}
                              {isRecent && (
                                <span className="ml-2 w-2 h-2 bg-success-500 rounded-full animate-pulse"></span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {fund.symbol}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-900 font-medium">
                        {fund.totalAssets}
                        {isUpdating && (
                          <div className="text-xs text-blue-500 animate-pulse">
                            更新中...
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-gray-900">
                        {fund.sharePrice}
                      </td>
                      <td
                        className={`py-4 px-4 font-medium ${fund.performanceColor}`}
                      >
                        {fund.performance}
                      </td>
                      <td className="py-4 px-4 text-gray-900">
                        {fund.investors.toLocaleString()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() =>
                              setSelectedFund(
                                selectedFund === fund.address
                                  ? null
                                  : fund.address
                              )
                            }
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                              selectedFund === fund.address
                                ? "bg-primary-600 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {selectedFund === fund.address
                              ? "隱藏圖表"
                              : "查看圖表"}
                          </button>
                          <Link
                            href={`/manager/fund/${fund.id}`}
                            className="btn-primary text-sm"
                          >
                            管理
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!isLoading && funds.length === 0 && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📊</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  還沒有基金
                </h3>
                <p className="text-gray-500 mb-6">
                  創建您的第一個基金來開始管理投資組合
                </p>
                <Link
                  href="/manager/create"
                  className="btn-primary inline-flex items-center"
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  創建新基金
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
