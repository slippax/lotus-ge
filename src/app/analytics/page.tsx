"use client";

import { useState, useEffect } from "react";

// High-Low Spread Analysis (Basic Flipping)
interface FlippingItem {
  id: number;
  name: string;
  lowPrice: number;
  highPrice: number;
  lowVolume: number;
  highVolume: number;
  dailyProfit: number;
  buyLimit: number;
  roi: number;
  members: boolean;
  buyRange: string;
  sellRange: string;
}

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

// Low-Effort Processing (Manufacturing)
interface ProcessingItem {
  id: number;
  name: string;
  recipeType: string;
  highMargin: number;
  lowMargin: number;
  maxProfit: number;
  ingredients: string[];
  processingCost: number;
  members: boolean;
  ingredientCost: number;
  buyRange: string;
  sellRange: string;
  capitalRequired: number;
}

// Volume Analysis Data - Removed (using database data only)

interface ComprehensiveAnalytics {
  flipping: FlippingItem[];
  dips: DipItem[];
  alchemy: AlchemyItem[];
  processing: ProcessingItem[];
  volume: never[]; // Empty array - volume analysis removed
  timestamp: number;
  cached: boolean;
}

type AnalyticsTab = "flipping" | "dips" | "alchemy" | "processing";

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
interface RawFlippingData {
  id?: number;
  name?: string;
  lowPrice?: number;
  currentLow?: number;
  highPrice?: number;
  currentHigh?: number;
  lowVolume24h?: number;
  highVolume24h?: number;
  dailyProfit?: number;
  buyLimit?: number;
  roi?: number;
  members?: boolean;
}

function transformFlippingDataFromAPI(data: RawFlippingData[]): FlippingItem[] {
  return data.slice(0, 50).map((item) => {
    const lowPrice = item.lowPrice || item.currentLow || 0;
    const highPrice = item.highPrice || item.currentHigh || 0;

    return {
      id: item.id || 0,
      name: item.name || "Unknown Item",
      lowPrice,
      highPrice,
      lowVolume: item.lowVolume24h || 0,
      highVolume: item.highVolume24h || 0,
      dailyProfit: item.dailyProfit || 0,
      buyLimit: item.buyLimit || 0,
      roi: item.roi || 0,
      members: item.members || false,
      buyRange: `${formatGP(lowPrice * 0.98)} - ${formatGP(lowPrice * 1.02)}`,
      sellRange: `${formatGP(highPrice * 0.98)} - ${formatGP(
        highPrice * 1.02
      )}`,
    };
  });
}

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

interface RawManufacturingData {
  id?: string | number;
  productName?: string;
  recipeType?: string;
  ingredientCost?: number;
  productPrice?: number;
  profitPerUnit?: number;
  maxProfit4h?: number;
  buyLimit?: number;
  processingCost?: number;
  skillRequired?: {
    skill?: string;
  };
  capitalRequired?: number;
}

