"use client";

import { useState } from "react";
import { useAccount } from "../lib/web3-context";
import { ethers } from "ethers";
import { DENOMINATION_ASSETS, FUND_FACTORY_ADDRESS } from "../lib/contracts";
import { FundService } from "../lib/fund-service";
import { fundDatabaseService } from "../lib/fund-database-service";

export default function CreateFundForm() {
  const { isConnected, address } = useAccount();
  const [currentStep, setCurrentStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const [creationResult, setCreationResult] = useState<{
    fundName: string;
    fundSymbol: string;
    vaultProxy: string;
    comptrollerProxy: string;
    txHash: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    fundName: "",
    fundSymbol: "",
    denominationAsset: DENOMINATION_ASSETS[0].address, // Use ASVT as default
    managementFee: "2",
    performanceFee: "10",
    enableWhitelist: false,
    whitelist: [],
  });
  // ...原本的 useState 與 formData 之後，直接加在這裡
  const [enableWhitelist, setEnableWhitelist] = useState(false);
  const [whitelistInput, setWhitelistInput] = useState("");

  // 解析輸入（支援逗號、換行、空白分隔）
  const parsedWhitelist = whitelistInput
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 基本地址格式檢查
  const invalidWhitelist = parsedWhitelist.filter((a) => !ethers.isAddress(a));

  const steps = [
    { number: 1, title: "基礎設定", active: currentStep === 1 },
    { number: 2, title: "費用設定", active: currentStep === 2 },
    { number: 3, title: "預覽及確認", active: currentStep === 3 },
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!isConnected || !window.ethereum) {
      alert("請先連接您的錢包");
      return;
    }

    if (!formData.fundName || !formData.fundSymbol) {
      alert("請填寫必要資訊");
      return;
    }

    setIsCreating(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const fundService = new FundService(provider);

      const result = await fundService.createFund({
        fundName: formData.fundName,
        fundSymbol: formData.fundSymbol,
        denominationAsset: formData.denominationAsset,
        managementFee: parseFloat(formData.managementFee),
        performanceFee: parseFloat(formData.performanceFee),
        // === 新增兩個參數 ===
        enableWhitelist,
        whitelist: enableWhitelist ? parsedWhitelist : [],
      });

      // 保存到 mock database (via API)
      const fundRecord = await fundDatabaseService.createFund({
        fundName: formData.fundName,
        fundSymbol: formData.fundSymbol,
        vaultProxy: result.vaultProxy,
        comptrollerProxy: result.comptrollerProxy,
        denominationAsset: formData.denominationAsset,
        managementFee: parseFloat(formData.managementFee),
        performanceFee: parseFloat(formData.performanceFee),
        creator: address!,
        txHash: result.txHash,
      });

      console.log("💾 基金已保存到資料庫:", fundRecord);

      // 保存創建結果
      setCreationResult({
        fundName: formData.fundName,
        fundSymbol: formData.fundSymbol,
        vaultProxy: result.vaultProxy,
        comptrollerProxy: result.comptrollerProxy,
        txHash: result.txHash,
      });

      // 也在控制台打印詳細信息
      console.log("🎉 基金創建成功！", {
        fundName: formData.fundName,
        fundSymbol: formData.fundSymbol,
        vaultProxy: result.vaultProxy,
        comptrollerProxy: result.comptrollerProxy,
        txHash: result.txHash,
      });

      // Reset form
      setFormData({
        fundName: "",
        fundSymbol: "",
        denominationAsset: DENOMINATION_ASSETS[0].address,
        managementFee: "2",
        performanceFee: "10",
        enableWhitelist: false,
        whitelist: [],
      });

      setCurrentStep(1);
    } catch (error: any) {
      console.error("創建基金失敗:", error);
      alert(`創建基金失敗：${error.message || "請檢查網絡連接和錢包狀態"}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartOver = () => {
    setCreationResult(null);
    setFormData({
      fundName: "",
      fundSymbol: "",
      denominationAsset: DENOMINATION_ASSETS[0].address,
      managementFee: "2",
      performanceFee: "10",
      enableWhitelist: false,
      whitelist: [],
    });
    setCurrentStep(1);
  };

  // 如果基金創建成功，顯示成功頁面
  if (creationResult) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-3xl font-bold text-green-600 mb-2">
              基金創建成功！
            </h1>
            <p className="text-gray-600">恭喜！您的基金已成功部署到區塊鏈上</p>
          </div>

          <div className="card mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">基金詳情</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">基金名稱</p>
                <p className="text-lg font-medium">{creationResult.fundName}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">基金代號</p>
                <p className="text-lg font-medium">
                  {creationResult.fundSymbol}
                </p>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-4">
              📋 重要合約地址
            </h3>
            <div className="space-y-4 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                <p className="text-sm text-blue-600 mb-1">
                  Vault Proxy Address
                </p>
                <p className="text-sm font-mono bg-white p-2 rounded border break-all">
                  {creationResult.vaultProxy}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  基金份額代幣合約，用於投資人申購和贖回
                </p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
                <p className="text-sm text-green-600 mb-1">
                  Comptroller Proxy Address
                </p>
                <p className="text-sm font-mono bg-white p-2 rounded border break-all">
                  {creationResult.comptrollerProxy}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  基金管理合約，用於投資決策和資產管理
                </p>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-4">
              🔗 交易信息
            </h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">交易哈希</p>
              <p className="text-sm font-mono break-all">
                {creationResult.txHash}
              </p>
              <a
                href={`https://sepolia.etherscan.io/tx/${creationResult.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-flex items-center"
              >
                在 Etherscan 上查看 ↗
              </a>
            </div>

            <div className="bg-amber-50 p-4 rounded-lg mt-6">
              <div className="flex">
                <div className="text-amber-400 mr-3">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-amber-800 font-medium mb-1">
                    請務必保存合約地址
                  </h4>
                  <p className="text-amber-700 text-sm">
                    這些地址是管理和操作基金的唯一憑證，請妥善保存！
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleStartOver}
              className="px-8 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 font-medium"
            >
              創建另一個基金
            </button>
            <a
              href="/manager"
              className="px-8 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium inline-block"
            >
              前往管理儀表板
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            需要連接錢包
          </h2>
          <p className="text-gray-600 mb-6">請先連接您的錢包以創建基金</p>
          <div className="text-4xl mb-4">🔗</div>
        </div>
      </div>
    );
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">基礎設定</h2>
            <p className="text-gray-600">
              為您的基金設定基本資料。這些是投資人第一眼會看到的資訊。
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                基金名稱 (Name) <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                value={formData.fundName}
                onChange={(e) => handleInputChange("fundName", e.target.value)}
                placeholder="例如：穩健增長一號"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
              <p className="text-sm text-gray-500 mt-1">基金的顯示名稱。</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                基金代號 (Symbol) <span className="text-danger-500">*</span>
              </label>
              <input
                type="text"
                value={formData.fundSymbol}
                onChange={(e) =>
                  handleInputChange("fundSymbol", e.target.value.toUpperCase())
                }
                placeholder="例如：SGF01"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
                maxLength={10}
              />
              <p className="text-sm text-gray-500 mt-1">
                基金份額代幣的代號，建議 3-5 個英文字母。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                計價資產 (Denomination Asset)
              </label>
              <select
                value={formData.denominationAsset}
                onChange={(e) =>
                  handleInputChange("denominationAsset", e.target.value)
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {DENOMINATION_ASSETS.map((asset) => (
                  <option key={asset.symbol} value={asset.address}>
                    {asset.icon} {asset.symbol} - {asset.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-orange-600 mt-1">
                用於衡量基金淨值和績效的基礎資產。此為永久性設定。
              </p>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">費用設定</h2>
            <p className="text-gray-600">
              設定基金管理費和績效費。費用將自動從基金資產中扣除。
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                管理費 (年化%)
              </label>
              <input
                type="number"
                value={formData.managementFee}
                onChange={(e) =>
                  handleInputChange("managementFee", e.target.value)
                }
                placeholder="2"
                min="0"
                max="10"
                step="0.1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                年管理費率，通常在0-5%之間。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                績效費 (%)
              </label>
              <input
                type="number"
                value={formData.performanceFee}
                onChange={(e) =>
                  handleInputChange("performanceFee", e.target.value)
                }
                placeholder="10"
                min="0"
                max="30"
                step="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                當基金績效超過基準時收取的費用，通常在10-20%之間。
              </p>
            </div>

            {/* --- 白名單設定：新增區塊（放在績效費輸入框之後） --- */}
            <div className="mt-6 border-t pt-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableWhitelist}
                  onChange={(e) => setEnableWhitelist(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-gray-700">
                  啟用白名單存款策略
                </span>
              </label>

              {enableWhitelist && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    白名單地址（可貼多個，逗號或換行分隔）
                  </label>
                  <textarea
                    value={whitelistInput}
                    onChange={(e) => setWhitelistInput(e.target.value)}
                    rows={5}
                    placeholder={`0xabc..., 0xdef...\n或一行一個地址`}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  />
                  {invalidWhitelist.length > 0 ? (
                    <p className="text-sm text-danger-600 mt-2">
                      以下地址格式不正確：{invalidWhitelist.join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 mt-2">
                      目前共 {parsedWhitelist.length} 個地址。
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 3:
        const selectedAsset = DENOMINATION_ASSETS.find(
          (asset) => asset.address === formData.denominationAsset
        );
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">預覽及確認</h2>
            <p className="text-gray-600">
              請確認您的基金設定，一旦創建就無法修改某些設定。
            </p>

            <div className="bg-gray-50 p-6 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">基金名稱</p>
                  <p className="font-medium">{formData.fundName || "未設定"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">基金代號</p>
                  <p className="font-medium">
                    {formData.fundSymbol || "未設定"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">計價資產</p>
                  <p className="font-medium">
                    {selectedAsset?.symbol} - {selectedAsset?.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">管理費 (年化)</p>
                  <p className="font-medium">{formData.managementFee}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">績效費</p>
                  <p className="font-medium">{formData.performanceFee}%</p>
                </div>
              </div>
            </div>
            {/* --- 白名單設定：新增區塊（放在績效費輸入框之後） --- */}
            <div className="mt-6 border-t pt-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableWhitelist}
                  onChange={(e) => setEnableWhitelist(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-gray-700">
                  啟用白名單存款策略
                </span>
              </label>

              {enableWhitelist && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    白名單地址（可貼多個，逗號或換行分隔）
                  </label>
                  <textarea
                    value={whitelistInput}
                    onChange={(e) => setWhitelistInput(e.target.value)}
                    rows={5}
                    placeholder={`0xabc..., 0xdef...\n或一行一個地址`}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                  />
                  {invalidWhitelist.length > 0 ? (
                    <p className="text-sm text-danger-600 mt-2">
                      以下地址格式不正確：{invalidWhitelist.join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 mt-2">
                      目前共 {parsedWhitelist.length} 個地址。
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex">
                <div className="text-blue-400 mr-3">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <h4 className="text-blue-800 font-medium mb-1">重要提醒</h4>
                  <p className="text-blue-700 text-sm">
                    基金創建後，計價資產和某些參數將無法修改。請確認所有設定正確無誤。
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
              步驟 {currentStep}
            </h2>
            <p className="text-gray-600">此步驟的設定內容開發中...</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">創建您的基金</h1>
        </div>

        {/* 步驟指示器 */}
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="flex flex-col items-center relative"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                    step.active
                      ? "bg-success-500 text-white"
                      : currentStep > step.number
                      ? "bg-success-200 text-success-700"
                      : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {currentStep > step.number ? (
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <p
                  className={`text-xs mt-2 text-center max-w-20 ${
                    step.active ? "text-success-600" : "text-gray-500"
                  }`}
                >
                  {step.title}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* 表單內容 */}
        <div className="card mb-8">{renderStepContent()}</div>

        {/* 導航按鈕 */}
        <div className="flex justify-between">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="px-6 py-3 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一步
          </button>

          {currentStep === 3 ? (
            <button
              onClick={handleSubmit}
              disabled={
                isCreating ||
                !formData.fundName ||
                !formData.fundSymbol ||
                (enableWhitelist &&
                  (parsedWhitelist.length === 0 || invalidWhitelist.length > 0))
              }
              className="px-8 py-3 bg-success-500 text-white rounded-lg hover:bg-success-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isCreating && <div className="loading-spinner mr-2"></div>}
              {isCreating ? "創建中..." : "創建基金"}
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={
                (currentStep === 1 &&
                  (!formData.fundName || !formData.fundSymbol)) ||
                (currentStep === 2 &&
                  enableWhitelist &&
                  (parsedWhitelist.length === 0 || invalidWhitelist.length > 0))
              }
              className="px-6 py-3 bg-success-500 text-white rounded-lg hover:bg-success-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
