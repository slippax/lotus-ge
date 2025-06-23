#!/bin/bash

# OSRS Market Data Timestamp Verification Script
# This script helps verify that historical timestamps are being collected properly

echo "🕐 OSRS Market Data Timestamp Verification"
echo "=========================================="
echo

# Check current time vs latest data
echo "📊 Data Freshness Check:"
sqlite3 data/osrsmarketdata.sqlite "
SELECT 
    'Current UTC time: ' || datetime('now') as info
UNION ALL 
SELECT 
    'Latest 5min data: ' || datetime(MAX(timestamp), 'unixepoch') || ' (' || 
    CAST((strftime('%s', 'now') - MAX(timestamp)) / 60 AS INTEGER) || ' minutes ago)'
FROM marketdata WHERE interval = 300
UNION ALL 
SELECT 
    'Latest hourly data: ' || datetime(MAX(timestamp), 'unixepoch') || ' (' || 
    CAST((strftime('%s', 'now') - MAX(timestamp)) / 3600 AS INTEGER) || ' hours ago)'
FROM marketdata WHERE interval = 3600
UNION ALL 
SELECT 
    'Latest daily data: ' || datetime(MAX(timestamp), 'unixepoch') || ' (' || 
    CAST((strftime('%s', 'now') - MAX(timestamp)) / 86400 AS INTEGER) || ' days ago)'
FROM marketdata WHERE interval = 86400;
"

echo
echo "📈 Historical Data Coverage:"
sqlite3 data/osrsmarketdata.sqlite "
SELECT 
    CASE interval 
        WHEN 300 THEN '5-minute data'
        WHEN 3600 THEN 'Hourly data'
        WHEN 86400 THEN 'Daily data'
    END as data_type,
    COUNT(*) as total_records,
    COUNT(DISTINCT timestamp) as unique_timestamps,
    COUNT(DISTINCT DATE(datetime(timestamp, 'unixepoch'))) as unique_days,
    MIN(datetime(timestamp, 'unixepoch')) as earliest,
    MAX(datetime(timestamp, 'unixepoch')) as latest
FROM marketdata 
GROUP BY interval 
ORDER BY interval;
"

echo
echo "🔄 Data Collection Status:"
sqlite3 data/osrsmarketdata.sqlite "
SELECT 
    'Mapping last updated: ' || datetime(timestamp, 'unixepoch') || ' (' ||
    CAST((strftime('%s', 'now') - timestamp) / 3600 AS INTEGER) || ' hours ago)'
FROM MappingMax
UNION ALL
SELECT 
    'Exchange rate updated: ' || datetime(timestamp, 'unixepoch') || ' (' ||
    CAST((strftime('%s', 'now') - timestamp) / 60 AS INTEGER) || ' minutes ago)'
FROM BlackMarket;
"

echo
echo "⚠️  Expected Data Intervals:"
echo "• 5-minute data: Should update every 5 minutes"
echo "• Hourly data: Should update every hour"  
echo "• Daily data: Should update once per day"
echo "• Mapping data: Should update once per day"
echo "• Exchange rate: Should update once per day"

echo
echo "🚨 Alerts:"

# Check if 5-minute data is stale (more than 10 minutes old)
FIVE_MIN_AGE=$(sqlite3 data/osrsmarketdata.sqlite "SELECT CAST((strftime('%s', 'now') - MAX(timestamp)) / 60 AS INTEGER) FROM marketdata WHERE interval = 300;")
if [ "$FIVE_MIN_AGE" -gt 10 ]; then
    echo "⚠️  5-minute data is $FIVE_MIN_AGE minutes old (expected: <10 minutes)"
else
    echo "✅ 5-minute data is fresh ($FIVE_MIN_AGE minutes old)"
fi

# Check if hourly data is stale (more than 2 hours old)
HOURLY_AGE=$(sqlite3 data/osrsmarketdata.sqlite "SELECT CAST((strftime('%s', 'now') - MAX(timestamp)) / 3600 AS INTEGER) FROM marketdata WHERE interval = 3600;")
if [ "$HOURLY_AGE" -gt 2 ]; then
    echo "⚠️  Hourly data is $HOURLY_AGE hours old (expected: <2 hours)"
else
    echo "✅ Hourly data is fresh ($HOURLY_AGE hours old)"
fi

# Check if daily data is stale (more than 2 days old)
DAILY_AGE=$(sqlite3 data/osrsmarketdata.sqlite "SELECT CAST((strftime('%s', 'now') - MAX(timestamp)) / 86400 AS INTEGER) FROM marketdata WHERE interval = 86400;")
if [ "$DAILY_AGE" -gt 2 ]; then
    echo "⚠️  Daily data is $DAILY_AGE days old (expected: <2 days)"
else
    echo "✅ Daily data is fresh ($DAILY_AGE days old)"
fi

echo
echo "💡 To run data collection manually: python collect.py"
echo "💡 To check logs: tail -f logs/osrs_data_collection.log"