function transformManufacturingDataFromAPI(
  data: RawManufacturingData[]
): ProcessingItem[] {
  return data.slice(0, 50).map((item) => {
    const ingredientCost = item.ingredientCost || 0;
    const productPrice = item.productPrice || 0;
    const itemId =
      typeof item.id === "string" ? parseInt(item.id) : item.id || 0;

    return {
      id: itemId,
      name: item.productName || "Unknown Recipe",
      recipeType: item.recipeType || "Unknown",
      highMargin: item.profitPerUnit || 0,
      lowMargin: (item.profitPerUnit || 0) * 0.8,
      maxProfit: item.maxProfit4h || 0,
      ingredients: [],
      processingCost: item.processingCost || 0,
      members: true,
      ingredientCost,
      buyRange: `${formatGP(ingredientCost * 0.98)} - ${formatGP(
        ingredientCost * 1.02
      )}`,
      sellRange: `${formatGP(productPrice * 0.98)} - ${formatGP(
        productPrice * 1.02
      )}`,
      capitalRequired: item.capitalRequired || 0,
    };
  });
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
        flippingResponse,
        dipsResponse,
        alchemyResponse,
        manufacturingResponse,
      ] = await Promise.all([
        fetch(`/api/osrs/highlow-spread${timestamp}`, fetchOptions),
        fetch(`/api/osrs/dip-detection${timestamp}`, fetchOptions),
        fetch(`/api/osrs/alchemy-floors${timestamp}`, fetchOptions),
        fetch(`/api/osrs/manufacturing-analysis${timestamp}`, fetchOptions),
      ]);

      const flippingResult = await flippingResponse.json();
      const dipsResult = await dipsResponse.json();
      const alchemyResult = await alchemyResponse.json();
      const manufacturingResult = await manufacturingResponse.json();

      const flippingData = flippingResult.success ? flippingResult.data : [];
      const dipsData = dipsResult.success ? dipsResult.data : [];
      const alchemyData = alchemyResult.success ? alchemyResult.data : [];
      const manufacturingData = manufacturingResult.success
        ? manufacturingResult.data
        : [];

      // Use the earliest data timestamp from all APIs
      const dataTimestamps = [
        flippingResult.dataUpdated,
        dipsResult.dataUpdated,
        alchemyResult.dataUpdated,
        manufacturingResult.dataUpdated,
      ].filter(Boolean);

      const latestDataUpdate =
        dataTimestamps.length > 0
          ? new Date(
              Math.max(...dataTimestamps.map((ts) => new Date(ts).getTime()))
            )
          : null;

      // Transform data to match existing interface (all from lightweight APIs)
      const transformedData: ComprehensiveAnalytics = {
        flipping: transformFlippingDataFromAPI(flippingData),
        dips: transformDipsDataFromAPI(dipsData),
        alchemy: transformAlchemyDataFromAPI(alchemyData),
        processing: transformManufacturingDataFromAPI(manufacturingData),
        volume: [], // Empty since we removed volume analysis
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
      case "flipping":
        return "High-Low Spread";
      case "dips":
        return "Market Dips";
      case "alchemy":
        return "Alchemy Floors";
      case "processing":
        return "Manufacturing";
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
            className="mt-4 border-4 border-black bg-black text-white px-6 py-3 font-bold text-lg font-serif hover:bg-white hover:text-black transition-colors duration-200"
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
    <div className="space-y-6 text-white min-h-screen mt-6">
      {/* Streamlined Header */}
      <div className="flex flex-col md:items-start gap-2">
        {lastUpdate && (
          <div className="text-lg font-serif text-gray-300">
            <p
              className={`transition-all duration-300 ${
                isRefreshing ? "text-green-400 scale-105" : ""
              }`}
            >
              Updated: {lastUpdate.toLocaleTimeString()}
            </p>
            {dataUpdated && (
              <p
                className={`text-base transition-all duration-300 ${
                  isRefreshing ? "text-green-400" : ""
                }`}
              >
                Data: {dataUpdated.toLocaleString()}
              </p>
            )}
            <p className="text-sm text-blue-400">Instant webhook updates</p>
          </div>
        )}
      </div>

      {/* Strategy Tabs */}
      <div className="border border-gray-600  overflow-hidden bg-gray-900">
        <div className="flex flex-wrap bg-gray-800">
          {(
            ["dips", "processing", "flipping", "alchemy"] as AnalyticsTab[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-4 font-semibold text-xl font-serif border-r border-gray-600 transition-colors ${
                activeTab === tab
                  ? "bg-white text-black"
                  : "bg-gray-800 text-white hover:bg-gray-700"
              }`}
            >
              {getTabTitle(tab)}
            </button>
          ))}
        </div>

        <div className="">
          {/* Tab Content */}
          {activeTab === "flipping" && <FlippingTable data={data.flipping} />}
          {activeTab === "dips" && <DipsTable data={data.dips} />}
          {activeTab === "alchemy" && <AlchemyTable data={data.alchemy} />}
          {activeTab === "processing" && (
            <ProcessingTable data={data.processing} />
          )}
        </div>
      </div>
    </div>
  );
}

// Table Components for each strategy
function FlippingTable({ data }: { data: FlippingItem[] }) {
  return (
    <div className="border border-gray-600 overflow-hidden">
      <table className="w-full border-collapse font-serif">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-6 text-left font-semibold text-xl text-white">
              Item
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Buy Range
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Sell Range
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Daily Profit
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              ROI
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Buy Limit
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr key={`flip-${item.id}-${index}`} className="hover:bg-gray-800">
              <td className="border-b border-gray-600 p-6">
                <div className="flex items-center gap-4">
                  <div className="text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-white">
                      {item.name}
                    </div>
                    {item.members && (
                      <div className="text-sm text-blue-400 font-medium">
                        Members
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-semibold text-blue-400">
                  {item.buyRange}
                </div>
                <div className="text-sm text-gray-400">
                  Suggested buy prices
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-semibold text-green-400">
                  {item.sellRange}
                </div>
                <div className="text-sm text-gray-400">
                  Suggested sell prices
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-bold text-green-400">
                  {formatGP(item.dailyProfit)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-bold text-green-400">
                  {item.roi.toFixed(1)}%
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-medium text-white">
                  {item.buyLimit.toLocaleString()}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DipsTable({ data }: { data: DipItem[] }) {
  return (
    <div className="border border-gray-600  overflow-hidden">
      <table className="w-full border-collapse font-serif">
        <thead>
          <tr className="bg-gray-800">
            <th className="border-b border-gray-600 p-6 text-left font-semibold text-xl text-white">
              Item
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Buy Range
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Sell Target
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Price Drop
            </th>
            <th className="border-b border-gray-600 p-6 text-right font-semibold text-xl text-white">
              Estimated Profit
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr key={`dip-${item.id}-${index}`} className="hover:bg-gray-800">
              <td className="border-b border-gray-600 p-6">
                <div className="flex items-center gap-4">
                  <div className="text-lg font-medium text-gray-300">
                    #{index + 1}
                  </div>
                  <div>
                    <div className="text-xl font-semibold text-white">
                      {item.name}
                    </div>
                    {item.members && (
                      <div className="text-sm text-blue-400 font-medium">
                        Members
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-semibold text-blue-400">
                  {item.buyRange}
                </div>
                <div className="text-sm text-gray-400">Buy during dip</div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-semibold text-green-400">
                  {item.sellRange}
                </div>
                <div className="text-sm text-gray-400">Recovery target</div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-bold text-red-400">
                  -{item.priceDropPercent.toFixed(1)}%
                </div>
              </td>
              <td className="border-b border-gray-600 p-6 text-right">
                <div className="text-lg font-bold text-green-400">
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
      <table className="w-full border-collapse font-serif">
        <thead>
          <tr>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-left font-bold text-lg">
              Item
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Current Price
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Price Floor
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Profit Margin
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
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
              <td className="border-b border-gray-600 p-4 font-semibold text-white">
                <div className="flex items-center gap-3">
                  <div className="text-gray-300">#{index + 1}</div>
                  <div>
                    <div className="font-bold">{item.name}</div>
                    {item.members && (
                      <div className="text-blue-400">Members</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-4 text-right font-semibold text-white">
                {formatGP(item.currentPrice)} gp
              </td>
              <td className="border-b border-gray-600 p-4 text-right text-white">
                {formatGP(item.priceFloor)} gp
              </td>
              <td className="border-b border-gray-600 p-4 text-right">
                <div className="font-bold text-green-400">
                  {formatGP(item.profitMargin)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-4 text-right">
                <div className="font-bold text-green-400">
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

function ProcessingTable({ data }: { data: ProcessingItem[] }) {
  return (
    <div className="border border-gray-600 overflow-x-auto">
      <table className="w-full border-collapse font-serif">
        <thead>
          <tr>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-left font-bold text-lg">
              Item
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Buy Range
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Sell Range
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Max Profit
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-right font-bold text-lg">
              Capital Required
            </th>
            <th className="border-b border-gray-600 bg-gray-800 text-white p-4 text-center font-bold text-lg">
              Recipe Instructions
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((item, index) => (
            <tr
              key={`processing-${item.id}-${index}`}
              className="hover:bg-gray-800"
            >
              <td className="border-b border-gray-600 p-4 font-semibold text-white">
                <div className="flex items-center gap-3">
                  <div className="text-gray-300">#{index + 1}</div>
                  <div>
                    <div className="font-bold">{item.name}</div>
                    {item.members && (
                      <div className="text-blue-400">Members</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-gray-600 p-4 text-right">
                <div className="font-semibold text-blue-400">
                  {item.buyRange}
                </div>
                <div className="text-sm text-gray-400">Ingredient costs</div>
              </td>
              <td className="border-b border-gray-600 p-4 text-right">
                <div className="font-semibold text-green-400">
                  {item.sellRange}
                </div>
                <div className="text-sm text-gray-400">Finished product</div>
              </td>
              <td className="border-b border-gray-600 p-4 text-right">
                <div className="font-bold text-green-400">
                  {formatGP(item.maxProfit)} gp
                </div>
              </td>
              <td className="border-b border-gray-600 p-4 text-right">
                <div className="font-semibold text-orange-400">
                  {formatGP(item.capitalRequired)} gp
                </div>
                <div className="text-sm text-gray-400">Investment needed</div>
              </td>
              <td className="border-b border-gray-600 p-4 text-center text-white">
                <div className="text-sm text-gray-300">{item.recipeType}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// VolumeTable component removed - using database data only
