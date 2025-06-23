"use client";

import { useState, useEffect } from "react";
import { audioSystem } from "@/lib/audio";

// Shock & Dip Detection (Market Recovery)
interface DipItem {
  id: number;
  name: string;
  currentPrice: number;
  avgPrice24h: number;
  priceDropPercent: number;
  volumeSpike: number;
  buyLimit: number;
  recoveryPotential: number;
  members: boolean;
  buyRange: string;
  sellRange: string;
  estimatedProfit: number;
}

// Price Floor Analysis (Alchemy Arbitrage)
interface AlchemyItem {
  id: number;
  name: string;
  currentPrice: number;
  priceFloor: number;
  alchValue: number;
  profitMargin: number;
  roi: number;
  buyLimit: number;
  members: boolean;
}

// Volume Analysis Data - Removed (using database data only)

// Volatility Breakout Analysis
interface VolatilityItem {
  id: number;
  name: string;
  currentPrice: number;
  buyLimit: number;
  compressionRatio: number;
  breakoutDirection: string;
  volumeConfirmation: string;
  potentialBreakoutProfit: number;
  compressionLevel: string;
}

// Volume Profile Analysis
interface VolumeProfileItem {
  id: number;
  name: string;
  currentPrice: number;
  buyLimit: number;
  volumePattern: string;
  volumeSurge: string;
  smartMoneySignal: string;
  accumulationProfit: number;
}

// Multi-Timeframe Confluence
interface ConfluenceItem {
  id: number;
  name: string;
  currentPrice: number;
  buyLimit: number;
  bullishConfluence: number;
  bearishConfluence: number;
  signalStrength: string;
  volumeConfirmation: string;
  potentialProfit: number;
}

// Recipe Arbitrage
interface RecipeArbitrageItem {
  id: number;
  productName: string;
  productPrice: number;
  productBuyLimit: number;
  ingredient1Name: string;
  totalIngredientCost: number;
  profitPerCraft: number;
  roi: number;
  recipeType: string;
  liquidityLevel: string;
}

interface ComprehensiveAnalytics {
  dips: DipItem[];
  alchemy: AlchemyItem[];
  volatility: VolatilityItem[];
  volumeProfile: VolumeProfileItem[];
  confluence: ConfluenceItem[];
  recipeArbitrage: RecipeArbitrageItem[];
  timestamp: number;
  cached: boolean;
}

type AnalyticsTab =
  | "dips"
  | "alchemy"
  | "volatility"
  | "volumeProfile"
  | "confluence"
  | "recipeArbitrage";

// Helper function for formatting in OSRS style with decimal precision
function formatGP(amount: number) {
  if (!amount || isNaN(amount)) return "0";
  if (amount >= 1000000000) {
    return `${(amount / 1000000000).toFixed(3)}b`;
  } else if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(3)}m`;
  } else if (amount >= 100000) {
    return `${(amount / 1000).toFixed(2)}k`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(3)}k`;
  }
  // Show decimal places for values under 1000 GP for accurate trading
  return amount.toFixed(3);
}

// Data transformation functions for API responses

interface RawDipData {
  id?: number;
  name?: string;
  currentPrice?: number;
  currentLow?: number;
  avgPrice24h?: number;
  avg24hLow?: number;
  priceDropPercent?: number;
  dipMagnitudePercent?: number;
  volumeSurge?: number;
  buyLimit?: number;
  recoveryPotential?: number;
  potentialProfit?: number;
  members?: boolean;
  estimatedProfit?: number;
  maxProfit4h?: number;
}

function transformDipsDataFromAPI(data: RawDipData[]): DipItem[] {
  return data.slice(0, 50).map((item) => {
    const currentLow = item.currentPrice || item.currentLow || 0;
    const avgLow = item.avgPrice24h || item.avg24hLow || 0;

    return {
      id: item.id || 0,
      name: item.name || "Unknown Item",
      currentPrice: currentLow,
      avgPrice24h: avgLow,
      priceDropPercent: item.priceDropPercent || item.dipMagnitudePercent || 0,
      volumeSpike: item.volumeSurge || 1,
      buyLimit: item.buyLimit || 0,
      recoveryPotential: item.recoveryPotential || item.potentialProfit || 0,
      members: item.members || false,
      buyRange: `${formatGP(currentLow * 0.98)} - ${formatGP(
        currentLow * 1.02
      )}`,
      sellRange: `${formatGP(avgLow * 0.98)} - ${formatGP(avgLow * 1.02)}`,
      estimatedProfit: item.estimatedProfit || item.maxProfit4h || 0,
    };
  });
}

