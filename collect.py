#!/usr/bin/env python3
"""
OSRS Market Data Collection Script
Advanced data collection with statistical calculations
Based on research methodology  files
"""

import requests
import sqlite3
import json
import os
import sys
import time
import logging
from datetime import datetime, timezone

# Optional imports for recipe data
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False

# Configuration based on research methodology
ENDPOINTS = [
    ['5m/', 300, 2],      # 5-minute data, 2 days retention
    ['1h/', 3600, 30],    # 1-hour data, 30 days retention
    ['24h/', 86400, 365]  # 24-hour data, 365 days retention
]

# API configuration - values (line 11)
SLEEP_DURATION = 4  # Sleep between API calls (uses 4 seconds)
URL_PREFIX = 'https://prices.runescape.wiki/api/v1/osrs/'
HEADERS = {
    'User-Agent': 'OSRS Data Seeker - Contact: github.com/slippax/lotus-ge'
}

def setup_logging():
    """Setup logging configuration"""
    # Change working directory to script location (methodology line 60-61)
    pathtorunfile = os.path.dirname(__file__)
    if pathtorunfile:
        os.chdir(pathtorunfile)

    os.makedirs('data', exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s'
    )

def fetch_data(url):
    """Fetch data from OSRS Wiki API using methodology (lines 75-90)"""
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
    except:
        # halt execution if the connection closes or if some other non-https error occurs ()
        logging.error(f'fetching historical data failed due to connection/network issue; terminating script')
        sys.exit()
    else:
        if response.status_code == 200:
            # if connection succeeds, wait for sleep duration to pass and return response to parent thread ()
            time.sleep(SLEEP_DURATION)
            return response
        else:
            # if we get anything other than a 200 status, we will record the error and halt execution ()
            logging.error(f'fetching data for {url} failed due to {response.status_code}')
            sys.exit()

def write_market_data(conn, endpoint_interval, response):
    """Write market data to database using research methodology"""
    if not response:
        return None

    cursor = conn.cursor()
    json_data = response.json()
    current_timestamp = int(json_data["timestamp"])

    # Check for existing timestamp to avoid duplicates
    cursor.execute("SELECT DISTINCT timestamp FROM marketdata WHERE interval = ? AND timestamp = ?",
                  (endpoint_interval, current_timestamp))
    existing = cursor.fetchone()

    if existing and existing[0] == current_timestamp:
        return current_timestamp

    response_data = json_data.get("data", {})
    if not response_data:
        # Write empty row for timestamp tracking during maintenance
        cursor.execute("INSERT INTO marketdata (interval, timestamp) VALUES (?, ?)",
                      (endpoint_interval, current_timestamp))
    else:
        # Write market data using proper schema
        rows = []
        for typeid, data in response_data.items():
            rows.append([
                endpoint_interval,
                current_timestamp,
                int(typeid),
                data.get('avgHighPrice'),
                data.get('highPriceVolume'),
                data.get('avgLowPrice'),
                data.get('lowPriceVolume')
            ])

        cursor.executemany(
            "INSERT INTO marketdata (interval, timestamp, typeid, avgHighPrice, highPriceVolume, avgLowPrice, lowPriceVolume) VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows
        )

    conn.commit()
    return current_timestamp

def collect_historical_data(conn):
    """Collect historical market data for all configured endpoints using methodology"""
    cursor = conn.cursor()

    # Track latest timestamps from each endpoint (methodology lines 311-335)
    latest_timestamp_list = []

    for endpoint in ENDPOINTS:
        endpoint_name, interval, retention = endpoint

        logging.info(f"Collecting {endpoint_name} data...")

        # Fetch latest data for this endpoint first
        url = f'{URL_PREFIX}{endpoint_name}'
        response = fetch_data(url)

        if response:
            latest_timestamp = write_market_data(conn, interval, response)

            if latest_timestamp:
                # Generate list of missing timestamps using methodology
                missing_timestamps = generate_missing_timestamps(conn, interval, retention, latest_timestamp)

                # Fetch historical data for missing timestamps
                if missing_timestamps:
                    logging.info(f"Fetching {len(missing_timestamps)} missing timestamps for {endpoint_name}")
                    for timestamp in missing_timestamps:
                        historical_url = f'{URL_PREFIX}{endpoint_name}?timestamp={timestamp}'
                        historical_response = fetch_data(historical_url)
                        if historical_response:
                            write_market_data(conn, interval, historical_response)

                # Update marketdatamax tracking table using methodology (line 330)
                cursor.execute("DELETE FROM marketdatamax WHERE interval = ?", (interval,))
                cursor.execute("REPLACE INTO marketdatamax(interval, timestamp) VALUES(?, ?)",
                              (interval, latest_timestamp))

                # Purge old data beyond retention threshold using methodology
                purge_old_data(conn, interval, retention, latest_timestamp)

                # Add to timestamp list for final calculation
                latest_timestamp_list.append(latest_timestamp)

                conn.commit()

    # Return the maximum timestamp across all endpoints (methodology line 335)
    return max(latest_timestamp_list) if latest_timestamp_list else None

def collect_latest_prices(conn):
    """Collect latest prices using research methodology"""
    cursor = conn.cursor()

    url = f'{URL_PREFIX}latest'
    response = fetch_data(url)
    if not response:
        return

    data = response.json()

    # Clear existing latest data
    cursor.execute("DELETE FROM latest")

    # Insert new latest data using proper schema
    rows = []
    for item_id, prices in data.get('data', {}).items():
        rows.append([
            int(item_id),
            prices.get('high'),
            prices.get('highTime'),
            prices.get('low'),
            prices.get('lowTime')
        ])

    cursor.executemany(
        "INSERT INTO latest (id, high, hightime, low, lowtime) VALUES (?, ?, ?, ?, ?)",
        rows
    )

    conn.commit()
    logging.info(f"✓ Updated latest prices: {len(rows)} items")

def generate_missing_timestamps(conn, interval, retention, latest_timestamp):
    """Generate list of missing timestamps using methodology (lines 124-147)"""
    cursor = conn.cursor()

    # Check for existing endpoint/timestamp in marketdata table
    try:
        cursor.execute("SELECT timestamp FROM marketdata WHERE interval = ? AND timestamp = ?", (interval, latest_timestamp))
        first_timestamp = cursor.fetchone()
        first_timestamp = int(first_timestamp[0]) if first_timestamp else None
    except:
        first_timestamp = None

    # If there is no value in the marketdata table for the indicated endpoint,
    # include all timestamps spanning the endpoint retention threshold through the present
    if first_timestamp is None:
        first_timestamp = latest_timestamp - (86400 * retention)

    # If the timestamp in marketdata is older than our endpoint retention threshold,
    # limit to avoid fetching data outside the bounds of our desired timeframe
    if first_timestamp < latest_timestamp - (86400 * retention):
        first_timestamp = latest_timestamp - (86400 * retention)

    # Iterate over all timestamps between the first and last intervals,
    # checking the database and adding any missing values to a list
    missing_timestamps = []
    current_timestamp = first_timestamp

    while current_timestamp != latest_timestamp:
        cursor.execute("SELECT DISTINCT timestamp FROM marketdata WHERE interval = ? AND timestamp = ?",
                      (interval, current_timestamp))
        existing_timestamp = cursor.fetchone()

        if existing_timestamp is None:
            missing_timestamps.append(current_timestamp)

        current_timestamp = current_timestamp + interval

    return missing_timestamps

def purge_old_data(conn, interval, retention, latest_timestamp):
    """Delete values for timestamps older than retention threshold using methodology (lines 149-153)"""
    cursor = conn.cursor()
    first_timestamp = latest_timestamp - (86400 * retention)
    cursor.execute("DELETE FROM marketdata WHERE interval = ? AND ? > timestamp", (interval, first_timestamp))
    conn.commit()

    deleted_count = cursor.rowcount
    if deleted_count > 0:
        logging.info(f"✓ Purged {deleted_count} old records for interval {interval}")

def collect_mapping_data(conn):
    """Collect mapping data using research methodology"""
    cursor = conn.cursor()
    current_timestamp = int(time.time())

    # Check if mapping data needs refresh (daily)
    cursor.execute("SELECT timestamp FROM MappingMax")
    last_update = cursor.fetchone()

    if last_update and current_timestamp < last_update[0] + 86400:
        return  # Skip if updated within 24 hours

    url = f'{URL_PREFIX}mapping'
    response = fetch_data(url)
    if not response:
        return

    data = response.json()

    # Clear existing mapping data
    cursor.execute("DELETE FROM Mapping")
    cursor.execute("DELETE FROM MappingMax")

    # Insert new mapping data using proper schema
    rows = []
    for item in data:
        rows.append([
            item.get('id'),
            item.get('members', 0),
            item.get('lowalch', 0),
            item.get('limit', 0),
            item.get('value', 0),
            item.get('highalch', 0),
            item.get('icon', ''),
            item.get('name', '')
        ])

    cursor.executemany(
        "INSERT INTO Mapping (typeid, members, lowalch, buylimit, value, highalch, icon, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rows
    )

    # Update timestamp
    cursor.execute("INSERT INTO MappingMax (timestamp) VALUES (?)", (current_timestamp,))

    conn.commit()
    logging.info(f"✓ Updated mapping data: {len(rows)} items")

