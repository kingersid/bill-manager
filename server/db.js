const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

let db;
let isPg = false;

if (process.env.DATABASE_URL) {
  // Use PostgreSQL for production
  db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for most cloud providers (Render/Railway/Heroku)
  });
  isPg = true;
  console.log('Connected to PostgreSQL database.');
} else {
  // Use SQLite for local development
  const dbPath = path.resolve(__dirname, 'bills.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database opening error: ', err);
    else console.log('Connected to SQLite database.');
  });
}

// Unified schema creation
const initSchema = async () => {
  const usersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

  const billsTable = `
    CREATE TABLE IF NOT EXISTS bills (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_email TEXT,
      customer_address TEXT,
      total_amount REAL NOT NULL,
      total_pieces INTEGER NOT NULL,
      bill_date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

  const billItemsTable = `
    CREATE TABLE IF NOT EXISTS bill_items (
      id SERIAL PRIMARY KEY,
      bill_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      pieces INTEGER NOT NULL,
      rate REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE
    )`;

  if (isPg) {
    await db.query(usersTable.replace('SERIAL PRIMARY KEY', 'SERIAL PRIMARY KEY'));
    await db.query(billsTable);
    await db.query(billItemsTable);
  } else {
    // Adjust SQLite specific syntax (SERIAL -> INTEGER PRIMARY KEY AUTOINCREMENT)
    db.serialize(() => {
      db.run(usersTable.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT').replace('TIMESTAMP', 'DATETIME'));
      db.run(billsTable.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT').replace('TIMESTAMP', 'DATETIME'));
      db.run(billItemsTable.replace('SERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT').replace('TIMESTAMP', 'DATETIME'));
    });
  }
};

initSchema().catch(err => console.error('Schema init error:', err));

module.exports = {
  db,
  isPg,
  initSchema,
  // Helper to normalize queries if needed
  query: (text, params) => isPg ? db.query(text, params) : new Promise((resolve, reject) => {
    db.all(text, params, (err, rows) => err ? reject(err) : resolve({ rows }));
  })
};