interface RawAlchemyData {
  id?: number;
  name?: string;
  currentLow?: number;
  priceFloor?: number;
  alchPrice?: number;
  potentialProfit?: number;
  roi?: number;
  buyLimit?: number;
  members?: boolean;
}

function transformAlchemyDataFromAPI(data: RawAlchemyData[]): AlchemyItem[] {
  return data.slice(0, 50).map((item) => ({
    id: item.id || 0,
    name: item.name || "Unknown Item",
    currentPrice: item.currentLow || 0,
    priceFloor: item.priceFloor || 0,
    alchValue: item.alchPrice || 0,
    profitMargin: item.potentialProfit || 0,
    roi: item.roi || 0,
    buyLimit: item.buyLimit || 0,
    members: item.members || false,
  }));
}

// Transform functions for new analysis types
interface RawVolatilityData {
  id?: number;
  name?: string;
  currentPrice?: number;
  buyLimit?: number;
  compressionRatio?: number;
  breakoutDirection?: string;
  volumeConfirmation?: string;
  potentialBreakoutProfit?: number;
  compressionLevel?: string;
}

function transformVolatilityDataFromAPI(
  data: RawVolatilityData[]
): VolatilityItem[] {
  return data.slice(0, 50).map((item, index) => ({
    id: item.id || index + 1,
    name: item.name || "Unknown Item",
    currentPrice: item.currentPrice || 0,
    buyLimit: item.buyLimit || 0,
    compressionRatio: item.compressionRatio || 0,
    breakoutDirection: item.breakoutDirection || "NEUTRAL",
    volumeConfirmation: item.volumeConfirmation || "LOW_VOLUME",
    potentialBreakoutProfit: item.potentialBreakoutProfit || 0,
    compressionLevel: item.compressionLevel || "LOW_COMPRESSION",
  }));
}

interface RawVolumeProfileData {
  id?: number;
  name?: string;
  currentPrice?: number;
  buyLimit?: number;
  volumePattern?: string;
  volumeSurge?: string;
  smartMoneySignal?: string;
  accumulationProfit?: number;
}

function transformVolumeProfileDataFromAPI(
  data: RawVolumeProfileData[]
): VolumeProfileItem[] {
  return data.slice(0, 50).map((item, index) => ({
    id: item.id || index + 1,
    name: item.name || "Unknown Item",
    currentPrice: item.currentPrice || 0,
    buyLimit: item.buyLimit || 0,
    volumePattern: item.volumePattern || "BALANCED",
    volumeSurge: item.volumeSurge || "NORMAL_VOLUME",
    smartMoneySignal: item.smartMoneySignal || "NO_SMART_MONEY_SIGNAL",
    accumulationProfit: item.accumulationProfit || 0,
  }));
}

interface RawConfluenceData {
  id?: number;
  name?: string;
  currentPrice?: number;
  buyLimit?: number;
  bullishConfluence?: number;
  bearishConfluence?: number;
  signalStrength?: string;
  volumeConfirmation?: string;
  potentialProfit?: number;
}

function transformConfluenceDataFromAPI(
  data: RawConfluenceData[]
): ConfluenceItem[] {
  return data.slice(0, 50).map((item, index) => ({
    id: item.id || index + 1,
    name: item.name || "Unknown Item",
    currentPrice: item.currentPrice || 0,
    buyLimit: item.buyLimit || 0,
    bullishConfluence: item.bullishConfluence || 0,
    bearishConfluence: item.bearishConfluence || 0,
    signalStrength: item.signalStrength || "MIXED_SIGNALS",
    volumeConfirmation: item.volumeConfirmation || "WEAK_VOLUME",
    potentialProfit: item.potentialProfit || 0,
  }));
}

interface RawRecipeArbitrageData {
  id?: number;
  productName?: string;
  productPrice?: number;
  productBuyLimit?: number;
  ingredient1Name?: string;
  totalIngredientCost?: number;
  profitPerCraft?: number;
  roi?: number;
  recipeType?: string;
  liquidityLevel?: string;
}