def collect_mapping_data_with_timestamp(conn, latest_timestamp):
    """Collect mapping data using methodology with timestamp (lines 156-186)"""
    cursor = conn.cursor()

    # Check if mapping data needs refresh (daily) using logic
    cursor.execute("SELECT timestamp FROM MappingMax")
    last_update = cursor.fetchone()

    first_timestamp = int(last_update[0]) if last_update else 0

    # Obtain mapping data if existing data is more than a day old (86400 seconds)
    if latest_timestamp > first_timestamp + 86400:
        url = f'{URL_PREFIX}mapping'
        response = fetch_data(url)
        if not response:
            return

        data = response.json()

        # Use pandas approach if available (lines 175-177)
        if PANDAS_AVAILABLE:
            df = pd.DataFrame(data)
            # drop "examine" column (methodology)
            df.pop(df.columns[0])

            # Clear existing mapping data
            cursor.execute("DELETE FROM Mapping")
            cursor.execute("DELETE FROM MappingMax")

            # Insert using pandas itertuples (lines 180-181)
            for row in df.itertuples(index=False, name=None):
                cursor.execute('INSERT INTO Mapping VALUES (?, ?, ?, ?, ?, ?, ?, ?)', row)
        else:
            # Fallback approach without pandas
            cursor.execute("DELETE FROM Mapping")
            cursor.execute("DELETE FROM MappingMax")

            # Insert new mapping data using proper schema (skip examine column manually)
            rows = []
            for item in data:
                rows.append([
                    item.get('id'),
                    item.get('members', 0),
                    item.get('lowalch', 0),
                    item.get('limit', 0),
                    item.get('value', 0),
                    item.get('highalch', 0),
                    item.get('icon', ''),
                    item.get('name', '')
                ])

            cursor.executemany(
                "INSERT INTO Mapping (typeid, members, lowalch, buylimit, value, highalch, icon, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                rows
            )

        # Update timestamp using methodology (lines 182-183)
        cursor.execute("INSERT INTO MappingMax (timestamp) VALUES (?)", (latest_timestamp,))

        conn.commit()
        logging.info('mapping update completed')

        # Sleep after mapping update (line 186)
        time.sleep(SLEEP_DURATION)

def update_exchange_rate(conn):
    """Update black market exchange rate"""
    cursor = conn.cursor()
    current_timestamp = int(time.time())

    cursor.execute("DELETE FROM BlackMarket")
    cursor.execute("INSERT INTO BlackMarket (timestamp, exchangerate) VALUES (?, ?)",
                  (current_timestamp, 0.20))
    conn.commit()

def update_exchange_rate_with_timestamp(conn, latest_timestamp):
    """Update exchange rate using methodology with timestamp (lines 193-205)"""
    cursor = conn.cursor()

    # Create table if it doesn't exist
    cursor.execute("CREATE TABLE IF NOT EXISTS BlackMarket (timestamp INT, exchangerate REAL)")
    conn.commit()

    try:
        cursor.execute("SELECT timestamp FROM BlackMarket")
        first_timestamp = int(cursor.fetchone()[0])
    except:
        first_timestamp = 0
    finally:
        # Update if data is more than a day old (86400 seconds)
        if latest_timestamp > first_timestamp + 86400:
            cursor.execute("REPLACE INTO BlackMarket(timestamp, exchangerate) VALUES(?, ?)",
                          (latest_timestamp, 0.20))
            conn.commit()
            logging.info("✓ Updated exchange rate with timestamp")

def load_recipe_data(conn):
    """Load recipe data using methodology (lines 343-349)"""
    cursor = conn.cursor()

    if not PANDAS_AVAILABLE:
        logging.warning("pandas not available - manufacturing analysis will be limited")
        return

    try:
        # Load manufacturing recipes from your actual data file
        recipes_df = pd.read_csv("src/data/manufacturing_recipes.csv", sep=",")
        recipes_df.to_sql('Recipes', conn, if_exists='replace', index=False)
        logging.info(f"✓ Loaded {len(recipes_df)} manufacturing recipes")
    except FileNotFoundError:
        logging.warning("manufacturing_recipes.csv not found - manufacturing analysis will be limited")
    except Exception as e:
        logging.error(f"Failed to load recipe data: {e}")

