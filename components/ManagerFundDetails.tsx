"use client";

import { useState, useEffect, useMemo } from "react";
import { useWeb3 } from "../lib/web3-context";
import { ethers } from "ethers";
import {
  DENOMINATION_ASSETS,
  COMPTROLLER_ABI,
  FEE_MANAGER_ABI,
  POLICY_MANAGER_ABI,
  //   MANAGEMENT_FEE_ABI,
  //   PERFORMANCE_FEE_ABI,
} from "../lib/contracts";
import { formatTokenAmount } from "../lib/contracts";
import {
  Chart,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";
import { FundService } from "../lib/fund-service";
import {
  fundDatabaseService,
  FundData,
  InvestmentRecord,
  UserInvestmentSummary,
} from "../lib/fund-database-service";
import {
  getHistoricalSharePrices,
  getRealtimeSharePrice,
  getVaultGAV,
} from "@/lib/infura-service";
import { Line } from "react-chartjs-2";
import { SEPOLIA_MAINNET_RPC } from "@/lib/constant";
import FundLineChart from "./FundLineChart";
import UniswapPanel from './UniswapPanel';

interface ManagerFundDetailsProps {
  fundId: string;
}

Chart.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
);
export default function ManagerFundDetails({
  fundId,
}: ManagerFundDetailsProps) {
  // helpers
  const isPos = (n: number) => Number.isFinite(n) && n > 0;
  const SHARE_DECIMALS = 18;
  const toHumanShares = (v: string | number | bigint) => {
    try {
      return Number(ethers.formatUnits(v, SHARE_DECIMALS));
    } catch {
      // 不像 wei 的字串，就當作已是人類可讀
      return Number(v);
    }
  };
  const toNumber = (s: string | number) =>
    typeof s === "number" ? s : parseFloat(String(s).replace(/[^0-9.\-]/g, ""));

  const { address, isConnected, provider } = useWeb3();
  const [fund, setFund] = useState<FundData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fundNotFound, setFundNotFound] = useState(false);

  // Deposit/Redeem states
  const [depositAmount, setDepositAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [userBalance, setUserBalance] = useState("0");
  const [userShares, setUserShares] = useState("0");

  // 新增：投資記錄相關狀態
  const [investmentHistory, setInvestmentHistory] = useState<
    InvestmentRecord[]
  >([]);
  const [investmentSummary, setInvestmentSummary] =
    useState<UserInvestmentSummary | null>(null);
  const [fundInvestmentHistory, setFundInvestmentHistory] = useState<
    InvestmentRecord[]
  >([]);

  // Trading states (keep existing)
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeAsset, setTradeAsset] = useState("ETH");
  const [tradeType, setTradeType] = useState("buy"); // 'buy' or 'sell'
  const [isTrading, setIsTrading] = useState(false);

  const [historicalPrices, setHistoricalPrices] = useState<
    { blockNumber: number; sharePrice: number }[]
  >([
    { blockNumber: 10001, sharePrice: 1.02 },
    { blockNumber: 10003, sharePrice: 1.04 },
    { blockNumber: 10005, sharePrice: 1.1 },
    { blockNumber: 10007, sharePrice: 1.13 },
    { blockNumber: 10009, sharePrice: 1.14 },
  ]);
  const [realtimePrice, setRealtimePrice] = useState<number | null>(null);

  const [gavHistory, setGavHistory] = useState<
    { blockNumber: number; gav: number }[]
  >([]);
  const [realtimeGAV, setRealtimeGAV] = useState<number | null>(null);

  const [wethUsdPrice, setWethUsdPrice] = useState<number | null>(null);
  const [wethUsdHisPrice, setWethUsdHisPrice] = useState<
    { date: string; price: number }[] | null
  >([]);

  const [feeDetails, setFeeDetails] = useState<any[]>([]);
  const [policyDetails, setPolicyDetails] = useState<any[]>([]);
  const [totalReturn, setTotalReturn] = useState({
    amount: "0",
    percentage: "0",
  });
  const [returnTimeframe, setReturnTimeframe] = useState("all");

  // Mock data for the chart
  const [historicalShareData, setHistoricalShareData] = useState(() => {
    const data = [];
    let lastPrice = 1.0;
    const today = new Date();
    for (let i = 365; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const timestamp = Math.floor(date.getTime() / 1000);
      const priceChange = (Math.random() - 0.49) * 0.05;
      lastPrice += priceChange;
      data.push({ timestamp, sharePrice: Math.max(0.5, lastPrice) }); // Ensure price doesn't go below 0.5
    }
    return data;
  });
  const [chartTimeRange, setChartTimeRange] = useState("all");

  const [chartType, setChartType] = useState<
    "sharePrice" | "gavUsd" | "wethUsd"
  >("sharePrice");

  const filteredChartData = useMemo(() => {
    const now = new Date();
    let startTime = new Date();

    switch (chartTimeRange) {
      case "7d":
        startTime.setDate(now.getDate() - 7);
        break;
      case "1m":
        startTime.setMonth(now.getMonth() - 1);
        break;
      case "3m":
        startTime.setMonth(now.getMonth() - 3);
        break;
      case "1y":
        startTime.setFullYear(now.getFullYear() - 1);
        break;
      case "all":
      default:
        return historicalShareData;
    }

    const startTimeStamp = Math.floor(startTime.getTime() / 1000);
    return historicalShareData.filter((d) => d.timestamp >= startTimeStamp);
  }, [historicalShareData, chartTimeRange]);

  // 獲取計價資產
  const denominationAsset =
    DENOMINATION_ASSETS.find(
      (asset) => asset.address === fund?.denominationAsset
    ) || DENOMINATION_ASSETS[0];

  // 放在檔案頂部其它工具函式旁
  const fmtShares = (v: number) =>
    v >= 1
      ? v.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : v.toLocaleString(undefined, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 6,
        });

  const fmtUSD = (v: number) =>
    `$${v.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

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

  useEffect(() => {
    const loadRealtime = async () => {
      if (fund?.vaultProxy) {
        try {
          const price = await getRealtimeSharePrice(
            fund.vaultProxy,
            denominationAsset.decimals
          );

          setRealtimePrice(Number(price));
        } catch (e) {
          console.warn("即時價格查詢失敗", e);
        }
      }
    };
    loadRealtime();
  }, [fund]);

  useEffect(() => {
    const loadGavHistory = async () => {
      if (fund?.vaultProxy && historicalPrices.length > 0) {
        try {
          const provider = new ethers.JsonRpcProvider(SEPOLIA_MAINNET_RPC);
          const decimals = denominationAsset.decimals || 18;
          const gavs = await Promise.all(
            historicalPrices.map(async (p) => {
              // 直接用 vaultProxy 查 GAV（可加 blockTag 但 Infura 可能不支援）
              const gav = await getVaultGAV(fund.vaultProxy);
              return {
                blockNumber: p.blockNumber,
                gav: Number(ethers.formatUnits(gav, decimals)),
              };
            })
          );

          console.log("GAV History:", gavs);
          setGavHistory(gavs);
        } catch (e) {
          console.warn("GAV 歷史查詢失敗", e);
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
          "function getRoundData(uint80 _roundId) view returns (uint80, int256, uint256, uint256, uint80)",
        ];
        // 用 RPC provider，不用 web3 context 的 provider
        const rpcProvider = new ethers.JsonRpcProvider(SEPOLIA_MAINNET_RPC);
        const priceFeed = new ethers.Contract(
          priceFeedAddress,
          priceFeedAbi,
          rpcProvider
        );
        const [latestRoundId] = await priceFeed.latestRoundData();

        const [, answer] = await priceFeed.latestRoundData();
        setWethUsdPrice(Number(answer) / 1e8);
        const history = [];
        for (let i = 4; i >= 0; i--) {
          // 只查 5 筆
          try {
            const roundId = latestRoundId - BigInt(i);
            const [, answer, , timestamp] = await priceFeed.getRoundData(
              roundId
            );
            console.log(`WETH/USD Round ${roundId}:`, {
              answer: Number(answer) / 1e8,
              timestamp: Number(timestamp),
            });
            history.push({
              date: new Date(Number(timestamp) * 1000)
                .toISOString()
                .replace("T", " ")
                .slice(0, 19), // "2025-09-01 14:23:00"
              price: Number(answer) / 1e8,
            });
          } catch (e) {
            // 快速跳過查不到的 round
            continue;
          }
        }
        setWethUsdHisPrice(history);
      } catch (e) {
        console.warn("WETH/USD 歷史價格查詢失敗", e);
        setWethUsdHisPrice([]);
      }
    };
    loadWethHistoricalPrice();
  }, []);

  // 載入基金資料
  useEffect(() => {
    loadFundFromDatabase();
  }, [fundId]);

  // 當基金資料載入且用戶連接錢包時，載入用戶資料
  useEffect(() => {
    if (isConnected && address && provider && fund) {
      loadUserData();
    }
  }, [isConnected, address, provider, fund]);

  const loadFundFromDatabase = async () => {
    setIsLoading(true);
    setFundNotFound(false);
    try {
      console.log("Loading fund with ID:", fundId);

      // 從資料庫載入基金資料
      const fundsList = await fundDatabaseService.getFundsByCreator(
        address || ""
      );
      const foundFund = fundsList.find((f) => f.id === fundId);

      if (!foundFund) {
        console.warn("Fund not found in database");
        setFundNotFound(true);
        setFund(null);
        return;
      }

      setFund(foundFund);
      console.log("Loaded fund from database:", foundFund);

      // 如果有區塊鏈連接，嘗試載入區塊鏈資料
      if (provider && foundFund.vaultProxy && foundFund.comptrollerProxy) {
        try {
          const fundService = new FundService(provider);
          const realFundData = await fundService.getFundDetails(
            foundFund.vaultProxy,
            foundFund.comptrollerProxy
          );

          console.log("Loaded fund data from blockchain:", realFundData);
          // 更新基金資料，結合資料庫和區塊鏈資料
          setFund((prev) =>
            prev
              ? {
                  ...prev,
                  totalAssets: realFundData.totalAssets || prev.totalAssets,
                  sharePrice: realFundData.sharePrice || prev.sharePrice,
                  totalShares: realFundData.totalShares || prev.totalShares,
                  totalInvestors:
                    (realFundData as any).investors || prev.totalInvestors || 0,
                }
              : null
          );

          console.log("Updated with blockchain data:", realFundData);
        } catch (error) {
          console.warn("Failed to load blockchain data:", error);
        }
      }
    } catch (error) {
      console.error("Error loading fund:", error);
      setFundNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserData = async () => {
    if (!provider || !address || !fund) return;

    try {
      const fundService = new FundService(provider);

      // Get user's denomination asset balance
      const balance = await fundService.getTokenBalance(
        fund.denominationAsset,
        address
      );
      setUserBalance(balance);

      // Get user's fund shares
      const shares = await fundService.getUserBalance(fund.vaultProxy, address);
      setUserShares(shares);

      // 載入投資記錄和總結
      try {
        const [userHistory, userSummary, fundHistory] = await Promise.all([
          fundDatabaseService.getUserFundInvestmentHistory(fund.id, address),
          fundDatabaseService.getUserInvestmentSummary(fund.id, address),
          fundDatabaseService.getFundInvestmentHistory(fund.id),
        ]);

        setInvestmentHistory(userHistory);
        setInvestmentSummary(userSummary);
        setFundInvestmentHistory(fundHistory);

        console.log("Loaded investment data:", {
          userHistory,
          userSummary,
          fundHistory,
        });
      } catch (error) {
        console.warn("Failed to load investment records:", error);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  useEffect(() => {
    if (provider && fund?.comptrollerProxy) {
      loadFeeAndPolicyDetails(fund.comptrollerProxy);
    }
  }, [provider, fund]);

  useEffect(() => {
    if (!fund || fundInvestmentHistory.length === 0) return;

    const calculateReturn = () => {
      const now = Date.now();
      let startTime = 0;

      switch (returnTimeframe) {
        case "1h":
          startTime = now - 3600 * 1000;
          break;
        case "1d":
          startTime = now - 24 * 3600 * 1000;
          break;
        case "1w":
          startTime = now - 7 * 24 * 3600 * 1000;
          break;
        case "1m":
          startTime = now - 30 * 24 * 3600 * 1000;
          break;
        default: // 'all'
          startTime = 0;
      }

      // Calculate Current AUM
      const currentTotalShares = fundInvestmentHistory.reduce((sum, r) => {
        const shares = parseFloat(r.shares);
        return r.type === "deposit" ? sum + shares : sum - shares;
      }, 0);
      const currentSharePrice = fund.sharePrice
        ? parseFloat(fund.sharePrice)
        : 0;
      const currentAUM = currentTotalShares * currentSharePrice;

      // Records for the selected period and before
      const periodRecords = fundInvestmentHistory.filter(
        (r) => new Date(r.timestamp).getTime() >= startTime
      );
      const beforePeriodRecords = fundInvestmentHistory.filter(
        (r) => new Date(r.timestamp).getTime() < startTime
      );

      // Calculate Net Inflow for the period
      const periodNetInflow = periodRecords.reduce((sum, r) => {
        const amount = parseFloat(r.amount);
        return r.type === "deposit" ? sum + amount : sum - amount;
      }, 0);

      let aumStart = 0;
      let netCapitalInflowForPercentage = 0;

      if (returnTimeframe === "all") {
        const totalDeposits = fundInvestmentHistory
          .filter((r) => r.type === "deposit")
          .reduce((sum, r) => sum + parseFloat(r.amount), 0);
        netCapitalInflowForPercentage = totalDeposits; // For ROI, base is total deposits
        aumStart = 0; // For since inception, starting AUM is 0
      } else {
        if (beforePeriodRecords.length > 0) {
          const startTotalShares = beforePeriodRecords.reduce((sum, r) => {
            const shares = parseFloat(r.shares);
            return r.type === "deposit" ? sum + shares : sum - shares;
          }, 0);
          const startSharePrice = parseFloat(
            beforePeriodRecords[beforePeriodRecords.length - 1].sharePrice
          );
          aumStart = startTotalShares * startSharePrice;

          const depositsInPeriod = periodRecords
            .filter((r) => r.type === "deposit")
            .reduce((sum, r) => sum + parseFloat(r.amount), 0);
          netCapitalInflowForPercentage = aumStart + depositsInPeriod;
        } else {
          // No records before this period, so treat as since inception for this period
          const depositsInPeriod = periodRecords
            .filter((r) => r.type === "deposit")
            .reduce((sum, r) => sum + parseFloat(r.amount), 0);
          netCapitalInflowForPercentage = depositsInPeriod;
          aumStart = 0;
        }
      }

      const returnAmount = currentAUM - aumStart - periodNetInflow;
      const returnPercentage =
        netCapitalInflowForPercentage > 0
          ? (returnAmount / netCapitalInflowForPercentage) * 100
          : 0;

      setTotalReturn({
        amount: returnAmount.toFixed(4),
        percentage: returnPercentage.toFixed(2),
      });
    };

    calculateReturn();
  }, [fund, fundInvestmentHistory, returnTimeframe]);

  const loadFeeAndPolicyDetails = async (comptrollerProxy: string) => {
    if (!provider) return;

    const comptroller = new ethers.Contract(
      comptrollerProxy,
      COMPTROLLER_ABI,
      provider
    );
    const feeManagerAddress = await comptroller.getFeeManager();
    const policyManagerAddress = await comptroller.getPolicyManager();

    const feeManager = new ethers.Contract(
      feeManagerAddress,
      FEE_MANAGER_ABI,
      provider
    );
    const policyManager = new ethers.Contract(
      policyManagerAddress,
      POLICY_MANAGER_ABI,
      provider
    );

    const enabledFees = await feeManager.getEnabledFeesForFund(
      comptrollerProxy
    );
    const enabledPolicies = await policyManager.getEnabledPoliciesForFund(
      comptrollerProxy
    );

    const feePromises = enabledFees.map(async (feeAddress: string) => {
      return {
        name: "Entrance Fee",
        address: feeAddress,
        value: `${Number(fund?.entranceFeePercent ?? 0)}%`,
      };
    });

    const policyPromises = enabledPolicies.map(
      async (policyAddress: string) => {
        let policyInfo = {
          name: "Unknown Policy",
          address: policyAddress,
          value: "Enabled",
        };
        try {
          if (
            policyAddress.toLowerCase() ===
            "0x0eD7E38C4535989e392843884326925B4469EB5A".toLowerCase()
          ) {
            policyInfo.name = "Investor Whitelist";
            // Further logic to get list ID and members can be added here
          }
        } catch (e) {
          console.error(
            `Error fetching details for policy ${policyAddress}:`,
            e
          );
        }
        return policyInfo;
      }
    );

    setFeeDetails(await Promise.all(feePromises));
    setPolicyDetails(await Promise.all(policyPromises));
  };

  const handleDeposit = async () => {
    if (!provider || !address || !depositAmount || !fund) return;

    setIsDepositing(true);
    try {
      const fundService = new FundService(provider);

      // 1) 餘額檢查（人類可讀）
      const balance = parseFloat(userBalance);
      const amount = parseFloat(depositAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        alert("請輸入正確的金額");
        return;
      }
      if (amount > balance) {
        alert("餘額不足");
        return;
      }

      // 2) allowance
      const allowance = await fundService.getTokenAllowance(
        fund.denominationAsset,
        address,
        fund.comptrollerProxy
      );
      if (parseFloat(allowance) < amount) {
        await fundService.approveToken(
          fund.denominationAsset,
          fund.comptrollerProxy,
          depositAmount
        );
        await new Promise((r) => setTimeout(r, 1500));
      }

      // 3) 取得「操作前」的實際份額餘額（wei → 人類可讀）
      const beforeShares = toHumanShares(
        (await fundService.getUserBalance?.(fund.vaultProxy, address)) ??
          (await fundService.getUserBalance(fund.vaultProxy, address))
      );

      // 4) 執行申購
      const txHash = await fundService.buyShares(
        fund.comptrollerProxy,
        depositAmount
      );

      // 5) 取得「操作後」的實際份額餘額，再相減得到真實新增份額
      const afterShares = toHumanShares(
        (await fundService.getUserBalance?.(fund.vaultProxy, address)) ??
          (await fundService.getUserBalance(fund.vaultProxy, address))
      );
      const gainedShares = Math.max(0, afterShares - beforeShares);

      // 6) 決定要寫進 DB 的 shares（人類可讀）。若鏈上查不到，就以金額/有效 NAV 估算。
      const effectiveNavNum = toNumber(fund.sharePrice || "1") || 1;
      const sharesHuman =
        Number.isFinite(gainedShares) && gainedShares > 0
          ? gainedShares
          : amount / effectiveNavNum;

      // 7) 寫 DB：amount 用人類可讀 USDC，shares 用人類可讀份額（非 wei）
      await fundDatabaseService.recordInvestment({
        fundId: fund.id,
        investorAddress: address,
        type: "deposit",
        amount: amount.toString(),
        shares: sharesHuman.toString(),
        sharePrice: effectiveNav.toFixed(6),
        txHash,
      });

      alert(`成功投資 ${amount} ${denominationAsset.symbol}！`);
      setDepositAmount("");

      await loadFundFromDatabase();
      await loadUserData();
    } catch (error: any) {
      console.error("Deposit failed:", error);
      alert(`投資失敗：${error.message}`);
    } finally {
      setIsDepositing(false);
    }
  };

  async function settlePerformanceFee(
    comptrollerProxyAddress: string,
    signer: any
  ) {
    const performanceFeeAbi = [
      "function settle(address _comptrollerProxy) external",
    ];
    const performanceFee = new ethers.Contract(
      "0x82EDeB07c051D6461acD30c39b5762D9523CEf1C",
      performanceFeeAbi,
      signer
    );
    try {
      const tx = await performanceFee.settle(comptrollerProxyAddress);
      await tx.wait();
      console.log(
        `Performance fee settled for ${comptrollerProxyAddress}, tx: ${tx.hash}`
      );
      return tx.hash;
    } catch (error: any) {
      console.error("Settle performance fee failed:", error);
      throw error;
    }
  }

  const handleRedeem = async () => {
    if (!provider || !address || !redeemAmount || !fund) return;

    setIsRedeeming(true);
    try {
      const fundService = new FundService(provider);

      // 1) 份額檢查（人類可讀）
      const sharesOwned = parseFloat(userShares);
      const sharesToRedeem = parseFloat(redeemAmount);
      if (!Number.isFinite(sharesToRedeem) || sharesToRedeem <= 0) {
        alert("請輸入正確的份額");
        return;
      }
      if (sharesToRedeem > sharesOwned) {
        alert("持有份額不足");
        return;
      }

      // 2) 取得「操作前」真實份額（wei→人類可讀）
      const beforeShares = toHumanShares(
        (await fundService.getUserBalance?.(fund.vaultProxy, address)) ??
          (await fundService.getUserBalance(fund.vaultProxy, address))
      );

      // 3) 贖回
      const txHash = await fundService.redeemShares(
        fund.comptrollerProxy,
        redeemAmount
      );

      // 4) 取得「操作後」真實份額，計算實際扣減份額
      const afterShares = toHumanShares(
        (await fundService.getUserBalance?.(fund.vaultProxy, address)) ??
          (await fundService.getUserBalance(fund.vaultProxy, address))
      );
      const reducedShares = Math.max(0, beforeShares - afterShares);

      // 5) 寫 DB 的 shares 仍為人類可讀；amount 用 NAV * 份額（人類可讀）
      const sharesHuman =
        Number.isFinite(reducedShares) && reducedShares > 0
          ? reducedShares
          : sharesToRedeem;

      const effectiveNavNum = toNumber(fund.sharePrice || "1") || 1;
      const amountHuman = sharesHuman * effectiveNavNum;

      await fundDatabaseService.recordInvestment({
        fundId: fund.id,
        investorAddress: address,
        type: "redeem",
        amount: amountHuman.toString(),
        shares: sharesHuman.toString(),
        sharePrice: effectiveNav.toFixed(6),
        txHash,
      });

      alert(`成功贖回 ${sharesHuman.toFixed(4)} 份額！`);
      setRedeemAmount("");

      await loadFundFromDatabase();
      await loadUserData();
    } catch (error: any) {
      console.error("Redeem failed:", error);
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
      alert(
        `${
          tradeType === "buy" ? "購買" : "出售"
        } ${tradeAmount} ${tradeAsset} 成功！`
      );
      setTradeAmount("");
      await loadFundFromDatabase(); // Refresh fund data
    } catch (error: any) {
      console.error("Trade failed:", error);
      alert(`交易失敗：${error.message}`);
    } finally {
      setIsTrading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            需要連接錢包
          </h2>
          <p className="text-gray-600 mb-6">請先連接您的錢包以管理基金</p>
          <div className="text-4xl mb-4">🔗</div>
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
          <h2 className="text-2xl font-bold text-gray-900 mb-4">基金不存在</h2>
          <p className="text-gray-600 mb-6">
            找不到指定的基金，請確認基金 ID 是否正確
          </p>
          <a href="/manager/dashboard" className="btn-primary">
            返回儀表板
          </a>
        </div>
      </div>
    );
  }

  // 計算已發行份額
  const totalShares = fundInvestmentHistory.reduce((sum, r) => {
    const shares = parseFloat(r.shares);
    return r.type === "deposit" ? sum + shares : sum - shares;
  }, 0);

  // ★ use last positive sharePrice from history; else fallback to fund.sharePrice; else 1
  const latestSharePrice = (() => {
    const positives = fundInvestmentHistory
      .map((r) => parseFloat(r.sharePrice))
      .filter((v) => isPos(v));
    if (positives.length) return positives[positives.length - 1];

    const f = parseFloat(fund?.sharePrice ?? "NaN");
    return isPos(f) ? f : 1;
  })();

  // 取得有效 NAV（份額淨值）：投資紀錄最後一筆 > 即時價 > fund.sharePrice > 1
  const lastRecordPrice =
    fundInvestmentHistory.length > 0
      ? parseFloat(
          fundInvestmentHistory[fundInvestmentHistory.length - 1].sharePrice
        )
      : NaN;

  const parsedFundSharePrice = parseFloat(fund?.sharePrice ?? "NaN");

  const effectiveNav = (() => {
    // 1) 最後一筆有意義的 sharePrice
    const lastPositiveHist = (() => {
      const ps = fundInvestmentHistory
        .map((r) => parseFloat(r.sharePrice))
        .filter(isPos);
      return ps.length ? ps[ps.length - 1] : NaN;
    })();
    if (isPos(lastPositiveHist)) return lastPositiveHist;

    // 2) 鏈上即時價
    if (isPos(realtimePrice ?? NaN)) return Number(realtimePrice);

    // 3) fund.sharePrice
    const fsp = parseFloat(fund?.sharePrice ?? "NaN");
    if (isPos(fsp)) return fsp;

    // 4) 成本均價（避免顯示 0）
    const totalShares = fundInvestmentHistory.reduce((acc, r) => {
      const s = parseFloat(r.shares);
      return r.type === "deposit" ? acc + s : acc - s;
    }, 0);
    const totalDeposited = fundInvestmentHistory
      .filter((r) => r.type === "deposit")
      .reduce((acc, r) => acc + parseFloat(r.amount), 0);

    const avgCost = totalShares > 0 ? totalDeposited / totalShares : NaN;
    if (isPos(avgCost)) return avgCost;

    // 5) 最後保險：顯示成 1
    return 1;
  })();

  // 計算總資產 (AUM)
  const totalAssets = totalShares * latestSharePrice;

  const totalAssetsUSD =
    wethUsdPrice !== null ? totalAssets * wethUsdPrice : null;

  console.log("gavHistory:", gavHistory);
  console.log("wethUsdHisPrice:", wethUsdHisPrice);
  const aumUsdHistory = gavHistory.map((g, i) => {
    const wethUsdHisArr = wethUsdHisPrice ?? [];
    return {
      date: wethUsdHisArr[i]?.date || `#${g.blockNumber}`,
      value: wethUsdHisArr[i]
        ? g.gav * wethUsdHisArr[i].price
        : g.gav * (wethUsdPrice || 1840),
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

        <div className="mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-600">
              收益時間範圍:
            </span>
            <div>
              <button
                onClick={() => setReturnTimeframe("all")}
                className={`px-3 py-1 text-sm rounded-md ${
                  returnTimeframe === "all"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setReturnTimeframe("1m")}
                className={`ml-2 px-3 py-1 text-sm rounded-md ${
                  returnTimeframe === "1m"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                月
              </button>
              <button
                onClick={() => setReturnTimeframe("1w")}
                className={`ml-2 px-3 py-1 text-sm rounded-md ${
                  returnTimeframe === "1w"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                週
              </button>
              <button
                onClick={() => setReturnTimeframe("1d")}
                className={`ml-2 px-3 py-1 text-sm rounded-md ${
                  returnTimeframe === "1d"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                日
              </button>
              <button
                onClick={() => setReturnTimeframe("1h")}
                className={`ml-2 px-3 py-1 text-sm rounded-md ${
                  returnTimeframe === "1h"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                時
              </button>
            </div>
          </div>
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
                      ? `$${totalAssets.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}`
                      : "--"}
                  </p>
                  <p className="text-sm text-gray-600">總資產 (AUM)</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {latestSharePrice > 0
                      ? `$${latestSharePrice.toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}`
                      : "--"}
                  </p>
                  <p className="text-sm text-gray-600">份額淨值</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {totalShares.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    份額
                  </p>
                  <p className="text-sm text-gray-600">已發行份額</p>
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    -- {/* 如果是USDC，不需要顯示WETH/USD */}
                  </p>
                  <p className="text-sm text-gray-600">
                    {denominationAsset.symbol}/USD
                  </p>
                </div>

                <div className="text-center">
                  <p
                    className={`text-2xl font-bold ${
                      parseFloat(totalReturn.amount) >= 0
                        ? "text-success-600"
                        : "text-danger-600"
                    }`}
                  >
                    {totalReturn.amount}
                  </p>
                  <p className="text-sm text-gray-600">
                    總收益 ({totalReturn.percentage}%)
                  </p>
                </div>

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
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  歷史份額淨值
                </h2>
                <div className="flex items-center space-x-1 rounded-lg bg-gray-100 p-1">
                  <button
                    onClick={() => setChartTimeRange("7d")}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      chartTimeRange === "7d"
                        ? "bg-white shadow text-primary-600"
                        : "text-gray-600"
                    }`}
                  >
                    7D
                  </button>
                  <button
                    onClick={() => setChartTimeRange("1m")}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      chartTimeRange === "1m"
                        ? "bg-white shadow text-primary-600"
                        : "text-gray-600"
                    }`}
                  >
                    1M
                  </button>
                  <button
                    onClick={() => setChartTimeRange("3m")}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      chartTimeRange === "3m"
                        ? "bg-white shadow text-primary-600"
                        : "text-gray-600"
                    }`}
                  >
                    3M
                  </button>
                  <button
                    onClick={() => setChartTimeRange("1y")}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      chartTimeRange === "1y"
                        ? "bg-white shadow text-primary-600"
                        : "text-gray-600"
                    }`}
                  >
                    1Y
                  </button>
                  <button
                    onClick={() => setChartTimeRange("all")}
                    className={`px-3 py-1 text-sm font-medium rounded-md ${
                      chartTimeRange === "all"
                        ? "bg-white shadow text-primary-600"
                        : "text-gray-600"
                    }`}
                  >
                    All
                  </button>
                </div>
              </div>
              <FundLineChart
                chartData={filteredChartData}
                title="Share Price Over Time"
              />
            </div>

            {/* Uniswap Panel - 移動到這裡 */}
            <UniswapPanel fund={fund} />

            {/* Fund Investment History */}
            <div className="card">
              <h2 className="text-xl font-bold text-gray-900 mb-6">
                基金投資記錄
              </h2>
              <div className="space-y-3">
                {fundInvestmentHistory.length > 0 ? (
                  fundInvestmentHistory.slice(0, 10).map((record, index) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">
                          {record.type === "deposit"
                            ? "投資人申購"
                            : "投資人贖回"}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(record.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {record.investorAddress.substring(0, 6)}...
                          {record.investorAddress.substring(38)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-medium ${
                            record.type === "deposit"
                              ? "text-success-600"
                              : "text-danger-600"
                          }`}
                        >
                          {record.type === "deposit" ? "+" : "-"}$
                          {parseFloat(record.amount).toFixed(2)}
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
                    <p className="text-sm mt-1">
                      投資記錄會在有申購或贖回活動後顯示
                    </p>
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

              {(() => {
                const shares = parseFloat(userShares || "0");
                const symbol = denominationAsset.symbol;
                const value = shares * effectiveNav;

                const cost = investmentSummary
                  ? parseFloat(investmentSummary.totalDeposited || "0")
                  : 0;
                const pnl = value - cost;
                const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;

                return (
                  <div className="space-y-4">
                    {/* 你擁有 */}
                    <div className="flex items-baseline justify-between">
                      <span className="text-gray-600">你擁有</span>
                      <span className="text-2xl font-bold text-gray-900">
                        {fmtShares(shares)} 份額
                      </span>
                    </div>

                    {/* 估計市值 */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">估計市值</span>
                      <span className="font-medium">
                        ${value.toFixed(2)} {symbol}
                      </span>
                    </div>

                    {/* NAV / 份 */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">NAV / 份</span>
                      <span className="font-medium">
                        ${effectiveNav.toFixed(2)} {symbol}
                      </span>
                    </div>

                    {/* 錢包餘額 */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">錢包餘額</span>
                      <span className="font-medium">
                        {parseFloat(userBalance).toLocaleString(undefined, {
                          maximumFractionDigits: 6,
                        })}{" "}
                        {symbol}
                      </span>
                    </div>

                    {investmentSummary && (
                      <div className="border-t pt-3 mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">累計投入成本</span>
                          <span className="font-medium">
                            {fmtUSD(cost)} {symbol}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">未實現損益</span>
                          <span
                            className={`font-medium ${
                              pnl >= 0 ? "text-success-600" : "text-danger-600"
                            }`}
                          >
                            {fmtUSD(pnl)} ({pnlPct.toFixed(2)}%)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* Deposit Panel */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                💰 投資基金
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    投資金額 ({denominationAsset.symbol})
                  </label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder={`可用餘額: ${parseFloat(userBalance).toFixed(
                      4
                    )}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    預計獲得約{" "}
                    {(() => {
                      const amount = parseFloat(depositAmount);
                      const dec = denominationAsset.decimals || 18;

                      // 1) 先拿你已計算的有效 NAV（優先用 effectiveNav，避免用到原始 sharePrice）
                      const navRaw = Number(effectiveNav);

                      // 2) 規範化 NAV：若像 wei 一樣超大就除以 10^dec，若超小就乘以 10^dec，其餘維持不變
                      const pow = Math.pow(10, dec);
                      const nav =
                        !Number.isFinite(navRaw) || navRaw <= 0
                          ? 1
                          : navRaw > 1000
                          ? navRaw / pow
                          : navRaw < 1e-6
                          ? navRaw * pow
                          : navRaw;

                      if (
                        !depositAmount ||
                        !Number.isFinite(amount) ||
                        amount <= 0 ||
                        nav <= 0
                      ) {
                        return "0";
                      }

                      const shares = amount / nav; // 人類可讀金額 / 人類可讀 NAV
                      return shares.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 6,
                      });
                    })()}
                    份額
                  </p>
                </div>

                <button
                  onClick={handleDeposit}
                  disabled={
                    isDepositing ||
                    !depositAmount ||
                    parseFloat(depositAmount) > parseFloat(userBalance)
                  }
                  className="w-full py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center bg-success-500 hover:bg-success-600 text-white"
                >
                  {isDepositing && <div className="loading-spinner mr-2"></div>}
                  {isDepositing ? "投資中..." : "投資基金"}
                </button>
              </div>
            </div>
            {/* Redeem Panel */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                💸 贖回基金
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    贖回份額
                  </label>
                  <input
                    type="number"
                    value={redeemAmount}
                    onChange={(e) => setRedeemAmount(e.target.value)}
                    placeholder={`持有份額: ${parseFloat(userShares).toFixed(
                      4
                    )}`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    預計贖回約 $
                    {redeemAmount
                      ? (
                          parseFloat(redeemAmount) *
                          parseFloat(fund.sharePrice || "1")
                        ).toFixed(2)
                      : "0"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setRedeemAmount(
                        (parseFloat(userShares) * 0.25).toString()
                      )
                    }
                    className="flex-1 py-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    25%
                  </button>
                  <button
                    onClick={() =>
                      setRedeemAmount((parseFloat(userShares) * 0.5).toString())
                    }
                    className="flex-1 py-1 px-2 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    50%
                  </button>
                  <button
                    onClick={() =>
                      setRedeemAmount(
                        (parseFloat(userShares) * 0.75).toString()
                      )
                    }
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
                  disabled={
                    isRedeeming ||
                    !redeemAmount ||
                    parseFloat(redeemAmount) > parseFloat(userShares)
                  }
                  className="w-full py-3 px-4 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center bg-danger-500 hover:bg-danger-600 text-white"
                >
                  {isRedeeming && <div className="loading-spinner mr-2"></div>}
                  {isRedeeming ? "贖回中..." : "贖回份額"}
                </button>
              </div>
            </div>
            {/* Fund Settings */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4">基金設定</h3>

              <div className="space-y-4">
                {feeDetails.map((fee) => (
                  <div
                    key={fee.address}
                    className="flex justify-between items-center"
                  >
                    <span className="text-sm text-gray-600">{fee.name}</span>
                    <span className="font-medium">{fee.value}</span>
                  </div>
                ))}
                {policyDetails.map((policy) => (
                  <div
                    key={policy.address}
                    className="flex justify-between items-center"
                  >
                    <span className="text-sm text-gray-600">{policy.name}</span>
                    <span className="font-medium text-success-600">
                      {policy.value}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">計價資產</span>
                  <span className="font-medium">
                    {denominationAsset.symbol}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">狀態</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      fund.status === "active"
                        ? "bg-success-100 text-success-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {fund.status === "active" ? "活躍" : "暫停"}
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
                  const txHash = await settlePerformanceFee(
                    fund.comptrollerProxy,
                    signer
                  );
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
                  <span className="font-medium">
                    {new Date(fund.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">累計申購</span>
                  <span className="font-medium text-success-600">
                    $
                    {fundInvestmentHistory
                      .filter((r) => r.type === "deposit")
                      .reduce((sum, r) => sum + parseFloat(r.amount), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">累計贖回</span>
                  <span className="font-medium text-danger-600">
                    $
                    {fundInvestmentHistory
                      .filter((r) => r.type === "redeem")
                      .reduce((sum, r) => sum + parseFloat(r.amount), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">投資筆數</span>
                  <span className="font-medium">
                    {fundInvestmentHistory.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">當前狀態</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      fund.status === "active"
                        ? "bg-success-100 text-success-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {fund.status === "active" ? "活躍" : "暫停"}
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
