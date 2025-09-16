"use client";

import { ethers } from "ethers";
import {
  FUND_FACTORY_ABI,
  VAULT_PROXY_ABI,
  COMPTROLLER_ABI,
  ERC20_ABI,
  FUND_FACTORY_ADDRESS,
  ADDRESS_LIST_REGISTRY,
  ALLOWED_DEPOSIT_RECIPIENTS_POLICY,
  ENTRANCE_RATE_DIRECT_FEE,
} from "./contracts";

import type { Fund, CreateFundParams } from "../types/fund";
import { SEPOLIA_MAINNET_RPC } from "./constant";

export class FundService {
  private provider: ethers.BrowserProvider;

  constructor(provider: ethers.BrowserProvider) {
    this.provider = provider;
  }

  async createFund(params: CreateFundParams): Promise<{
    txHash: string;
    vaultProxy: string;
    comptrollerProxy: string;
  }> {
    const signer = await this.provider.getSigner();
    const factory = new ethers.Contract(FUND_FACTORY_ADDRESS, FUND_FACTORY_ABI, signer);
    const coder = ethers.AbiCoder.defaultAbiCoder();

    // 1) baseline：空費用、空策略（先驗證通道）
    let feeManagerConfigData = coder.encode(["address[]", "bytes[]"], [[], []]);
    let policyManagerConfigData = coder.encode(["address[]", "bytes[]"], [[], []]);

    await factory.createNewFund.estimateGas(
      await signer.getAddress(),
      params.fundName,
      params.fundSymbol,
      params.denominationAsset,
      0,
      feeManagerConfigData,
      policyManagerConfigData
    );

    // 2) Entrance Fee（申購費）：讀取前端傳入的 bps/recipient
    //    - entranceFeeBps: number（例 1% = 100）；>0 才加入模組
    //    - entranceFeeRecipient: address（可空；空則預設為 signer 地址）
    {
      const feeAddresses: string[] = [];
      const feeSettingsArr: string[] = [];

      const entranceBpsNum =
        typeof (params as any).entranceFeeBps === "number" ? (params as any).entranceFeeBps : 0;

      if (entranceBpsNum > 0) {
        const bps = BigInt(entranceBpsNum);
        const recipientParam = (params as any).entranceFeeRecipient as string | undefined;
        const recipient = recipientParam && ethers.isAddress(recipientParam)
          ? recipientParam
          : await signer.getAddress();

        // Enzyme EntranceRateDirectFee settings: abi.encode(uint256 bps, address recipient)
        const entranceFeeSettings = coder.encode(["uint256", "address"], [bps, recipient]);

        feeAddresses.push(ENTRANCE_RATE_DIRECT_FEE);
        feeSettingsArr.push(entranceFeeSettings);

        const nextFeeConfig = coder.encode(["address[]", "bytes[]"], [feeAddresses, feeSettingsArr]);

        // 先估氣確保該模組與 factory 同一 release，且設定可被接受
        try {
          await factory.createNewFund.estimateGas(
            await signer.getAddress(),
            params.fundName,
            params.fundSymbol,
            params.denominationAsset,
            0,
            nextFeeConfig,
            policyManagerConfigData
          );
          feeManagerConfigData = nextFeeConfig;
        } catch (e) {
          console.error("[EntranceFee] estimateGas failed", e);
          throw new Error(
            "EntranceFee 估算失敗：請確認 ENTRANCE_RATE_DIRECT_FEE 與 FUND_FACTORY_ADDRESS 為同一個 Enzyme release，" +
            "且 denominationAsset 為該 release 支援資產，另外檢查 bps/recipient 設定是否正確。"
          );
        }
      }
    }

    // 3) 白名單策略（可選）
    if (params.enableWhitelist && params.whitelist && params.whitelist.length > 0) {
      const listId = await this.createAddressList(params.whitelist);
      const policySettings = coder.encode(["uint256[]", "bytes[]"], [[listId], []]);

      const nextPolicyConfig = coder.encode(
        ["address[]", "bytes[]"],
        [[ALLOWED_DEPOSIT_RECIPIENTS_POLICY], [policySettings]]
      );

      try {
        await factory.createNewFund.estimateGas(
          await signer.getAddress(),
          params.fundName,
          params.fundSymbol,
          params.denominationAsset,
          0,
          feeManagerConfigData,
          nextPolicyConfig
        );
        policyManagerConfigData = nextPolicyConfig;
      } catch (e) {
        console.error("[WhitelistPolicy] estimateGas failed:", e);
        throw new Error(
          "白名單策略 估算失敗：請確認 ALLOWED_DEPOSIT_RECIPIENTS_POLICY 與 AddressListRegistry 為同一 release，並與 FUND_FACTORY_ADDRESS 一致。"
        );
      }
    }

    // 4) 送出正式交易（+20% gas buffer）
    const gas = await factory.createNewFund.estimateGas(
      await signer.getAddress(),
      params.fundName,
      params.fundSymbol,
      params.denominationAsset,
      0,
      feeManagerConfigData,
      policyManagerConfigData
    );

    const tx = await factory.createNewFund(
      await signer.getAddress(),
      params.fundName,
      params.fundSymbol,
      params.denominationAsset,
      0,
      feeManagerConfigData,
      policyManagerConfigData,
      { gasLimit: (gas * BigInt(12)) / BigInt(10) }
    );

    const receipt = await tx.wait();

    // 解析事件
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed?.name === "NewFundCreated";
      } catch { return false; }
    });

    if (event) {
      const parsed = factory.interface.parseLog(event);
      if (parsed && parsed.args) {
        return {
          txHash: receipt.hash,
          vaultProxy: parsed.args.vaultProxy,
          comptrollerProxy: parsed.args.comptrollerProxy,
        };
      }
    }
    throw new Error("無法獲取基金合約地址");
  }

  async getFundDetails(
    vaultAddress: string,
    comptrollerAddress: string
  ): Promise<Partial<Fund>> {
    const vault = new ethers.Contract(
      vaultAddress,
      VAULT_PROXY_ABI,
      this.provider
    );
    const comptroller = new ethers.Contract(
      comptrollerAddress,
      COMPTROLLER_ABI,
      this.provider
    );

    const [name, symbol, totalSupply, gav, sharePrice, denominationAsset] =
      await Promise.all([
        vault.name(),
        vault.symbol(),
        vault.totalSupply(),
        comptroller.calcGav(),
        comptroller.calcGrossShareValue(),
        comptroller.getDenominationAsset(),
      ]);

    return {
      name,
      symbol,
      totalShares: ethers.formatEther(totalSupply),
      totalAssets: ethers.formatEther(gav),
      sharePrice: ethers.formatEther(sharePrice),
      denominationAsset,
      vaultProxy: vaultAddress,
      comptrollerProxy: comptrollerAddress,
    };
  }

  async getUserBalance(
    vaultAddress: string,
    userAddress: string
  ): Promise<string> {
    const vault = new ethers.Contract(
      vaultAddress,
      VAULT_PROXY_ABI,
      this.provider
    );
    const balance = await vault.balanceOf(userAddress);
    return ethers.formatEther(balance);
  }

  async buyShares(
    comptrollerAddress: string,
    amount: string,
    minShares?: string
  ): Promise<string> {
    const signer = await this.provider.getSigner();
    const comptroller = new ethers.Contract(
      comptrollerAddress,
      COMPTROLLER_ABI,
      signer
    );

    // 獲取計價資產地址和小數位數
    const denominationAssetAddress = await comptroller.getDenominationAsset();
    const token = new ethers.Contract(
      denominationAssetAddress,
      ERC20_ABI,
      signer
    );
    const decimals = await token.decimals();

    // 使用正確的小數位數解析金額
    const investmentAmount = ethers.parseUnits(amount, decimals);

    const approveTx = await token.approve(comptrollerAddress, investmentAmount);
    await approveTx.wait();

    const minSharesAmount = BigInt(1);

    console.log("buyShares params:", {
      amount,
      decimals,
      investmentAmount: investmentAmount.toString(),
      minSharesAmount: minSharesAmount.toString(),
    });

    const tx = await comptroller.buyShares(investmentAmount, minSharesAmount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async redeemShares(
    comptrollerAddress: string,
    shareAmount: string
  ): Promise<string> {
    const signer = await this.provider.getSigner();
    const comptroller = new ethers.Contract(
      comptrollerAddress,
      COMPTROLLER_ABI,
      signer
    );
    const userAddress = await signer.getAddress();

    const tx = await comptroller.redeemSharesInKind(
      userAddress,
      ethers.parseEther(shareAmount),
      [], // assetsToRedeem - empty for all assets
      [] // assetReceivers - empty for sender
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async approveToken(
    tokenAddress: string,
    spenderAddress: string,
    amount: string
  ): Promise<string> {
    const signer = await this.provider.getSigner();
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

    // 獲取代幣的小數位數並使用正確的解析方式
    const decimals = await token.decimals();
    const approvalAmount = ethers.parseUnits(amount, decimals);

    console.log("approveToken params:", {
      tokenAddress,
      spenderAddress,
      amount,
      decimals,
      approvalAmount: approvalAmount.toString(),
    });

    const tx = await token.approve(spenderAddress, approvalAmount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getTokenBalance(
    tokenAddress: string,
    userAddress: string
  ): Promise<string> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const balance = await token.balanceOf(userAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(balance, decimals);
  }

  async getTokenAllowance(
    tokenAddress: string,
    ownerAddress: string,
    spenderAddress: string
  ): Promise<string> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const allowance = await token.allowance(ownerAddress, spenderAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(allowance, decimals);
  }

  async createAddressList(addresses: string[]): Promise<string | null> {
    try {
      const signer = await this.provider.getSigner();
      const addressListRegistry = new ethers.Contract(
        ADDRESS_LIST_REGISTRY,
        [
          "function createList(address creator, uint8 updateType, address[] addresses) external returns (uint256)",
        ],
        signer
      );

      const creator = await signer.getAddress();
      const updateType = 0; // IAddressListRegistry.UpdateType.None = 0（若需後續管理白名單，應改為可更新的型別）

      const tx = await addressListRegistry.createList(
        creator,
        updateType,
        addresses,
        { gasLimit: 5000000 }
      );

      const receipt = await tx.wait();

      const eventAbi = [
        "event ListCreated(address indexed creator, address indexed owner, uint256 id, uint8 updateType)",
      ];
      const iface = new ethers.Interface(eventAbi);

      let listId: string | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "ListCreated") {
            listId = parsed.args.id.toString();
            break;
          }
        } catch (error) {
          console.log("Error parsing log:", error);
        }
      }

      console.log("Address list created successfully!");
      console.log("List ID:", listId?.toString());

      return listId;
    } catch (error) {
      console.error("Error creating address list:", error);
      return null;
    }
  }

  // === swapViaUniswap（原樣保留） ===
  async swapViaUniswap({
    comptrollerAddress,
    integrationManagerAddress,
    uniswapAdapterAddress,
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    minToAmount,
    fromTokenDecimals = 18,
    toTokenDecimals = 18,
  }: {
    comptrollerAddress: string;
    integrationManagerAddress: string;
    uniswapAdapterAddress: string;
    fromTokenAddress: string;
    toTokenAddress: string;
    fromAmount: string;
    minToAmount: string;
    fromTokenDecimals?: number;
    toTokenDecimals?: number;
  }): Promise<string> {
    try {
      const signer = await this.provider.getSigner();
      const uniswapAdapterAbi = ["function takeOrder(address,bytes,bytes)"];
      const comptrollerAbi = [
        "function callOnExtension(address _extension, uint256 _actionId, bytes _callData)",
      ];
      const uniswapAdapterInterface = new ethers.Interface(uniswapAdapterAbi);
      const comptrollerInterface = new ethers.Interface(comptrollerAbi);

      const fromAmountParsed = ethers.parseUnits(fromAmount, fromTokenDecimals);
      const minToAmountParsed = ethers.parseEther(minToAmount);
      const path = [fromTokenAddress, toTokenAddress];

      const integrationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256", "uint256"],
        [path, fromAmountParsed, minToAmountParsed]
      );

      const callOnIntegrationActionId = 0;
      const finalCalldata = comptrollerInterface.encodeFunctionData(
        "callOnExtension",
        [integrationManagerAddress, callOnIntegrationActionId, integrationData]
      );

      const tx = await signer.sendTransaction({
        to: comptrollerAddress,
        data: finalCalldata,
        gasLimit: 500000,
      });
      await tx.wait();
      return tx.hash;
    } catch (error) {
      console.error("swapViaUniswap error:", error);
    }
    return "";
  }
}