function transformRecipeArbitrageDataFromAPI(
  data: RawRecipeArbitrageData[]
): RecipeArbitrageItem[] {
  return data.slice(0, 50).map((item, index) => ({
    id: item.id || index + 1,
    productName: item.productName || "Unknown Product",
    productPrice: item.productPrice || 0,
    productBuyLimit: item.productBuyLimit || 0,
    ingredient1Name: item.ingredient1Name || "",
    totalIngredientCost: item.totalIngredientCost || 0,
    profitPerCraft: item.profitPerCraft || 0,
    roi: item.roi || 0,
    recipeType: item.recipeType || "",
    liquidityLevel: item.liquidityLevel || "LOW_LIQUIDITY",
  }));
}

// transformVolumeData function removed - using database data only

// Local strategy processing functions removed - using API data only

export default function AnalyticsPage() {
  const [data, setData] = useState<ComprehensiveAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [dataUpdated, setDataUpdated] = useState<Date | null>(null);
  const [, setCached] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("dips");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(audioSystem.isEnabled());

  const fetchData = async (isInstantRefresh = false) => {
    try {
      if (isInstantRefresh) {
        setIsRefreshing(true);
        // Brief animation delay to show the refresh
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        setLoading(true);
      }

      // Use lightweight APIs for all strategies (no more heavy database processing!)
      console.log("Fetching analytics data from lightweight APIs...");

      // Use lightweight APIs for all strategies (no more heavy database processing!)
      const timestamp = isInstantRefresh ? `?t=${Date.now()}` : "";
      const fetchOptions = isInstantRefresh
        ? { headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } }
        : {};

      const [
        dipsResponse,
        alchemyResponse,
        volatilityResponse,
        volumeProfileResponse,
        confluenceResponse,
        recipeArbitrageResponse,
      ] = await Promise.all([
        fetch(`/api/osrs/dip-detection${timestamp}`, fetchOptions),
        fetch(`/api/osrs/alchemy-floors${timestamp}`, fetchOptions),
        fetch(`/api/osrs/volatility-breakout${timestamp}`, fetchOptions),
        fetch(`/api/osrs/volume-profile${timestamp}`, fetchOptions),
        fetch(`/api/osrs/confluence${timestamp}`, fetchOptions),
        fetch(`/api/osrs/recipe-arbitrage${timestamp}`, fetchOptions),
      ]);

      const dipsResult = await dipsResponse.json();
      const alchemyResult = await alchemyResponse.json();
      const volatilityResult = await volatilityResponse.json();
      const volumeProfileResult = await volumeProfileResponse.json();
      const confluenceResult = await confluenceResponse.json();
      const recipeArbitrageResult = await recipeArbitrageResponse.json();

      const dipsData = dipsResult.success ? dipsResult.data : [];
      const alchemyData = alchemyResult.success ? alchemyResult.data : [];
      const volatilityData = volatilityResult.success
        ? volatilityResult.data
        : [];
      const volumeProfileData = volumeProfileResult.success
        ? volumeProfileResult.data
        : [];
      const confluenceData = confluenceResult.success
        ? confluenceResult.data
        : [];
      const recipeArbitrageData = recipeArbitrageResult.success
        ? recipeArbitrageResult.data
        : [];

      // Use the earliest data timestamp from all APIs
      const dataTimestamps = [
        dipsResult.dataUpdated,
        alchemyResult.dataUpdated,
        volatilityResult.dataUpdated,
        volumeProfileResult.dataUpdated,
        confluenceResult.dataUpdated,
        recipeArbitrageResult.dataUpdated,
      ].filter(Boolean);

      const latestDataUpdate =
        dataTimestamps.length > 0
          ? new Date(
              Math.max(...dataTimestamps.map((ts) => new Date(ts).getTime()))
            )
          : null;

      // Transform data to match existing interface (all from lightweight APIs)
      const transformedData: ComprehensiveAnalytics = {
        dips: transformDipsDataFromAPI(dipsData),
        alchemy: transformAlchemyDataFromAPI(alchemyData),
        volatility: transformVolatilityDataFromAPI(volatilityData),
        volumeProfile: transformVolumeProfileDataFromAPI(volumeProfileData),
        confluence: transformConfluenceDataFromAPI(confluenceData),
        recipeArbitrage:
          transformRecipeArbitrageDataFromAPI(recipeArbitrageData),
        timestamp: Date.now(),
        cached: false,
      };

      setData(transformedData);
      const newTimestamp = new Date();
      setLastUpdate(newTimestamp); // Always use current time for "last fetched"
      // Force re-render by creating new Date object
      setDataUpdated(latestDataUpdate ? new Date(latestDataUpdate) : null);
      setCached(transformedData.cached);
      setError(null);

      // Play soft notification sound for data refresh
      if (isInstantRefresh) {
        audioSystem.playDataRefreshSound();
      }

      console.log("Analytics data processed successfully from database!");
      console.log(
        "🕐 Updated timestamp to:",
        newTimestamp.toLocaleTimeString()
      );
      console.log("🔄 Is instant refresh:", isInstantRefresh);
      console.log("📅 Data timestamp from JSON:", latestDataUpdate);
      console.log(
        "📅 Data timestamp formatted:",
        latestDataUpdate ? new Date(latestDataUpdate).toLocaleString() : "null"
      );
    } catch (error) {
      console.error("Analytics fetch error:", error);
      setError("Database connection error occurred");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set up instant notifications via Server-Sent Events
    console.log("🔗 Connecting to ntfy.sh for instant notifications...");
    const eventSource = new EventSource(
      "https://ntfy.sh/osrs-ge-lotus-updates/sse"
    );

    eventSource.onopen = () => {
      console.log("✅ SSE connection established to ntfy.sh");
    };

    eventSource.onmessage = (event) => {
      console.log("📨 SSE message received:", event.data);
      try {
        const data = JSON.parse(event.data);
        if (data.message === "refresh") {
          console.log("🔔 Instant data update notification received!");
          fetchData(true); // Instant refresh with animation
        }
      } catch {
        // Handle non-JSON messages
        if (event.data === "refresh") {
          console.log("🔔 Instant data update notification received!");
          fetchData(true); // Instant refresh with animation
        }
      }
    };

    eventSource.onerror = (error) => {
      console.log("❌ SSE connection error (will retry automatically):", error);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const getTabTitle = (tab: AnalyticsTab) => {
    switch (tab) {
      case "dips":
        return "Market Dips";
      case "alchemy":
        return "Alchemy Floors";
      case "volatility":
        return "Volatility Breakouts";
      case "volumeProfile":
        return "Volume Profile";
      case "confluence":
        return "Multi-Timeframe";
      case "recipeArbitrage":
        return "Recipe Arbitrage";
    }
  };

  // const getTabDescription = (tab: AnalyticsTab) => {
  //   switch (tab) {
  //     case "flipping":
  //       return "Basic flipping opportunities with instant buy/sell spreads";
  //     case "dips":
  //       return "HIGH PRIORITY: Shock-induced dips for recovery trading";
  //     case "alchemy":
  //       return "Limited alchemy arbitrage opportunities (very few available)";
  //     case "processing":
  //       return "HIGH PRIORITY: Manufacturing arbitrage with highest profit potential";
  //   }
  // };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xl font-semibold font-serif">
            Analyzing local database data...
          </p>
          <p className="text-sm font-serif text-gray-600 mt-2">
            Processing your collected OSRS market data
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center border-4 border-red-600 p-8">
          <p className="text-xl font-bold text-red-600 font-serif mb-4">
            Error
          </p>
          <p className="text-lg font-serif">{error}</p>
          <button
            onClick={() => fetchData()}
            className="mt-4 border-4 border-black bg-black text-white px-6 py-2 font-bold text-lg font-serif hover:bg-white hover:text-black transition-colors duration-200"
          >
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-xl font-semibold font-serif">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-white min-h-screen mt-4 px-2">
      {/* Streamlined Header */}
      <div className="flex flex-col md:items-start gap-2">
        {lastUpdate && (
          <div className="text-base md:text-lg font-serif text-gray-300">
            <p
              className={`transition-all duration-300 ${
                isRefreshing ? "text-green-400 scale-105" : ""
              }`}
            >
              Updated: {lastUpdate.toLocaleTimeString()}
            </p>
            {dataUpdated && (
              <p
                className={`text-sm md:text-base transition-all duration-300 ${
                  isRefreshing ? "text-green-400" : ""
                }`}
              >
                Data: {dataUpdated.toLocaleString()}
              </p>
            )}
            <div className="flex items-center gap-2">
              <p className="text-xs md:text-sm text-blue-400">
                Instant webhook updates
              </p>
              {/* Tiny Audio Toggle */}
              <button
                onClick={() => {
                  const newEnabled = !audioEnabled;
                  audioSystem.setEnabled(newEnabled);
                  setAudioEnabled(newEnabled);
                  if (newEnabled) {
                    audioSystem.testSound();
                  }
                }}
                className={`px-1 py-0.5 text-xs border transition-colors ${
                  audioEnabled
                    ? "border-green-400 text-green-400 hover:bg-green-400 hover:text-black"
                    : "border-gray-500 text-gray-500 hover:border-gray-400 hover:text-gray-400"
                }`}
                style={{ fontSize: "8px", lineHeight: "10px" }}
                title={
                  audioEnabled
                    ? "Audio notifications enabled"
                    : "Audio notifications disabled"
                }
              >
                🔊
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Strategy Tabs */}
      <div className="border border-gray-600 overflow-hidden bg-gray-900">
        <div className="grid grid-cols-2 md:flex bg-gray-800">
          {(
            [
              "dips",
              "alchemy",
              "volatility",
              "volumeProfile",
              "confluence",
              "recipeArbitrage",
            ] as AnalyticsTab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 md:px-8 py-2  font-semibold text-sm md:text-xl font-serif border-r border-gray-600 transition-colors ${
                activeTab === tab
                  ? "bg-white text-black"
                  : "bg-gray-800 text-white hover:bg-gray-700"
              }`}
            >
              {getTabTitle(tab)}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {/* Tab Content */}
          {activeTab === "dips" && <DipsTable data={data.dips} />}
          {activeTab === "alchemy" && <AlchemyTable data={data.alchemy} />}
          {activeTab === "volatility" && (
            <VolatilityTable data={data.volatility} />
          )}
          {activeTab === "volumeProfile" && (
            <VolumeProfileTable data={data.volumeProfile} />
          )}
          {activeTab === "confluence" && (
            <ConfluenceTable data={data.confluence} />
          )}
          {activeTab === "recipeArbitrage" && (
            <RecipeArbitrageTable data={data.recipeArbitrage} />
          )}
        </div>
      </div>
    </div>
  );
}

// Table Components for each strategy

function DipsTable({ data }: { data: DipItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif min-w-[700px]">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-2 text-left font-semibold text-sm md:text-xl text-white">
              Item
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Buy Range
            </th>
            <th className="border-b border-gray-600  text-right font-semibold text-sm md:text-xl text-white">
              Sell Target
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Price Drop
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Estimated Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr key={`dip-${item.id}-${index}`} className="hover:bg-gray-800">
              <td className="border-b border-gray-600 p-2">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="text-sm md:text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-sm md:text-xl font-semibold text-white">
                      {item.name}
                    </div>
                    {item.members && (
                      <div className="text-xs md:text-sm text-blue-400 font-medium">
                        Members
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600  text-right">
                <div className="text-sm md:text-lg font-semibold text-blue-400">
                  {item.buyRange}
                </div>
                <div className="text-xs md:text-sm text-gray-400">
                  Buy during dip
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-semibold text-green-400">
                  {item.sellRange}
                </div>
                <div className="text-xs md:text-sm text-gray-400">
                  Recovery target
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-bold text-red-400">
                  -{item.priceDropPercent.toFixed(1)}%
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-bold text-green-400">
                  {formatGP(item.estimatedProfit)} gp
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AlchemyTable({ data }: { data: AlchemyItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif min-w-[600px]">
        <thead>
          <tr>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-2  text-left font-bold text-sm md:text-lg">
              Item
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-2  text-right font-bold text-sm md:text-lg">
              Current Price
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-2  text-right font-bold text-sm md:text-lg">
              Price Floor
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-2  text-right font-bold text-sm md:text-lg">
              Profit Margin
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-2  text-right font-bold text-sm md:text-lg">
              ROI
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr
              key={`alchemy-${item.id}-${index}`}
              className="hover:bg-gray-800"
            >
              <td className="border-b border-gray-600 p-2  font-semibold text-white">
                <div className="flex items-center gap-2 md:gap-2">
                  <div className="text-sm md:text-base text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-sm md:text-base font-bold">
                      {item.name}
                    </div>
                    {item.members && (
                      <div className="text-xs md:text-sm text-blue-400">
                        Members
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-2  text-right font-semibold text-white text-sm md:text-base">
                {formatGP(item.currentPrice)} gp
              </td>
              <td className="border-b border-gray-600 p-2  text-right text-white text-sm md:text-base">
                {formatGP(item.priceFloor)} gp
              </td>
              <td className="border-b border-gray-600 p-2  text-right">
                <div className="font-bold text-green-400 text-sm md:text-base">
                  {formatGP(item.profitMargin)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-2  text-right">
                <div className="font-bold text-green-400 text-sm md:text-base">
                  {item.roi.toFixed(1)}%
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// New Advanced Analysis Table Components

function VolatilityTable({ data }: { data: VolatilityItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif min-w-[900px]">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-2 text-left font-semibold text-sm md:text-xl text-white">
              Item
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Current Price
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Compression
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Breakout Direction
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Volume Confirmation
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Potential Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr
              key={`volatility-${item.id}-${index}`}
              className="hover:bg-gray-800"
            >
              <td className="border-b border-gray-600 p-2">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="text-sm md:text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-sm md:text-xl font-semibold text-white">
                      {item.name}
                    </div>
                    <div className="text-xs md:text-sm text-gray-400">
                      {item.compressionLevel}
                    </div>
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-semibold text-white">
                  {formatGP(item.currentPrice)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.compressionRatio < 30
                      ? "text-red-400"
                      : item.compressionRatio < 50
                      ? "text-yellow-400"
                      : "text-green-400"
                  }`}
                >
                  {item.compressionRatio.toFixed(1)}%
                </div>
                <div className="text-xs md:text-sm text-gray-400">
                  Daily vs Weekly
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.breakoutDirection.includes("UPPER")
                      ? "text-green-400"
                      : item.breakoutDirection.includes("LOWER")
                      ? "text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {item.breakoutDirection.replace("_", " ")}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-medium ${
                    item.volumeConfirmation === "HIGH_VOLUME_CONFIRMATION"
                      ? "text-green-400"
                      : item.volumeConfirmation ===
                        "MODERATE_VOLUME_CONFIRMATION"
                      ? "text-yellow-400"
                      : "text-gray-400"
                  }`}
                >
                  {item.volumeConfirmation.replace("_", " ")}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-bold text-green-400">
                  {formatGP(item.potentialBreakoutProfit)} gp
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Helper functions for better volume profile display
function formatVolumePattern(pattern: string): string {
  const patterns: { [key: string]: string } = {
    STRONG_ACCUMULATION: "Strong Buy Interest",
    MODERATE_ACCUMULATION: "Moderate Buy Interest",
    STRONG_DISTRIBUTION: "Strong Sell Pressure",
    MODERATE_DISTRIBUTION: "Moderate Sell Pressure",
    BALANCED: "Balanced Trading",
  };
  return patterns[pattern] || pattern.replace("_", " ");
}

function formatVolumeSurge(surge: string): string {
  const surges: { [key: string]: string } = {
    EXTREME_VOLUME_SURGE: "Extreme Activity",
    HIGH_VOLUME_SURGE: "High Activity",
    MODERATE_VOLUME_SURGE: "Increased Activity",
    NORMAL_VOLUME: "Normal Activity",
  };
  return surges[surge] || surge.replace("_", " ");
}

function formatSmartMoneySignal(signal: string): string {
  const signals: { [key: string]: string } = {
    SMART_MONEY_ACCUMULATION: "Big Players Buying",
    SMART_MONEY_DISTRIBUTION: "Big Players Selling",
    NO_SMART_MONEY_SIGNAL: "Normal Trading",
  };
  return signals[signal] || signal.replace("_", " ");
}

function VolumeProfileTable({ data }: { data: VolumeProfileItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif min-w-[900px]">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-2 text-left font-semibold text-sm md:text-xl text-white">
              Item
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Current Price
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Trading Pattern
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Activity Level
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Big Player Signal
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Potential Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr
              key={`volume-${item.id}-${index}`}
              className="hover:bg-gray-800"
            >
              <td className="border-b border-gray-600 p-2">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="text-sm md:text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-sm md:text-xl font-semibold text-white">
                      {item.name}
                    </div>
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-semibold text-white">
                  {formatGP(item.currentPrice)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.volumePattern.includes("ACCUMULATION")
                      ? "text-green-400"
                      : item.volumePattern.includes("DISTRIBUTION")
                      ? "text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {formatVolumePattern(item.volumePattern)}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-medium ${
                    item.volumeSurge === "EXTREME_VOLUME_SURGE"
                      ? "text-red-400"
                      : item.volumeSurge === "HIGH_VOLUME_SURGE"
                      ? "text-yellow-400"
                      : item.volumeSurge === "MODERATE_VOLUME_SURGE"
                      ? "text-green-400"
                      : "text-gray-400"
                  }`}
                >
                  {formatVolumeSurge(item.volumeSurge)}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.smartMoneySignal.includes("ACCUMULATION")
                      ? "text-green-400"
                      : item.smartMoneySignal.includes("DISTRIBUTION")
                      ? "text-red-400"
                      : "text-gray-400"
                  }`}
                >
                  {formatSmartMoneySignal(item.smartMoneySignal)}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-bold text-green-400">
                  {formatGP(item.accumulationProfit)} gp
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfluenceTable({ data }: { data: ConfluenceItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif min-w-[900px]">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-2 text-left font-semibold text-sm md:text-xl text-white">
              Item
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Current Price
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Bullish Confluence
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Signal Strength
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Volume Confirmation
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Potential Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr
              key={`confluence-${item.id}-${index}`}
              className="hover:bg-gray-800"
            >
              <td className="border-b border-gray-600 p-2">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="text-sm md:text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-sm md:text-xl font-semibold text-white">
                      {item.name}
                    </div>
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-semibold text-white">
                  {formatGP(item.currentPrice)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.bullishConfluence >= 4
                      ? "text-green-400"
                      : item.bullishConfluence >= 3
                      ? "text-yellow-400"
                      : "text-gray-400"
                  }`}
                >
                  {item.bullishConfluence}/5
                </div>
                <div className="text-xs md:text-sm text-gray-400">
                  Timeframes Aligned
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.signalStrength === "STRONG_BULLISH"
                      ? "text-green-400"
                      : item.signalStrength === "MODERATE_BULLISH"
                      ? "text-yellow-400"
                      : item.signalStrength === "STRONG_BEARISH"
                      ? "text-red-400"
                      : item.signalStrength === "MODERATE_BEARISH"
                      ? "text-orange-400"
                      : "text-gray-400"
                  }`}
                >
                  {item.signalStrength.replace("_", " ")}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-medium ${
                    item.volumeConfirmation === "VOLUME_CONFIRMED"
                      ? "text-green-400"
                      : item.volumeConfirmation === "VOLUME_SUPPORTED"
                      ? "text-yellow-400"
                      : "text-gray-400"
                  }`}
                >
                  {item.volumeConfirmation.replace("_", " ")}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-bold text-green-400">
                  {formatGP(item.potentialProfit)} gp
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecipeArbitrageTable({ data }: { data: RecipeArbitrageItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif min-w-[900px]">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-2 text-left font-semibold text-sm md:text-xl text-white">
              Product
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Product Price
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Ingredient Cost
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Profit Per Craft
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              ROI
            </th>
            <th className="border-b border-gray-600 p-2 text-right font-semibold text-sm md:text-xl text-white">
              Liquidity
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr
              key={`recipe-${item.id}-${index}`}
              className="hover:bg-gray-800"
            >
              <td className="border-b border-gray-600 p-2">
                <div className="flex items-center gap-2 md:gap-4">
                  <div className="text-sm md:text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-sm md:text-xl font-semibold text-white">
                      {item.productName}
                    </div>
                    <div className="text-xs md:text-sm text-gray-400">
                      {item.recipeType}
                    </div>
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-semibold text-white">
                  {formatGP(item.productPrice)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-semibold text-blue-400">
                  {formatGP(item.totalIngredientCost)} gp
                </div>
                <div className="text-xs md:text-sm text-gray-400">
                  {item.ingredient1Name}
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div className="text-sm md:text-lg font-bold text-green-400">
                  {formatGP(item.profitPerCraft)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-bold ${
                    item.roi > 20
                      ? "text-green-400"
                      : item.roi > 10
                      ? "text-yellow-400"
                      : "text-orange-400"
                  }`}
                >
                  {item.roi.toFixed(1)}%
                </div>
              </td>
              <td className="border-b border-gray-600 p-2 text-right">
                <div
                  className={`text-sm md:text-lg font-medium ${
                    item.liquidityLevel === "HIGH_LIQUIDITY"
                      ? "text-green-400"
                      : item.liquidityLevel === "MODERATE_LIQUIDITY"
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {item.liquidityLevel.replace("_", " ")}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
