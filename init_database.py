#!/usr/bin/env python3
"""
Database Initialization Script
Creates new database with proper schema for advanced market analysis
"""

import sqlite3
import os
import time
import csv

def init_database():
    """Initialize database with proper schema for advanced market analysis"""

    # Create data directory
    os.makedirs('data', exist_ok=True)
    os.makedirs('data/summaries', exist_ok=True)

    # Remove existing database if it exists (match naming)
    db_path = 'data/osrsmarketdata.sqlite'
    if os.path.exists(db_path):
        os.remove(db_path)
        print("✓ Removed existing database")

    # Connect to new database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Enable WAL mode for better performance
    cursor.execute('PRAGMA journal_mode=WAL')

    print("Creating database schema...")
    
    # Core market data table - stores historical price/volume data
    cursor.execute('''
        CREATE TABLE marketdata (
            interval INTEGER,
            timestamp INTEGER,
            typeid INTEGER,
            avgHighPrice INTEGER,
            highPriceVolume INTEGER,
            avgLowPrice INTEGER,
            lowPriceVolume INTEGER
        )
    ''')
    
    # Latest prices table - current real-time prices
    cursor.execute('''
        CREATE TABLE latest (
            id INTEGER,
            high INTEGER,
            hightime INTEGER,
            low INTEGER,
            lowtime INTEGER
        )
    ''')
    
    # Item mapping table - item metadata and properties
    cursor.execute('''
        CREATE TABLE Mapping (
            typeid INTEGER,
            members INTEGER,
            lowalch INTEGER,
            buylimit INTEGER,
            value INTEGER,
            highalch INTEGER,
            icon TEXT,
            name TEXT
        )
    ''')
    
    # Market statistics table - pre-calculated statistical data
    cursor.execute('''
        CREATE TABLE marketstats (
            typeid INTEGER,
            Type TEXT,
            MeanLow INTEGER,
            MeanHigh INTEGER,
            MeanVolumeLow TEXT,
            MeanVolumeHigh TEXT,
            MedianLow INTEGER,
            MedianHigh INTEGER,
            MedianVolumeLow TEXT,
            MedianVolumeHigh TEXT,
            MinLow INTEGER,
            MinHigh INTEGER,
            MaxLow INTEGER,
            MaxHigh INTEGER,
            UNIQUE(typeid, Type) ON CONFLICT REPLACE
        )
    ''')
    
    # Timestamp tracking tables
    cursor.execute('''
        CREATE TABLE marketdatamax (
            interval INTEGER,
            timestamp INTEGER
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE marketstatstimestamp (
            interval INTEGER,
            timestamp INTEGER
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE MappingMax (
            timestamp INTEGER
        )
    ''')
    
    # Exchange rate tracking for economic calculations
    cursor.execute('''
        CREATE TABLE BlackMarket (
            timestamp INTEGER,
            exchangerate REAL
        )
    ''')
    
    # Manufacturing recipes table
    cursor.execute('''
        CREATE TABLE Recipes (
            ProductName TEXT,
            RecipeType TEXT,
            id INTEGER,
            QtyProduced INTEGER,
            ProcessingCost INTEGER,
            ingredient1id INTEGER,
            ingredient1Qty TEXT,
            ingredient2id INTEGER,
            ingredient2Qty TEXT,
            ingredient3id INTEGER,
            ingredient3Qty TEXT
        )
    ''')
    
    # Create performance indexes
    print("Creating database indexes...")
    cursor.execute('CREATE INDEX marketdataindex ON marketdata (typeid, interval, timestamp)')
    cursor.execute('CREATE INDEX marketdataintervalindex ON marketdata (interval, timestamp)')
    cursor.execute('CREATE INDEX marketstatsindex ON marketstats (Type, typeid)')
    
    # Load manufacturing recipes if available
    try:
        if os.path.exists('src/data/manufacturing_recipes.csv'):
            with open('src/data/manufacturing_recipes.csv', 'r') as f:
                reader = csv.DictReader(f)
                recipes = list(reader)

            # Insert recipes into database
            for recipe in recipes:
                cursor.execute('''
                    INSERT INTO Recipes (ProductName, RecipeType, id, QtyProduced, ProcessingCost,
                                       ingredient1id, ingredient1Qty, ingredient2id, ingredient2Qty,
                                       ingredient3id, ingredient3Qty)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    recipe['ProductName'],
                    recipe['RecipeType'],
                    int(recipe['id']) if recipe['id'] else None,
                    int(recipe['QtyProduced']) if recipe['QtyProduced'] else None,
                    int(recipe['ProcessingCost']) if recipe['ProcessingCost'] else None,
                    int(recipe['ingredient1id']) if recipe['ingredient1id'] and recipe['ingredient1id'] != 'null' else None,
                    recipe['ingredient1Qty'] if recipe['ingredient1Qty'] != 'null' else None,
                    int(recipe['ingredient2id']) if recipe['ingredient2id'] and recipe['ingredient2id'] != 'null' else None,
                    recipe['ingredient2Qty'] if recipe['ingredient2Qty'] != 'null' else None,
                    int(recipe['ingredient3id']) if recipe['ingredient3id'] and recipe['ingredient3id'] != 'null' else None,
                    recipe['ingredient3Qty'] if recipe['ingredient3Qty'] != 'null' else None
                ))

            print(f"✓ Loaded {len(recipes)} manufacturing recipes")
        else:
            print("⚠ Manufacturing recipes file not found - will create empty table")
    except Exception as e:
        print(f"⚠ Could not load recipes: {e}")
    
    # Initialize exchange rate with default value
    current_timestamp = int(time.time())
    cursor.execute('INSERT INTO BlackMarket (timestamp, exchangerate) VALUES (?, ?)', 
                  (current_timestamp, 0.20))
    
    conn.commit()
    conn.close()
    
    print("✓ Database schema initialized successfully!")
    print("✓ Ready for advanced market data collection")
    print("✓ Supports VeryGranular analysis and statistical calculations")

if __name__ == "__main__":
    init_database()
