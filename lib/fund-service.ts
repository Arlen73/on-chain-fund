'use client';

import { ethers } from 'ethers';
import { 
  FUND_FACTORY_ABI, 
  VAULT_PROXY_ABI, 
  COMPTROLLER_ABI, 
  ERC20_ABI,
  FUND_FACTORY_ADDRESS, 
  addressListRegistryABI
} from './contracts';
import type { Fund, CreateFundParams } from '../types/fund';
import { SEPOLIA_MAINNET_RPC } from './constant';

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

    const managementFeeAddress = '0x5c25D5d0C2cad652992bA417f8FA054F8930Ef99';
    const performanceFeeAddress = '0x82EDeB07c051D6461acD30c39b5762D9523CEf1C';
    const entranceRateDirectFeeAddress = '0xA7259E45c7Be47a5bED94EDc252FADB09769a326';

    // 以 Enzyme ManagementFee 合約為例
    const feeRecipient = "0x1cF1fb97E6A4AfaA4167FA19d52AD19D6689C677";

    // 入场费 encodeSettings: abi.encode(uint256 entranceFee, address feeRecipient)
    // 假设 100 代表 1%
    const entranceFee = 100; // 代表 1%
    const entranceFeeSettings = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address'],
      [entranceFee, feeRecipient]
    );


    // 管理费 encodeSettings: abi.encode(uint256 perAnnumRate)
    // 例如 2% = 0.02 * 1e18
    const managementFeeRate = 0.02;
    const perAnnumRate = ethers.parseUnits(managementFeeRate.toString(), 18);
    const managementFeeSettings = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address'],
      [perAnnumRate, feeRecipient]
    );

    // Performance Fee encodeSettings: abi.encode(uint256 rate, address recipient, bool useHighWaterMark)
    const performanceFeeRate = 0.1; // 10%
    const performanceFeeRecipient = feeRecipient;
    const useHighWaterMark = false;
    const performanceFeeSettings = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'bool'],
      [ethers.parseUnits(performanceFeeRate.toString(), 4), performanceFeeRecipient, useHighWaterMark]
    );

    // 組裝 feeManagerConfigData: abi.encode(address[] feeAddresses, bytes[] feeSettings)
    const feeManagerConfigData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'bytes[]'],
      [
        [entranceRateDirectFeeAddress, managementFeeAddress, performanceFeeAddress], 
        [entranceFeeSettings, managementFeeSettings, performanceFeeSettings]
    ]
    );

    // ----------- 白名單策略設定 -----------
    // 以 Enzyme AllowedDepositRecipientsPolicy 合約為例
    const ALLOWED_DEPOSIT_RECIPIENTS_POLICY_ADDRESS = '0x0eD7E38C4535989e392843884326925B4469EB5A'; // 請換成你的
    const whitelist = ["0x984f6F3b1Dba353dc952C7A3a8E340B48A89C947"]; // 這裡填入白名單地址

    const listId = await this.createAddressList(whitelist);
    // encodeSettings: abi.encode(address[] allowedDepositRecipients)
    const policySettings = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256[]', 'bytes[]'],
      [[listId], []]
    );


    // 組裝 policyManagerConfigData: abi.encode(address[] policyAddresses, bytes[] policySettings)
    const policyManagerConfigData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'bytes[]'],
      [[ALLOWED_DEPOSIT_RECIPIENTS_POLICY_ADDRESS], [policySettings]]
    );
    
    const tx = await factory.createNewFund(
      await signer.getAddress(),
      params.fundName,
      params.fundSymbol,
      params.denominationAsset,
      0, // sharesActionTimelock
      feeManagerConfigData,
      "0x"
    );

    const receipt = await tx.wait();

    console.log('Transaction receipt:', receipt);
    // 從事件中獲取 vault 和 comptroller 地址
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = factory.interface.parseLog(log);
        console.log('Parsed log:', parsed);
        return parsed?.name === 'NewFundCreated';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = factory.interface.parseLog(event);
      console.log('Parsed event:', parsed);
      if (parsed && parsed.args) {
        return {
          txHash: receipt.hash,
          vaultProxy: parsed.args.vaultProxy,
          comptrollerProxy: parsed.args.comptrollerProxy
        };
      }
    }

    // 如果無法從事件中獲取，嘗試從交易返回值獲取
    throw new Error('無法獲取基金合約地址');
  }

  async getFundDetails(vaultAddress: string, comptrollerAddress: string): Promise<Partial<Fund>> {
    const vault = new ethers.Contract(vaultAddress, VAULT_PROXY_ABI, this.provider);
    const comptroller = new ethers.Contract(comptrollerAddress, COMPTROLLER_ABI, this.provider);

    const [name, symbol, totalSupply, gav, sharePrice, denominationAsset] = await Promise.all([
      vault.name(),
      vault.symbol(),
      vault.totalSupply(),
      comptroller.calcGav(),
      comptroller.calcGrossShareValue(),
      comptroller.getDenominationAsset()
    ]);

    return {
      name,
      symbol,
      totalShares: ethers.formatEther(totalSupply),
      totalAssets: ethers.formatEther(gav),
      sharePrice: ethers.formatEther(sharePrice),
      denominationAsset,
      vaultProxy: vaultAddress,
      comptrollerProxy: comptrollerAddress
    };
  }

  async getUserBalance(vaultAddress: string, userAddress: string): Promise<string> {
    const vault = new ethers.Contract(vaultAddress, VAULT_PROXY_ABI, this.provider);
    const balance = await vault.balanceOf(userAddress);
    return ethers.formatEther(balance);
  }

  async buyShares(comptrollerAddress: string, amount: string, minShares?: string): Promise<string> {
    const signer = await this.provider.getSigner();
    const comptroller = new ethers.Contract(comptrollerAddress, COMPTROLLER_ABI, signer);

    // 獲取計價資產地址和小數位數
    const denominationAssetAddress = await comptroller.getDenominationAsset();
    const token = new ethers.Contract(denominationAssetAddress, ERC20_ABI, signer);
    const decimals = await token.decimals();

    // 使用正確的小數位數解析金額
    const investmentAmount = ethers.parseUnits(amount, decimals);
    let minSharesAmount: bigint;
    
    // if (minShares && parseFloat(minShares) > 0) {
    //   minSharesAmount = ethers.parseEther(minShares);
    // } else {
    //   // 默認使用投資金額的 95% 作為最小份額 (假設 1:1 比例)
    //   minSharesAmount = investmentAmount * BigInt(95) / BigInt(100);
    // }

    // // 確保最小份額至少為 1 wei
    // if (minSharesAmount === BigInt(0)) {
    //   minSharesAmount = BigInt(1);
    // }

    const approveTx = await token.approve(comptrollerAddress, investmentAmount);
    await approveTx.wait();

    minSharesAmount = BigInt(1);

    console.log('buyShares params:', {
      amount,
      decimals,
      investmentAmount: investmentAmount.toString(),
      minSharesAmount: minSharesAmount.toString()
    });

    const tx = await comptroller.buyShares(investmentAmount, minSharesAmount);

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async redeemShares(comptrollerAddress: string, shareAmount: string): Promise<string> {
    const signer = await this.provider.getSigner();
    const comptroller = new ethers.Contract(comptrollerAddress, COMPTROLLER_ABI, signer);
    const userAddress = await signer.getAddress();

    const tx = await comptroller.redeemSharesInKind(
      userAddress,
      ethers.parseEther(shareAmount),
      [], // assetsToRedeem - empty for all assets
      []  // assetReceivers - empty for sender
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  async approveToken(tokenAddress: string, spenderAddress: string, amount: string): Promise<string> {
    const signer = await this.provider.getSigner();
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    
    // 獲取代幣的小數位數並使用正確的解析方式
    const decimals = await token.decimals();
    const approvalAmount = ethers.parseUnits(amount, decimals);

    console.log('approveToken params:', {
      tokenAddress,
      spenderAddress,
      amount,
      decimals,
      approvalAmount: approvalAmount.toString()
    });

    const tx = await token.approve(spenderAddress, approvalAmount);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getTokenBalance(tokenAddress: string, userAddress: string): Promise<string> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const balance = await token.balanceOf(userAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(balance, decimals);
  }

  async getTokenAllowance(tokenAddress: string, ownerAddress: string, spenderAddress: string): Promise<string> {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const allowance = await token.allowance(ownerAddress, spenderAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(allowance, decimals);
  }

  async createAddressList(addresses: string[]): Promise<string | null> {
    try {
      const signer = await this.provider.getSigner();
      const addressListRegistry = new ethers.Contract(
        "0x6D0b3882dF46A81D42cCce070ce5E46ea26BAcA5",
        [
          "function createList(address creator, uint8 updateType, address[] addresses) external returns (uint256)"
      ],
        signer
      );

      // 准备参数
      const creator = await signer.getAddress(); // 使用当前连接的账户作为 creator
      const updateType = 0; // IAddressListRegistry.UpdateType.None 的值为 0 (假设)

      
      // 调用 createList 函数
      const tx = await addressListRegistry.createList(
        creator,
        updateType,
        addresses,
        { gasLimit: 5000000 }
      );

      // 等待交易完成
      const receipt = await tx.wait();

      const eventAbi = [
        "event ListCreated(address indexed creator, address indexed owner, uint256 id, uint8 updateType)"
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
          console.log('Error parsing log:', error);
        }
      }

      console.log('Address list created successfully!');
      console.log('List ID:', listId?.toString());

      return listId;
    } catch (error) {
      console.error('Error creating address list:', error);
      return null;
    }
  }

  /**
   * 透過 Enzyme IntegrationManager + Uniswap Adapter 進行 swap
   * @param vaultProxyAddress 基金的 VaultProxy 地址
   * @param integrationManagerAddress IntegrationManager 地址
   * @param uniswapAdapterAddress UniswapV2ExchangeAdapter 地址
   * @param fromTokenAddress 賣出 token 地址
   * @param toTokenAddress 買入 token 地址
   * @param fromAmount 賣出數量（字串，單位為 fromToken 的 decimals）
   * @param minToAmount 最少收到數量（字串，單位為 toToken 的 decimals）
   * @returns 交易 hash
   */
  async swapViaUniswap({
    comptrollerAddress,
    integrationManagerAddress,
    uniswapAdapterAddress,
    fromTokenAddress,
    toTokenAddress,
    fromAmount,
    minToAmount,
    fromTokenDecimals = 18,
    toTokenDecimals = 18
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
      // --- 準備 ABI ---
      const uniswapAdapterAbi = [
        "function takeOrder(address,bytes,bytes)"
      ];
      const comptrollerAbi = ["function callOnExtension(address _extension, uint256 _actionId, bytes _callData)"];
      const uniswapAdapterInterface = new ethers.Interface(uniswapAdapterAbi);
      const comptrollerInterface = new ethers.Interface(comptrollerAbi);

      // --- 準備 orderData ---
      const fromAmountParsed = ethers.parseUnits(fromAmount, fromTokenDecimals);
      const minToAmountParsed = ethers.parseEther(minToAmount);
      const path = [fromTokenAddress, toTokenAddress];

      const integrationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address[]', 'uint256', 'uint256'],
        [path, fromAmountParsed, minToAmountParsed]
      );

      // const orderData = ethers.AbiCoder.defaultAbiCoder().encode(
      //   ['uint256', 'uint256', 'address[]'],
      //   [fromAmountParsed, minToAmountParsed, path]
      // );

      // --- 準備 IntegrationManager calldata ---
      // const integrationManagerCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
      //   ['address', 'bytes4', 'bytes'],
      //   [uniswapAdapterAddress, takeOrderSelector, orderData]
      // );

      const takeOrderSelector = uniswapAdapterInterface.getFunction("takeOrder")?.selector;

      
      // --- 準備 ComptrollerLib calldata ---
      const callOnIntegrationActionId = 0;
      const finalCalldata = comptrollerInterface.encodeFunctionData("callOnExtension", [
        integrationManagerAddress,
        callOnIntegrationActionId,
        integrationData
      ]);

      // --- 發送交易 ---
      const tx = await signer.sendTransaction({
        to: comptrollerAddress,
        data: finalCalldata,
        gasLimit: 500000
      });
      await tx.wait();
      return tx.hash;
    } catch (error) {
      console.error('swapViaUniswap error:', error);
    }
    return '';
  }
}