def calculate_statistics(conn):
    cursor = conn.cursor()
    current_timestamp = int(time.time())

    # Check if statistics need updating (every hour)
    cursor.execute("SELECT COUNT(*) FROM marketstats")
    stats_count = cursor.fetchone()[0]

    # Always calculate if no stats exist, otherwise check timestamp
    if stats_count > 0:
        cursor.execute("SELECT timestamp FROM marketstatstimestamp LIMIT 1")
        last_update = cursor.fetchone()
        if last_update and current_timestamp < last_update[0] + 3600:
            return  # Skip if updated within last hour

    logging.info("Calculating market statistics using methodology...")

    # EXACT ReportParameters  (line 27-36) - COMPLETE SET
    ReportParameters = [
        {"Type": "Weekly", "IntervalSize": 86400, "StartRange": 7, "StopRange": 0},
        {"Type": "Monthly", "IntervalSize": 86400, "StartRange": 30, "StopRange": 0},
        {"Type": "Yearly", "IntervalSize": 86400, "StartRange": 360, "StopRange": 0},
        {"Type": "GranularDaily", "IntervalSize": 3600, "StartRange": 24, "StopRange": 0},
        {"Type": "GranularBiweekly", "IntervalSize": 3600, "StartRange": 360, "StopRange": 0},
        {"Type": "GranularMonthly", "IntervalSize": 3600, "StartRange": 720, "StopRange": 0},
        {"Type": "VeryGranularFiveMinute", "IntervalSize": 300, "StartRange": 1, "StopRange": 0},
        {"Type": "VeryGranularHourly", "IntervalSize": 300, "StartRange": 12, "StopRange": 0},
        {"Type": "VeryGranularDaily", "IntervalSize": 300, "StartRange": 288, "StopRange": 0}
    ]

    # Get list of unique typeids
    cursor.execute("SELECT DISTINCT typeid FROM Mapping")
    typeidlist = [typeid[0] for typeid in cursor.fetchall()]

    # Identify stale reports and generate list to process
    ReportParametersRun = []
    for Report in ReportParameters:
        IntervalSize = Report.get("IntervalSize")
        try:
            cursor.execute("SELECT marketdatamax.timestamp AS timestamp FROM marketdatamax, marketstatstimestamp WHERE marketdatamax.interval = ? AND marketstatstimestamp.interval = ? AND marketdatamax.timestamp = marketstatstimestamp.timestamp", (IntervalSize, IntervalSize))
            rows = cursor.fetchone()
            currenttimestamp = int(rows[0]) if rows else None
        except:
            currenttimestamp = None

        if currenttimestamp is None:
            cursor.execute("SELECT timestamp FROM marketdatamax WHERE interval = ?", (IntervalSize,))
            result = cursor.fetchone()
            if result:
                LatestTimestamp = result[0]
                Report["FirstTimestamp"] = LatestTimestamp - (Report.get("StartRange") * IntervalSize)
                Report["LastTimestamp"] = LatestTimestamp - (Report.get("StopRange") * IntervalSize)
                cursor.execute("SELECT DISTINCT timestamp FROM marketdata WHERE interval = ? AND timestamp >= ? AND timestamp <= ?", (IntervalSize, Report.get("FirstTimestamp"), Report.get("LastTimestamp")))
                TimestampList = [timestamp[0] for timestamp in cursor.fetchall()]
                Report["TimestampList"] = TimestampList
                Report["TimestampCount"] = len(TimestampList)
                ReportParametersRun.append(Report)
                logging.info(f"Added {Report.get('Type')} report: {len(TimestampList)} timestamps")

    # Process stale reports using EXACT ReportGenWorker methodology
    if len(ReportParametersRun) > 0:
        ResultList = []

        for typeid in typeidlist:
            for Report in ReportParametersRun:
                TimestampList = Report.get("TimestampList")
                TimestampCount = len(TimestampList)

                # Generate result dictionary
                resultdict = {}
                resultdict["typeid"] = typeid
                resultdict["Type"] = Report.get("Type")

                # Get data for current typeid and report type
                cursor.execute("SELECT timestamp, avgHighPrice, highPriceVolume, avgLowPrice, lowPriceVolume FROM marketdata WHERE typeid = ? AND interval = ? AND timestamp >= ? AND timestamp <= ?",
                             (typeid, Report.get("IntervalSize"), Report.get("FirstTimestamp"), Report.get("LastTimestamp")))
                data_rows = cursor.fetchall()
                timestampcount = len(data_rows)

                # Normalize dataset where entries are missing (methodology lines 249-255)
                MissingTSqty = TimestampCount - timestampcount
                if MissingTSqty > 0:
                    # Add null entries to normalize the dataset
                    null_entries = [(0, 0, 0, 0, 0) for _ in range(MissingTSqty)]
                    data_rows = list(data_rows) + null_entries
                    timestampcount = len(data_rows)

                if timestampcount >= 1:  # Process if we have any data (adjusted for fresh database)
                    # Calculate weighted mean price, mean volume, min price, max price (formula)
                    total_weighted_low = sum(row[4] * row[3] for row in data_rows if row[3] and row[4] and row[3] > 0 and row[4] > 0)
                    total_low_volume = sum(row[4] for row in data_rows if row[4] and row[4] > 0)
                    total_weighted_high = sum(row[2] * row[1] for row in data_rows if row[1] and row[2] and row[1] > 0 and row[2] > 0)
                    total_high_volume = sum(row[2] for row in data_rows if row[2] and row[2] > 0)

                    resultdict["MeanLow"] = int(total_weighted_low / total_low_volume) if total_low_volume > 0 else None
                    resultdict["MeanHigh"] = int(total_weighted_high / total_high_volume) if total_high_volume > 0 else None
                    resultdict["MeanVolumeLow"] = int(sum(row[4] for row in data_rows if row[4]) / len([r for r in data_rows if r[4]])) if any(row[4] for row in data_rows) else None
                    resultdict["MeanVolumeHigh"] = int(sum(row[2] for row in data_rows if row[2]) / len([r for r in data_rows if r[2]])) if any(row[2] for row in data_rows) else None

                    # Min/Max calculations
                    low_prices = [row[3] for row in data_rows if row[3] and row[3] > 0]
                    high_prices = [row[1] for row in data_rows if row[1] and row[1] > 0]
                    resultdict["MinLow"] = min(low_prices) if low_prices else None
                    resultdict["MinHigh"] = min(high_prices) if high_prices else None
                    resultdict["MaxLow"] = max(low_prices) if low_prices else None
                    resultdict["MaxHigh"] = max(high_prices) if high_prices else None

                    # Median calculations using methodology (lines 270-287)
                    # Note: MissingTSqty already calculated above during normalization

                    # Use exact heuristic  line 272: if TimestampCount > timestampcount * 2
                    if TimestampCount > (timestampcount - MissingTSqty) * 2:
                        resultdict["MedianVolumeLow"] = 0
                        resultdict["MedianVolumeHigh"] = 0

                        # Calculate price medians using EXACT SQL median formula 
                        if low_prices:
                            low_prices.sort()
                            n = len(low_prices)
                            if n % 2 == 0:
                                # Even number: average of two middle values (LIMIT 2 - n%2 = LIMIT 2)
                                median_low = (low_prices[n//2 - 1] + low_prices[n//2]) / 2
                            else:
                                # Odd number: middle value (LIMIT 1)
                                median_low = low_prices[n//2]
                            resultdict["MedianLow"] = int(median_low)
                        else:
                            resultdict["MedianLow"] = None

                        if high_prices:
                            high_prices.sort()
                            n = len(high_prices)
                            if n % 2 == 0:
                                median_high = (high_prices[n//2 - 1] + high_prices[n//2]) / 2
                            else:
                                median_high = high_prices[n//2]
                            resultdict["MedianHigh"] = int(median_high)
                        else:
                            resultdict["MedianHigh"] = None
                    else:
                        # Calculate all medians using EXACT SQL median formula
                        low_volumes = [row[4] for row in data_rows if row[4]]
                        high_volumes = [row[2] for row in data_rows if row[2]]

                        if low_volumes:
                            low_volumes.sort()
                            n = len(low_volumes)
                            if n % 2 == 0:
                                median_vol_low = (low_volumes[n//2 - 1] + low_volumes[n//2]) / 2
                            else:
                                median_vol_low = low_volumes[n//2]
                            resultdict["MedianVolumeLow"] = int(median_vol_low)
                        else:
                            resultdict["MedianVolumeLow"] = None

                        if high_volumes:
                            high_volumes.sort()
                            n = len(high_volumes)
                            if n % 2 == 0:
                                median_vol_high = (high_volumes[n//2 - 1] + high_volumes[n//2]) / 2
                            else:
                                median_vol_high = high_volumes[n//2]
                            resultdict["MedianVolumeHigh"] = int(median_vol_high)
                        else:
                            resultdict["MedianVolumeHigh"] = None

                        if low_prices:
                            low_prices.sort()
                            n = len(low_prices)
                            if n % 2 == 0:
                                median_low = (low_prices[n//2 - 1] + low_prices[n//2]) / 2
                            else:
                                median_low = low_prices[n//2]
                            resultdict["MedianLow"] = int(median_low)
                        else:
                            resultdict["MedianLow"] = None

                        if high_prices:
                            high_prices.sort()
                            n = len(high_prices)
                            if n % 2 == 0:
                                median_high = (high_prices[n//2 - 1] + high_prices[n//2]) / 2
                            else:
                                median_high = high_prices[n//2]
                            resultdict["MedianHigh"] = int(median_high)
                        else:
                            resultdict["MedianHigh"] = None

                    ResultList.append(resultdict)

        # Save results to main db (methodology) - USE INSERT OR REPLACE, NOT DELETE
        for result in ResultList:
            cursor.execute("INSERT OR REPLACE INTO marketstats VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                         (result["typeid"], result["Type"], result["MeanLow"], result["MeanHigh"],
                          result["MeanVolumeLow"], result["MeanVolumeHigh"], result["MedianLow"], result["MedianHigh"],
                          result["MedianVolumeLow"], result["MedianVolumeHigh"], result["MinLow"], result["MinHigh"],
                          result["MaxLow"], result["MaxHigh"]))

        # Update timestamp tracking
        cursor.execute("DELETE FROM marketstatstimestamp")
        cursor.execute("INSERT INTO marketstatstimestamp SELECT * FROM marketdatamax")

        conn.commit()
        logging.info("✓ Statistical calculations completed")
    else:
        logging.info("✓ Statistical data is current")

def create_master_table(conn):
    """Create and populate MasterTable using methodology from """
    cursor = conn.cursor()

    logging.info("Creating MasterTable with fresh statistical data...")

    # Drop existing MasterTable if it exists
    cursor.execute("DROP TABLE IF EXISTS MasterTable")

    # Create MasterTable with EXACT schema  (line 58)
    cursor.execute("CREATE TABLE MasterTable(id TEXT, mappinglimit INT, mappingname TEXT, mappinghighalch INT, high INT, low INT, WeeklyMeanLow INT, WeeklyMeanHigh INT, WeeklyMeanVolumeLow TEXT, WeeklyMeanVolumeHigh TEXT, WeeklyMedianLow INT, WeeklyMedianHigh INT, WeeklyMedianVolumeLow INT, WeeklyMedianVolumeHigh INT, WeeklyMinLow INT, WeeklyMinHigh INT, WeeklyMaxLow INT, WeeklyMaxHigh INT, MonthlyMeanLow INT, MonthlyMeanHigh INT, MonthlyMeanVolumeLow TEXT, MonthlyMeanVolumeHigh TEXT, MonthlyMedianLow INT, MonthlyMedianHigh INT, MonthlyMedianVolumeLow INT, MonthlyMedianVolumeHigh INT, MonthlyMinLow INT, MonthlyMinHigh INT, MonthlyMaxLow INT, MonthlyMaxHigh INT, YearlyMeanLow INT, YearlyMeanHigh INT, YearlyMeanVolumeLow TEXT, YearlyMeanVolumeHigh TEXT, YearlyMedianLow INT, YearlyMedianHigh INT, YearlyMedianVolumeLow INT, YearlyMedianVolumeHigh INT, YearlyMinLow INT, YearlyMinHigh INT, YearlyMaxLow INT, YearlyMaxHigh INT, GranularDailyMeanLow INT, GranularDailyMeanHigh INT, GranularDailyMeanVolumeLow TEXT, GranularDailyMeanVolumeHigh TEXT, GranularDailyMedianLow INT, GranularDailyMedianHigh INT, GranularDailyMedianVolumeLow INT, GranularDailyMedianVolumeHigh INT, GranularDailyMinLow INT, GranularDailyMinHigh INT, GranularDailyMaxLow INT, GranularDailyMaxHigh INT, GranularBiweeklyMeanLow INT, GranularBiweeklyMeanHigh INT, GranularBiweeklyMeanVolumeLow TEXT, GranularBiweeklyMeanVolumeHigh TEXT, GranularBiweeklyMedianLow INT, GranularBiweeklyMedianHigh INT, GranularBiweeklyMedianVolumeLow INT, GranularBiweeklyMedianVolumeHigh INT, GranularBiweeklyMinLow INT, GranularBiweeklyMinHigh INT, GranularBiweeklyMaxLow INT, GranularBiweeklyMaxHigh INT, GranularMonthlyMeanLow INT, GranularMonthlyMeanHigh INT, GranularMonthlyMeanVolumeLow TEXT, GranularMonthlyMeanVolumeHigh TEXT, GranularMonthlyMedianLow INT, GranularMonthlyMedianHigh INT, GranularMonthlyMedianVolumeLow INT, GranularMonthlyMedianVolumeHigh INT, GranularMonthlyMinLow INT, GranularMonthlyMinHigh INT, GranularMonthlyMaxLow INT, GranularMonthlyMaxHigh INT, VeryGranularFiveMinuteMeanLow INT, VeryGranularFiveMinuteMeanHigh INT, VeryGranularFiveMinuteMeanVolumeLow TEXT, VeryGranularFiveMinuteMeanVolumeHigh TEXT, VeryGranularFiveMinuteMedianLow INT, VeryGranularFiveMinuteMedianHigh INT, VeryGranularFiveMinuteMedianVolumeLow INT, VeryGranularFiveMinuteMedianVolumeHigh INT, VeryGranularFiveMinuteMinLow INT, VeryGranularFiveMinuteMinHigh INT, VeryGranularFiveMinuteMaxLow INT, VeryGranularFiveMinuteMaxHigh INT, VeryGranularHourlyMeanLow INT, VeryGranularHourlyMeanHigh INT, VeryGranularHourlyMeanVolumeLow TEXT, VeryGranularHourlyMeanVolumeHigh TEXT, VeryGranularHourlyMedianLow INT, VeryGranularHourlyMedianHigh INT, VeryGranularHourlyMedianVolumeLow INT, VeryGranularHourlyMedianVolumeHigh INT, VeryGranularHourlyMinLow INT, VeryGranularHourlyMinHigh INT, VeryGranularHourlyMaxLow INT, VeryGranularHourlyMaxHigh INT, VeryGranularDailyMeanLow INT, VeryGranularDailyMeanHigh INT, VeryGranularDailyMeanVolumeLow TEXT, VeryGranularDailyMeanVolumeHigh TEXT, VeryGranularDailyMedianLow INT, VeryGranularDailyMedianHigh INT, VeryGranularDailyMedianVolumeLow INT, VeryGranularDailyMedianVolumeHigh INT, VeryGranularDailyMinLow INT, VeryGranularDailyMinHigh INT, VeryGranularDailyMaxLow INT, VeryGranularDailyMaxHigh INT, ProductName TEXT, RecipeType TEXT, QtyProduced INT, ProcessingCost INT, ingredient1id INT, ingredient1Qty TEXT, ingredient2id INT, ingredient2Qty TEXT, ingredient3id INT, ingredient3Qty TEXT);")

    # Insert base data using methodology (line 59)
    cursor.execute("INSERT INTO MasterTable(id, mappinglimit, mappingname, mappinghighalch, high, low) SELECT typeid, buylimit, name, highalch, high, low FROM Mapping RIGHT JOIN latest ON Mapping.typeid = latest.id;")

    # Create BlackMarketRate table (line 60) - CRITICAL for alchemy analysis
    cursor.execute("DROP TABLE IF EXISTS BlackMarketRate")
    cursor.execute("CREATE TABLE BlackMarketRate AS SELECT exchangerate AS BlackMarketRate FROM BlackMarket;")

    # Update MasterTable with statistical data using methodology (lines 61-69)
    cursor.execute("UPDATE MasterTable SET WeeklyMeanLow = MeanLow, WeeklyMeanHigh = MeanHigh, WeeklyMeanVolumeLow = MeanVolumeLow, WeeklyMeanVolumeHigh = MeanVolumeHigh, WeeklyMedianLow = MedianLow, WeeklyMedianHigh = MedianHigh, WeeklyMedianVolumeLow = MedianVolumeLow, WeeklyMedianVolumeHigh = MedianVolumeHigh, WeeklyMinLow = MinLow, WeeklyMinHigh = MinHigh, WeeklyMaxLow = MaxLow, WeeklyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'Weekly' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET MonthlyMeanLow = MeanLow, MonthlyMeanHigh = MeanHigh, MonthlyMeanVolumeLow = MeanVolumeLow, MonthlyMeanVolumeHigh = MeanVolumeHigh, MonthlyMedianLow = MedianLow, MonthlyMedianHigh = MedianHigh, MonthlyMedianVolumeLow = MedianVolumeLow, MonthlyMedianVolumeHigh = MedianVolumeHigh, MonthlyMinLow = MinLow, MonthlyMinHigh = MinHigh, MonthlyMaxLow = MaxLow, MonthlyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'Monthly' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET YearlyMeanLow = MeanLow, YearlyMeanHigh = MeanHigh, YearlyMeanVolumeLow = MeanVolumeLow, YearlyMeanVolumeHigh = MeanVolumeHigh, YearlyMedianLow = MedianLow, YearlyMedianHigh = MedianHigh, YearlyMedianVolumeLow = MedianVolumeLow, YearlyMedianVolumeHigh = MedianVolumeHigh, YearlyMinLow = MinLow, YearlyMinHigh = MinHigh, YearlyMaxLow = MaxLow, YearlyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'Yearly' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET GranularDailyMeanLow = MeanLow, GranularDailyMeanHigh = MeanHigh, GranularDailyMeanVolumeLow = MeanVolumeLow, GranularDailyMeanVolumeHigh = MeanVolumeHigh, GranularDailyMedianLow = MedianLow, GranularDailyMedianHigh = MedianHigh, GranularDailyMedianVolumeLow = MedianVolumeLow, GranularDailyMedianVolumeHigh = MedianVolumeHigh, GranularDailyMinLow = MinLow, GranularDailyMinHigh = MinHigh, GranularDailyMaxLow = MaxLow, GranularDailyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'GranularDaily' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET GranularBiweeklyMeanLow = MeanLow, GranularBiweeklyMeanHigh = MeanHigh, GranularBiweeklyMeanVolumeLow = MeanVolumeLow, GranularBiweeklyMeanVolumeHigh = MeanVolumeHigh, GranularBiweeklyMedianLow = MedianLow, GranularBiweeklyMedianHigh = MedianHigh, GranularBiweeklyMedianVolumeLow = MedianVolumeLow, GranularBiweeklyMedianVolumeHigh = MedianVolumeHigh, GranularBiweeklyMinLow = MinLow, GranularBiweeklyMinHigh = MinHigh, GranularBiweeklyMaxLow = MaxLow, GranularBiweeklyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'GranularBiweekly' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET GranularMonthlyMeanLow = MeanLow, GranularMonthlyMeanHigh = MeanHigh, GranularMonthlyMeanVolumeLow = MeanVolumeLow, GranularMonthlyMeanVolumeHigh = MeanVolumeHigh, GranularMonthlyMedianLow = MedianLow, GranularMonthlyMedianHigh = MedianHigh, GranularMonthlyMedianVolumeLow = MedianVolumeLow, GranularMonthlyMedianVolumeHigh = MedianVolumeHigh, GranularMonthlyMinLow = MinLow, GranularMonthlyMinHigh = MinHigh, GranularMonthlyMaxLow = MaxLow, GranularMonthlyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'GranularMonthly' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET VeryGranularFiveMinuteMeanLow = MeanLow, VeryGranularFiveMinuteMeanHigh = MeanHigh, VeryGranularFiveMinuteMeanVolumeLow = MeanVolumeLow, VeryGranularFiveMinuteMeanVolumeHigh = MeanVolumeHigh, VeryGranularFiveMinuteMedianLow = MedianLow, VeryGranularFiveMinuteMedianHigh = MedianHigh, VeryGranularFiveMinuteMedianVolumeLow = MedianVolumeLow, VeryGranularFiveMinuteMedianVolumeHigh = MedianVolumeHigh, VeryGranularFiveMinuteMinLow = MinLow, VeryGranularFiveMinuteMinHigh = MinHigh, VeryGranularFiveMinuteMaxLow = MaxLow, VeryGranularFiveMinuteMaxHigh = MaxHigh FROM marketstats WHERE Type = 'VeryGranularFiveMinute' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET VeryGranularHourlyMeanLow = MeanLow, VeryGranularHourlyMeanHigh = MeanHigh, VeryGranularHourlyMeanVolumeLow = MeanVolumeLow, VeryGranularHourlyMeanVolumeHigh = MeanVolumeHigh, VeryGranularHourlyMedianLow = MedianLow, VeryGranularHourlyMedianHigh = MedianHigh, VeryGranularHourlyMedianVolumeLow = MedianVolumeLow, VeryGranularHourlyMedianVolumeHigh = MedianVolumeHigh, VeryGranularHourlyMinLow = MinLow, VeryGranularHourlyMinHigh = MinHigh, VeryGranularHourlyMaxLow = MaxLow, VeryGranularHourlyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'VeryGranularHourly' AND id = typeid;")
    cursor.execute("UPDATE MasterTable SET VeryGranularDailyMeanLow = MeanLow, VeryGranularDailyMeanHigh = MeanHigh, VeryGranularDailyMeanVolumeLow = MeanVolumeLow, VeryGranularDailyMeanVolumeHigh = MeanVolumeHigh, VeryGranularDailyMedianLow = MedianLow, VeryGranularDailyMedianHigh = MedianHigh, VeryGranularDailyMedianVolumeLow = MedianVolumeLow, VeryGranularDailyMedianVolumeHigh = MedianVolumeHigh, VeryGranularDailyMinLow = MinLow, VeryGranularDailyMinHigh = MinHigh, VeryGranularDailyMaxLow = MaxLow, VeryGranularDailyMaxHigh = MaxHigh FROM marketstats WHERE Type = 'VeryGranularDaily' AND id = typeid;")

    # Update MasterTable with recipe data using methodology (line 70)
    # Note: Fixed the duplicate ingredient1Qty assignment
    cursor.execute("UPDATE MasterTable SET ProductName = Recipes.ProductName, RecipeType = Recipes.RecipeType, QtyProduced = Recipes.QtyProduced, ProcessingCost = Recipes.ProcessingCost, ingredient1id = Recipes.ingredient1id, ingredient1Qty = Recipes.ingredient1Qty, ingredient2id = Recipes.ingredient2id, ingredient2Qty = Recipes.ingredient2Qty, ingredient3id = Recipes.ingredient3id, ingredient3Qty = Recipes.ingredient3Qty FROM Recipes WHERE MasterTable.id = Recipes.id;")

    conn.commit()

    # Get count of items in MasterTable
    cursor.execute("SELECT COUNT(*) FROM MasterTable")
    count = cursor.fetchone()[0]

    logging.info(f"✓ MasterTable created with {count} items and fresh statistical data")


def collect_osrs_data():
    """Main function to collect OSRS market data with advanced methodology"""
    setup_logging()

    # Create database connection (match naming)
    conn = sqlite3.connect('data/osrsmarketdata.sqlite')
    conn.execute('PRAGMA journal_mode=WAL')

    logging.info("Starting OSRS data collection...")

    # Collect historical market data and get latest timestamp
    latest_timestamp = collect_historical_data(conn)

    # Collect latest prices
    collect_latest_prices(conn)

    # Collect mapping data using latest timestamp (methodology)
    if latest_timestamp:
        collect_mapping_data_with_timestamp(conn, latest_timestamp)
    else:
        collect_mapping_data(conn)

    # Update exchange rate using latest timestamp (methodology)
    if latest_timestamp:
        update_exchange_rate_with_timestamp(conn, latest_timestamp)
    else:
        update_exchange_rate(conn)

    # Load recipe data (CRITICAL for manufacturing analysis)
    load_recipe_data(conn)

    # Calculate fresh statistical data
    calculate_statistics(conn)

    # Create MasterTable with fresh statistical data
    create_master_table(conn)

    # Generate lightweight summary files for fast API access
    generate_summary_files(conn)

    # Generate alchemy floors summary
    generate_alchemy_summary(conn)

    # Generate advanced market analysis summaries
    generate_volatility_analysis(conn)
    generate_volume_profile_analysis(conn)
    generate_confluence_analysis(conn)
    generate_recipe_arbitrage_analysis(conn)

    # Commit and close
    conn.commit()
    conn.close()

    logging.info(f"📊 Collection completed at {datetime.now(timezone.utc).isoformat()}")

def generate_summary_files(conn):
    """Generate lightweight JSON files for fast API access using EXACT research methodology"""
    cursor = conn.cursor()

    # Check if MasterTable exists (needed for proper dip detection)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'")
    if not cursor.fetchone():
        logging.warning("MasterTable not found - using simplified dip detection")
        # Fallback to simple detection
        cursor.execute('''
            SELECT
                m.name as ItemName,
                l.low as LowPrice,
                md.avgLowPrice as AvgLow,
                m.buylimit as BuyLimit,
                ((md.avgLowPrice - l.low) / CAST(l.low AS FLOAT) * 100) as pctROI
            FROM latest l
            JOIN Mapping m ON l.id = m.typeid
            JOIN marketdata md ON l.id = md.typeid
            WHERE md.interval = 86400
            AND md.timestamp > (strftime('%s', 'now') - 86400)
            AND l.low > 0
            AND md.avgLowPrice > 0
            AND md.avgLowPrice > l.low * 1.04
            ORDER BY pctROI DESC
            LIMIT 50
        ''')
    else:
        # Use EXACT table-based methodology from Report #1
        logging.info("Using advanced dip detection with VeryGranular analysis")

        # Cleanup any existing temporary tables first
        cursor.executescript("DROP TABLE IF EXISTS MasterTableTax; DROP TABLE IF EXISTS MaxTax; DROP TABLE IF EXISTS MinTax; DROP TABLE IF EXISTS DailyCSVwithTax; DROP TABLE IF EXISTS NoBuyLimit; DROP TABLE IF EXISTS WithBuyLimit; DROP TABLE IF EXISTS DailyCSVwithProfit; DROP TABLE IF EXISTS FinalOutput")

        # Step 1: Create MasterTableTax (line 74)
        cursor.execute("CREATE TABLE MasterTableTax AS SELECT * FROM MasterTable")

        # Step 2: Add Tax column (line 75)
        cursor.execute("ALTER TABLE MasterTableTax ADD COLUMN Tax")

        # Step 3: Create MaxTax and MinTax tables (lines 76-77)
        cursor.execute("CREATE TABLE MaxTax AS SELECT * FROM MasterTableTax WHERE round(VeryGranularDailyMeanLow) > 500000000")
        cursor.execute("CREATE TABLE MinTax AS SELECT * FROM MasterTableTax WHERE round(VeryGranularDailyMeanLow) <= 500000000")

        # Step 4: Update Tax values (lines 78-79)
        cursor.execute("UPDATE MaxTax SET Tax = 5000000")
        cursor.execute("UPDATE MinTax SET Tax = round((VeryGranularDailyMeanLow * 0.01) - 0.5)")

        # Step 5: Create DailyCSVwithTax (line 80)
        cursor.execute("CREATE TABLE DailyCSVwithTax AS SELECT * FROM MaxTax UNION SELECT * FROM MinTax")

        # Step 6: Create NoBuyLimit and WithBuyLimit tables (lines 81-82)
        cursor.execute("CREATE TABLE NoBuyLimit AS SELECT *, ((VeryGranularDailyMeanLow - low - Tax) * 24 * MIN(GranularDailyMeanVolumeLow, GranularDailyMeanVolumeHigh)) AS NoBuyLimitProfit FROM DailyCSVwithTax")
        cursor.execute("CREATE TABLE WithBuyLimit AS SELECT id, ((VeryGranularDailyMeanLow - low - Tax) * mappinglimit) AS WithBuyLimitProfit FROM DailyCSVwithTax")

        # Step 7: Create DailyCSVwithProfit (line 83)
        cursor.execute("CREATE TABLE DailyCSVwithProfit AS SELECT *, MIN(NoBuyLimit.NoBuyLimitProfit, COALESCE(WithBuyLimit.WithBuyLimitProfit, 'NONE')) AS AdjustedPotentialDailyProfit FROM NoBuyLimit, WithBuyLimit WHERE NoBuyLimit.id = WithBuyLimit.id")

        # Step 8: Create FinalOutput with exact WHERE clause (line 84)
        cursor.execute("CREATE TABLE FinalOutput AS SELECT mappingname AS ItemName, low AS LowPrice, VeryGranularDailyMeanLow AS AvgLow, mappinglimit AS BuyLimit, AdjustedPotentialDailyProfit, (VeryGranularDailyMeanLow - low - Tax) AS ProfitPerUnit, ((VeryGranularDailyMeanLow - low - Tax) / low) * 100 AS pctROI FROM DailyCSVwithProfit WHERE (VeryGranularHourlyMeanLow > (low * 1.02)) AND (GranularBiweeklyMinHigh + GranularBiweeklyMinLow) / 2 > low AND (MonthlyMinLow + MonthlyMinHigh) / 2 > low AND pctROI > 0 AND AdjustedPotentialDailyProfit > 100000 AND MonthlyMaxHigh > MonthlyMaxLow AND (high - low - tax) > 0 AND MonthlyMedianVolumeHigh > 0 AND MonthlyMedianVolumeLow > 0 AND GranularDailyMedianVolumeHigh > 0 AND GranularDailyMedianVolumeLow > 0 ORDER BY AdjustedPotentialDailyProfit DESC")

        # Step 9: Get results (line 87 equivalent)
        cursor.execute("SELECT ItemName, LowPrice, AvgLow, BuyLimit, printf('%.2f', pctROI) AS pctROI FROM FinalOutput")

        # Fetch results before cleanup
        results = cursor.fetchall()

        # Step 10: Cleanup tables (line 91 equivalent)
        cursor.executescript("DROP TABLE IF EXISTS MasterTableTax; DROP TABLE IF EXISTS MaxTax; DROP TABLE IF EXISTS MinTax; DROP TABLE IF EXISTS DailyCSVwithTax; DROP TABLE IF EXISTS NoBuyLimit; DROP TABLE IF EXISTS WithBuyLimit; DROP TABLE IF EXISTS DailyCSVwithProfit; DROP TABLE IF EXISTS FinalOutput")

    dipped_items = []
    for row in results:
        dipped_items.append({
            'ItemName': row[0],
            'LowPrice': row[1],
            'AvgLow': int(row[2]) if row[2] else 0,
            'BuyLimit': row[3] if row[3] else 0,
            'pctROI': float(row[4]) if row[4] else 0.0
        })

    # Save lightweight summary files
    os.makedirs('data/summaries', exist_ok=True)

    with open('data/summaries/dipped-items.json', 'w') as f:
        json.dump({
            'updated': datetime.now(timezone.utc).isoformat(),
            'items': dipped_items,
            'methodology': 'VeryGranular' if cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'").fetchone() else 'Simplified'
        }, f, indent=2)

    logging.info(f"✓ Generated dipped items summary: {len(dipped_items)} items")





def generate_alchemy_summary(conn):
    """Generate alchemy floors summary using EXACT research methodology"""
    cursor = conn.cursor()

    # Check if MasterTable exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'")
    if not cursor.fetchone():
        logging.warning("MasterTable not found - skipping alchemy analysis")
        return

    # Use EXACT table-based methodology from Report #2
    logging.info("Generating alchemy analysis using VeryGranular methodology")

    # Cleanup any existing temporary tables first
    cursor.executescript("DROP TABLE IF EXISTS JagexExchangeRate; DROP TABLE IF EXISTS NatureRunePrice; DROP TABLE IF EXISTS PriceFloor; DROP TABLE IF EXISTS MasterTableTax; DROP TABLE IF EXISTS MaxTax; DROP TABLE IF EXISTS MinTax; DROP TABLE IF EXISTS DailyCSVwithTax; DROP TABLE IF EXISTS NoBuyLimit; DROP TABLE IF EXISTS WithBuyLimit; DROP TABLE IF EXISTS DailyCSVwithProfit; DROP TABLE IF EXISTS FinalOutput")

    # Step 1: Create JagexExchangeRate table (line 94)
    cursor.execute("CREATE TABLE JagexExchangeRate AS SELECT ((WeeklyMeanLow + WeeklyMeanHigh) / 2) AS BondPrice, CAST((7.99 * 1000000) / ((WeeklyMeanLow + WeeklyMeanHigh) / 2) AS REAL) AS JagexExchangeRate FROM MasterTable WHERE id=13190")

    # Step 2: Create NatureRunePrice table (line 95)
    cursor.execute("CREATE TABLE NatureRunePrice AS SELECT (GranularDailyMeanLow + GranularDailyMeanHigh) / 2 AS NatureRunePrice FROM MasterTable WHERE id=561")

    # Step 3: Create PriceFloor table (line 96)
    cursor.execute("CREATE TABLE PriceFloor AS SELECT id, round(((MasterTable.mappinghighalch - NatureRunePrice.NatureRunePrice - (JagexExchangeRate.BondPrice / (403200 * (BlackMarketRate / JagexExchangeRate.JagexExchangeRate)))) * 0.99) + 0.5) AS PriceFloor FROM MasterTable, NatureRunePrice, JagexExchangeRate, BlackMarketRate")

    # Step 4: Create MasterTableTax (line 97)
    cursor.execute("CREATE TABLE MasterTableTax AS SELECT * FROM MasterTable INNER JOIN PriceFloor ON MasterTable.id = PriceFloor.id")

    # Step 5: Add Tax column (line 98)
    cursor.execute("ALTER TABLE MasterTableTax ADD COLUMN Tax")

    # Step 6: Update Tax values (line 99)
    cursor.execute("UPDATE MasterTableTax SET Tax = round((PriceFloor * 0.01) - 0.5)")

    # Step 7: Create NoBuyLimit and WithBuyLimit tables (lines 100-101)
    cursor.execute("CREATE TABLE NoBuyLimit AS SELECT *, ((PriceFloor - low - Tax) * 24 * MIN(GranularDailyMeanVolumeLow, GranularDailyMeanVolumeHigh)) AS NoBuyLimitProfit FROM MasterTableTax")
    cursor.execute("CREATE TABLE WithBuyLimit AS SELECT id, ((PriceFloor - low - Tax) * mappinglimit) AS WithBuyLimitProfit FROM MasterTableTax")

    # Step 8: Create DailyCSVwithProfit (line 102)
    cursor.execute("CREATE TABLE DailyCSVwithProfit AS SELECT *, MIN(NoBuyLimit.NoBuyLimitProfit, COALESCE(WithBuyLimit.WithBuyLimitProfit, 'NONE')) AS AdjustedPotentialDailyProfit FROM NoBuyLimit, WithBuyLimit WHERE NoBuyLimit.id = WithBuyLimit.id")

    # Step 9: Create FinalOutput (line 103)
    cursor.execute("CREATE TABLE FinalOutput AS SELECT mappingname AS ItemName, low AS LowPrice, PriceFloor, mappinglimit AS BuyLimit, (PriceFloor - low - Tax) AS ProfitPerUnit, ((PriceFloor - low - Tax) / low) * 100 AS pctROI FROM DailyCSVwithProfit, JagexExchangeRate, BlackMarketRate WHERE mappinglimit > (4800 * (BlackMarketRate) / (JagexExchangeRate.JagexExchangeRate)) AND (GranularDailyMeanVolumeHigh + GranularDailyMeanVolumeLow) / 2 > 4800 * (BlackMarketRate) / (JagexExchangeRate.JagexExchangeRate) AND pctROI > 1 ORDER BY AdjustedPotentialDailyProfit DESC")

    # Step 10: Get results (line 106 equivalent)
    cursor.execute("SELECT ItemName, LowPrice, round(PriceFloor) AS PriceFloor, BuyLimit, printf('%.2f', pctROI) AS pctROI FROM FinalOutput")

    # Fetch results before cleanup
    results = cursor.fetchall()

    # Step 11: Cleanup tables (line 110 equivalent)
    cursor.executescript("DROP TABLE IF EXISTS JagexExchangeRate; DROP TABLE IF EXISTS NatureRunePrice; DROP TABLE IF EXISTS PriceFloor; DROP TABLE IF EXISTS MasterTableTax; DROP TABLE IF EXISTS MaxTax; DROP TABLE IF EXISTS MinTax; DROP TABLE IF EXISTS DailyCSVwithTax; DROP TABLE IF EXISTS NoBuyLimit; DROP TABLE IF EXISTS WithBuyLimit; DROP TABLE IF EXISTS DailyCSVwithProfit; DROP TABLE IF EXISTS FinalOutput")

    alchemy_items = []
    for row in results:
        alchemy_items.append({
            'ItemName': row[0],
            'LowPrice': row[1],
            'PriceFloor': row[2] if row[2] else 0,
            'BuyLimit': row[3] if row[3] else 0,
            'pctROI': float(row[4]) if row[4] else 0.0
        })

    # Save alchemy summary
    with open('data/summaries/alchemy-floors.json', 'w') as f:
        json.dump({
            'updated': datetime.now(timezone.utc).isoformat(),
            'items': alchemy_items,
            'methodology': 'VeryGranular'
        }, f, indent=2)

    logging.info(f"✓ Generated alchemy floors summary: {len(alchemy_items)} items")



def generate_volatility_analysis(conn):
    """Generate volatility breakout analysis using multi-timeframe Min/Max data with improved OSRS-specific filtering"""
    cursor = conn.cursor()

    logging.info("Generating volatility breakout analysis using VeryGranular methodology with improved filtering")

    # Check if MasterTable exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'")
    if not cursor.fetchone():
        logging.warning("MasterTable not found - skipping volatility analysis")
        return

    # Identify volatility compression and potential breakouts with improved OSRS filtering
    cursor.execute('''
        SELECT
            mappingname as ItemName,
            low as CurrentPrice,
            mappinglimit as BuyLimit,

            -- Calculate volatility ranges for different timeframes
            (VeryGranularDailyMaxLow - VeryGranularDailyMinLow) as DailyRange,
            (WeeklyMaxLow - WeeklyMinLow) as WeeklyRange,
            (MonthlyMaxLow - MonthlyMinLow) as MonthlyRange,

            -- Volatility compression ratio (daily vs weekly)
            ROUND(
                CAST((VeryGranularDailyMaxLow - VeryGranularDailyMinLow) AS REAL) /
                CAST((WeeklyMaxLow - WeeklyMinLow) AS REAL) * 100, 2
            ) as CompressionRatio,

            -- Breakout potential (current price vs range boundaries)
            CASE
                WHEN low >= (VeryGranularDailyMaxLow * 0.95) THEN 'UPPER_BREAKOUT_IMMINENT'
                WHEN low <= (VeryGranularDailyMinLow * 1.05) THEN 'LOWER_BREAKOUT_IMMINENT'
                WHEN low > VeryGranularDailyMeanLow THEN 'UPPER_BIAS'
                WHEN low < VeryGranularDailyMeanLow THEN 'LOWER_BIAS'
                ELSE 'NEUTRAL'
            END as BreakoutDirection,

            -- Improved volume confirmation thresholds based on research
            CASE
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(WeeklyMeanVolumeLow AS INTEGER) * 2.5
                THEN 'HIGH_VOLUME_CONFIRMATION'
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(WeeklyMeanVolumeLow AS INTEGER) * 1.8
                THEN 'MODERATE_VOLUME_CONFIRMATION'
                ELSE 'LOW_VOLUME'
            END as VolumeConfirmation,

            -- Potential profit calculation (assuming 10% breakout move)
            ROUND((low * 0.10) * mappinglimit, 0) as PotentialBreakoutProfit,

            -- Risk score (lower compression = higher breakout probability)
            CASE
                WHEN (VeryGranularDailyMaxLow - VeryGranularDailyMinLow) < (WeeklyMaxLow - WeeklyMinLow) * 0.3
                THEN 'HIGH_COMPRESSION'
                WHEN (VeryGranularDailyMaxLow - VeryGranularDailyMinLow) < (WeeklyMaxLow - WeeklyMinLow) * 0.5
                THEN 'MODERATE_COMPRESSION'
                ELSE 'LOW_COMPRESSION'
            END as CompressionLevel

        FROM MasterTable
        WHERE low > 0
        AND VeryGranularDailyMaxLow > 0
        AND VeryGranularDailyMinLow > 0
        AND WeeklyMaxLow > 0
        AND WeeklyMinLow > 0
        AND MonthlyMaxLow > 0
        AND MonthlyMinLow > 0
        AND mappinglimit > 100

        -- Improved OSRS-specific filtering
        -- Exclude junk items but keep viable low-value opportunities
        AND low >= 50
        -- Market cap filter: minimum 50k gp total trading value
        AND (low * mappinglimit) >= 50000
        -- Minimum liquidity requirements
        AND CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) >= 100
        AND CAST(WeeklyMeanVolumeLow AS INTEGER) >= 1000

        -- Strict volatility compression filter (daily range < 50% of weekly range)
        AND (VeryGranularDailyMaxLow - VeryGranularDailyMinLow) < (WeeklyMaxLow - WeeklyMinLow) * 0.5
        -- Ensure we have meaningful price ranges
        AND (VeryGranularDailyMaxLow - VeryGranularDailyMinLow) > 0
        AND (WeeklyMaxLow - WeeklyMinLow) > 0

        ORDER BY CompressionRatio ASC, PotentialBreakoutProfit DESC
        LIMIT 50
    ''')

    results = cursor.fetchall()

    volatility_items = []
    for row in results:
        volatility_items.append({
            'ItemName': row[0],
            'CurrentPrice': row[1] if row[1] else 0,
            'BuyLimit': row[2] if row[2] else 0,
            'DailyRange': row[3] if row[3] else 0,
            'WeeklyRange': row[4] if row[4] else 0,
            'MonthlyRange': row[5] if row[5] else 0,
            'CompressionRatio': float(row[6]) if row[6] else 0.0,
            'BreakoutDirection': row[7] if row[7] else 'NEUTRAL',
            'VolumeConfirmation': row[8] if row[8] else 'LOW_VOLUME',
            'PotentialBreakoutProfit': row[9] if row[9] else 0,
            'CompressionLevel': row[10] if row[10] else 'LOW_COMPRESSION'
        })

    # Save volatility analysis summary
    with open('data/summaries/volatility-breakout.json', 'w') as f:
        json.dump({
            'updated': datetime.now(timezone.utc).isoformat(),
            'items': volatility_items,
            'methodology': 'VeryGranular_VolatilityCompression'
        }, f, indent=2)

    logging.info(f"✓ Generated volatility breakout summary: {len(volatility_items)} items")

def generate_volume_profile_analysis(conn):
    """Generate volume profile analysis to detect accumulation/distribution patterns with improved OSRS filtering"""
    cursor = conn.cursor()

    logging.info("Generating volume profile analysis using VeryGranular methodology with improved filtering")

    # Check if MasterTable exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'")
    if not cursor.fetchone():
        logging.warning("MasterTable not found - skipping volume profile analysis")
        return

    # Analyze volume patterns at different price levels with improved OSRS filtering
    cursor.execute('''
        SELECT
            mappingname as ItemName,
            low as CurrentPrice,
            high as CurrentHigh,
            mappinglimit as BuyLimit,

            -- Volume analysis at different price levels
            VeryGranularDailyMeanVolumeLow as LowPriceVolume,
            VeryGranularDailyMeanVolumeHigh as HighPriceVolume,
            WeeklyMeanVolumeLow as WeeklyLowVolume,
            WeeklyMeanVolumeHigh as WeeklyHighVolume,

            -- Improved volume imbalance detection (avoid division by very small numbers)
            ROUND(
                CAST(VeryGranularDailyMeanVolumeLow AS REAL) /
                CAST(CASE WHEN VeryGranularDailyMeanVolumeHigh >= 5
                     THEN VeryGranularDailyMeanVolumeHigh
                     ELSE 5 END AS REAL), 2
            ) as VolumeImbalanceRatio,

            -- Accumulation/Distribution signal
            CASE
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) * 2
                THEN 'STRONG_ACCUMULATION'
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) * 1.5
                THEN 'MODERATE_ACCUMULATION'
                WHEN CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) > CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) * 2
                THEN 'STRONG_DISTRIBUTION'
                WHEN CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) > CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) * 1.5
                THEN 'MODERATE_DISTRIBUTION'
                ELSE 'BALANCED'
            END as VolumePattern,

            -- Improved volume surge detection with higher thresholds
            CASE
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(WeeklyMeanVolumeLow AS INTEGER) * 3
                THEN 'EXTREME_VOLUME_SURGE'
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(WeeklyMeanVolumeLow AS INTEGER) * 2.2
                THEN 'HIGH_VOLUME_SURGE'
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(WeeklyMeanVolumeLow AS INTEGER) * 1.8
                THEN 'MODERATE_VOLUME_SURGE'
                ELSE 'NORMAL_VOLUME'
            END as VolumeSurge,

            -- Improved smart money indicator with volume and price thresholds
            CASE
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(WeeklyMeanVolumeLow AS INTEGER) * 1.8
                AND low <= VeryGranularDailyMeanLow * 1.02
                AND low >= 25  -- Minimum price threshold
                THEN 'SMART_MONEY_ACCUMULATION'
                WHEN CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) > CAST(WeeklyMeanVolumeHigh AS INTEGER) * 1.8
                AND high >= VeryGranularDailyMeanHigh * 0.98
                AND low >= 25  -- Minimum price threshold
                THEN 'SMART_MONEY_DISTRIBUTION'
                ELSE 'NO_SMART_MONEY_SIGNAL'
            END as SmartMoneySignal,

            -- Potential profit based on volume pattern (Wyckoff methodology)
            CASE
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) * 2
                THEN ROUND((high - low) * mappinglimit, 0)  -- Strong accumulation: target recent high
                WHEN CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) > CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) * 1.5
                THEN ROUND((low * 0.05) * mappinglimit, 0)  -- Moderate accumulation: 5% target
                ELSE 0
            END as AccumulationProfit

        FROM MasterTable
        WHERE low > 0
        AND high > 0
        AND VeryGranularDailyMeanVolumeLow > 0
        AND VeryGranularDailyMeanVolumeHigh > 0
        AND WeeklyMeanVolumeLow > 0
        AND WeeklyMeanVolumeHigh > 0
        AND mappinglimit > 100

        -- Improved OSRS-specific filtering
        -- Exclude junk items but keep some low-value opportunities
        AND low >= 25
        -- Market cap filter: minimum 25k gp total trading value
        AND (low * mappinglimit) >= 25000
        -- Enhanced volume significance thresholds
        AND (CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) + CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER)) >= 200
        AND CAST(WeeklyMeanVolumeLow AS INTEGER) >= 500
        -- Minimum denominator to avoid extreme ratios
        AND CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER) >= 5
        -- Meaningful volume imbalance (minimum 50 unit difference)
        AND ABS(CAST(VeryGranularDailyMeanVolumeLow AS INTEGER) - CAST(VeryGranularDailyMeanVolumeHigh AS INTEGER)) >= 50

        ORDER BY VolumeImbalanceRatio DESC
        LIMIT 50
    ''')

    results = cursor.fetchall()

    volume_items = []
    for row in results:
        volume_items.append({
            'ItemName': row[0],
            'CurrentPrice': row[1] if row[1] else 0,
            'CurrentHigh': row[2] if row[2] else 0,
            'BuyLimit': row[3] if row[3] else 0,
            'LowPriceVolume': row[4] if row[4] else 0,
            'HighPriceVolume': row[5] if row[5] else 0,
            'WeeklyLowVolume': row[6] if row[6] else 0,
            'WeeklyHighVolume': row[7] if row[7] else 0,
            'VolumeImbalanceRatio': float(row[8]) if row[8] else 0.0,
            'VolumePattern': row[9] if row[9] else 'BALANCED',
            'VolumeSurge': row[10] if row[10] else 'NORMAL_VOLUME',
            'SmartMoneySignal': row[11] if row[11] else 'NO_SMART_MONEY_SIGNAL',
            'AccumulationProfit': row[12] if row[12] else 0
        })

    # Save volume profile summary
    with open('data/summaries/volume-profile.json', 'w') as f:
        json.dump({
            'updated': datetime.now(timezone.utc).isoformat(),
            'items': volume_items,
            'methodology': 'VeryGranular_VolumeProfile'
        }, f, indent=2)

    logging.info(f"✓ Generated volume profile summary: {len(volume_items)} items")

def generate_confluence_analysis(conn):
    """Generate multi-timeframe confluence analysis for strong directional signals"""
    cursor = conn.cursor()

    logging.info("Generating confluence analysis using VeryGranular methodology")

    # Check if MasterTable exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'")
    if not cursor.fetchone():
        logging.warning("MasterTable not found - skipping confluence analysis")
        return

    # Analyze multi-timeframe alignment
    cursor.execute('''
        SELECT
            mappingname as ItemName,
            low as CurrentPrice,
            mappinglimit as BuyLimit,

            -- Current price vs all timeframe means
            VeryGranularFiveMinuteMeanLow as FiveMinMean,
            VeryGranularHourlyMeanLow as HourlyMean,
            VeryGranularDailyMeanLow as DailyMean,
            WeeklyMeanLow as WeeklyMean,
            MonthlyMeanLow as MonthlyMean,

            -- Confluence scoring (how many timeframes align)
            (CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
             CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
             CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
             CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
             CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) as BullishConfluence,

            (CASE WHEN low < VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
             CASE WHEN VeryGranularFiveMinuteMeanLow < VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
             CASE WHEN VeryGranularHourlyMeanLow < VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
             CASE WHEN VeryGranularDailyMeanLow < WeeklyMeanLow THEN 1 ELSE 0 END +
             CASE WHEN WeeklyMeanLow < MonthlyMeanLow THEN 1 ELSE 0 END) as BearishConfluence,

            -- Signal strength
            CASE
                WHEN (CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) >= 4
                THEN 'STRONG_BULLISH'
                WHEN (CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) = 3
                THEN 'MODERATE_BULLISH'
                WHEN (CASE WHEN low < VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularFiveMinuteMeanLow < VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularHourlyMeanLow < VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularDailyMeanLow < WeeklyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN WeeklyMeanLow < MonthlyMeanLow THEN 1 ELSE 0 END) >= 4
                THEN 'STRONG_BEARISH'
                WHEN (CASE WHEN low < VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularFiveMinuteMeanLow < VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularHourlyMeanLow < VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN VeryGranularDailyMeanLow < WeeklyMeanLow THEN 1 ELSE 0 END +
                      CASE WHEN WeeklyMeanLow < MonthlyMeanLow THEN 1 ELSE 0 END) = 3
                THEN 'MODERATE_BEARISH'
                ELSE 'MIXED_SIGNALS'
            END as SignalStrength,

            -- Volume confirmation
            CASE
                WHEN VeryGranularDailyMeanVolumeLow > WeeklyMeanVolumeLow * 1.5
                THEN 'VOLUME_CONFIRMED'
                WHEN VeryGranularDailyMeanVolumeLow > WeeklyMeanVolumeLow * 1.2
                THEN 'VOLUME_SUPPORTED'
                ELSE 'WEAK_VOLUME'
            END as VolumeConfirmation,

            -- Potential profit calculation (professional methodology)
            ROUND(
                CASE
                    WHEN (CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) >= 4
                    THEN (low * 0.10) * mappinglimit  -- 10% target for strong confluence
                    WHEN (CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) = 3
                    THEN (low * 0.07) * mappinglimit  -- 7% target for moderate confluence
                    WHEN (CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
                          CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) = 2
                    THEN (low * 0.05) * mappinglimit  -- 5% target for weak confluence
                    ELSE 0
                END, 0
            ) as PotentialProfit

        FROM MasterTable
        WHERE low > 0
        AND VeryGranularFiveMinuteMeanLow > 0
        AND VeryGranularHourlyMeanLow > 0
        AND VeryGranularDailyMeanLow > 0
        AND WeeklyMeanLow > 0
        AND MonthlyMeanLow > 0
        AND mappinglimit > 100

        -- Filter for strong confluence (3+ timeframes aligned)
        AND ((CASE WHEN low > VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
              CASE WHEN VeryGranularFiveMinuteMeanLow > VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
              CASE WHEN VeryGranularHourlyMeanLow > VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
              CASE WHEN VeryGranularDailyMeanLow > WeeklyMeanLow THEN 1 ELSE 0 END +
              CASE WHEN WeeklyMeanLow > MonthlyMeanLow THEN 1 ELSE 0 END) >= 3
             OR
             (CASE WHEN low < VeryGranularFiveMinuteMeanLow THEN 1 ELSE 0 END +
              CASE WHEN VeryGranularFiveMinuteMeanLow < VeryGranularHourlyMeanLow THEN 1 ELSE 0 END +
              CASE WHEN VeryGranularHourlyMeanLow < VeryGranularDailyMeanLow THEN 1 ELSE 0 END +
              CASE WHEN VeryGranularDailyMeanLow < WeeklyMeanLow THEN 1 ELSE 0 END +
              CASE WHEN WeeklyMeanLow < MonthlyMeanLow THEN 1 ELSE 0 END) >= 3)

        ORDER BY BullishConfluence DESC, PotentialProfit DESC
        LIMIT 50
    ''')

    results = cursor.fetchall()

    confluence_items = []
    for row in results:
        confluence_items.append({
            'ItemName': row[0],
            'CurrentPrice': row[1] if row[1] else 0,
            'BuyLimit': row[2] if row[2] else 0,
            'FiveMinMean': row[3] if row[3] else 0,
            'HourlyMean': row[4] if row[4] else 0,
            'DailyMean': row[5] if row[5] else 0,
            'WeeklyMean': row[6] if row[6] else 0,
            'MonthlyMean': row[7] if row[7] else 0,
            'BullishConfluence': row[8] if row[8] else 0,
            'BearishConfluence': row[9] if row[9] else 0,
            'SignalStrength': row[10] if row[10] else 'MIXED_SIGNALS',
            'VolumeConfirmation': row[11] if row[11] else 'WEAK_VOLUME',
            'PotentialProfit': row[12] if row[12] else 0
        })

    # Save confluence analysis summary
    with open('data/summaries/confluence-analysis.json', 'w') as f:
        json.dump({
            'updated': datetime.now(timezone.utc).isoformat(),
            'items': confluence_items,
            'methodology': 'VeryGranular_MultiTimeframeConfluence'
        }, f, indent=2)

    logging.info(f"✓ Generated confluence analysis summary: {len(confluence_items)} items")

def generate_recipe_arbitrage_analysis(conn):
    """Generate recipe arbitrage analysis using ingredient vs product pricing"""
    cursor = conn.cursor()

    logging.info("Generating recipe arbitrage analysis using VeryGranular methodology")

    # Check if required tables exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='MasterTable'")
    if not cursor.fetchone():
        logging.warning("MasterTable not found - skipping recipe arbitrage analysis")
        return

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='Recipes'")
    if not cursor.fetchone():
        logging.warning("Recipes table not found - skipping recipe arbitrage analysis")
        return

    # Analyze recipe arbitrage opportunities
    cursor.execute('''
        SELECT
            r.ProductName as ProductName,
            p.low as ProductPrice,
            p.mappinglimit as ProductBuyLimit,

            -- Ingredient 1 data
            i1.mappingname as Ingredient1Name,
            i1.low as Ingredient1Price,
            r.ingredient1Qty as Ingredient1Qty,

            -- Ingredient 2 data (if exists)
            i2.mappingname as Ingredient2Name,
            i2.low as Ingredient2Price,
            r.ingredient2Qty as Ingredient2Qty,

            -- Ingredient 3 data (if exists)
            i3.mappingname as Ingredient3Name,
            i3.low as Ingredient3Price,
            r.ingredient3Qty as Ingredient3Qty,

            -- Cost calculations
            (COALESCE(i1.low * CAST(r.ingredient1Qty AS INTEGER), 0) +
             COALESCE(i2.low * CAST(r.ingredient2Qty AS INTEGER), 0) +
             COALESCE(i3.low * CAST(r.ingredient3Qty AS INTEGER), 0) +
             COALESCE(r.ProcessingCost, 0)) as TotalIngredientCost,

            -- Profit calculations
            (p.low * r.QtyProduced) -
            (COALESCE(i1.low * CAST(r.ingredient1Qty AS INTEGER), 0) +
             COALESCE(i2.low * CAST(r.ingredient2Qty AS INTEGER), 0) +
             COALESCE(i3.low * CAST(r.ingredient3Qty AS INTEGER), 0) +
             COALESCE(r.ProcessingCost, 0)) as ProfitPerCraft,

            -- ROI calculation
            ROUND(
                ((p.low * r.QtyProduced) -
                 (COALESCE(i1.low * CAST(r.ingredient1Qty AS INTEGER), 0) +
                  COALESCE(i2.low * CAST(r.ingredient2Qty AS INTEGER), 0) +
                  COALESCE(i3.low * CAST(r.ingredient3Qty AS INTEGER), 0) +
                  COALESCE(r.ProcessingCost, 0))) /
                CAST((COALESCE(i1.low * CAST(r.ingredient1Qty AS INTEGER), 0) +
                      COALESCE(i2.low * CAST(r.ingredient2Qty AS INTEGER), 0) +
                      COALESCE(i3.low * CAST(r.ingredient3Qty AS INTEGER), 0) +
                      COALESCE(r.ProcessingCost, 0)) AS REAL) * 100, 2
            ) as ROI,

            -- Recipe type and efficiency
            r.RecipeType as RecipeType,
            r.QtyProduced as QtyProduced,

            -- Volume analysis for feasibility
            CASE
                WHEN p.VeryGranularDailyMeanVolumeLow > 100
                AND i1.VeryGranularDailyMeanVolumeLow > 100
                THEN 'HIGH_LIQUIDITY'
                WHEN p.VeryGranularDailyMeanVolumeLow > 50
                AND i1.VeryGranularDailyMeanVolumeLow > 50
                THEN 'MODERATE_LIQUIDITY'
                ELSE 'LOW_LIQUIDITY'
            END as LiquidityLevel

        FROM Recipes r
        JOIN MasterTable p ON r.id = p.id
        LEFT JOIN MasterTable i1 ON r.ingredient1id = i1.id
        LEFT JOIN MasterTable i2 ON r.ingredient2id = i2.id
        LEFT JOIN MasterTable i3 ON r.ingredient3id = i3.id

        WHERE p.low > 0
        AND i1.low > 0
        AND r.ingredient1Qty IS NOT NULL
        AND r.ingredient1Qty != ''

        -- Filter for profitable recipes (ROI > 5%)
        AND ((p.low * r.QtyProduced) -
             (COALESCE(i1.low * CAST(r.ingredient1Qty AS INTEGER), 0) +
              COALESCE(i2.low * CAST(r.ingredient2Qty AS INTEGER), 0) +
              COALESCE(i3.low * CAST(r.ingredient3Qty AS INTEGER), 0) +
              COALESCE(r.ProcessingCost, 0))) >
            (COALESCE(i1.low * CAST(r.ingredient1Qty AS INTEGER), 0) +
             COALESCE(i2.low * CAST(r.ingredient2Qty AS INTEGER), 0) +
             COALESCE(i3.low * CAST(r.ingredient3Qty AS INTEGER), 0) +
             COALESCE(r.ProcessingCost, 0)) * 0.05

        ORDER BY ROI DESC
        LIMIT 50
    ''')

    results = cursor.fetchall()

    arbitrage_items = []
    for row in results:
        arbitrage_items.append({
            'ProductName': row[0],
            'ProductPrice': row[1] if row[1] else 0,
            'ProductBuyLimit': row[2] if row[2] else 0,
            'Ingredient1Name': row[3] if row[3] else '',
            'Ingredient1Price': row[4] if row[4] else 0,
            'Ingredient1Qty': row[5] if row[5] else '',
            'Ingredient2Name': row[6] if row[6] else '',
            'Ingredient2Price': row[7] if row[7] else 0,
            'Ingredient2Qty': row[8] if row[8] else '',
            'Ingredient3Name': row[9] if row[9] else '',
            'Ingredient3Price': row[10] if row[10] else 0,
            'Ingredient3Qty': row[11] if row[11] else '',
            'TotalIngredientCost': row[12] if row[12] else 0,
            'ProfitPerCraft': row[13] if row[13] else 0,
            'ROI': float(row[14]) if row[14] else 0.0,
            'RecipeType': row[15] if row[15] else '',
            'QtyProduced': row[16] if row[16] else 0,
            'LiquidityLevel': row[17] if row[17] else 'LOW_LIQUIDITY'
        })

    # Save recipe arbitrage summary
    with open('data/summaries/recipe-arbitrage.json', 'w') as f:
        json.dump({
            'updated': datetime.now(timezone.utc).isoformat(),
            'items': arbitrage_items,
            'methodology': 'VeryGranular_RecipeArbitrage'
        }, f, indent=2)

    logging.info(f"✓ Generated recipe arbitrage summary: {len(arbitrage_items)} items")

if __name__ == "__main__":
    collect_osrs_data()