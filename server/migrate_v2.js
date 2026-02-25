const db = require('./db');

db.serialize(() => {
  // Create bill_items table
  db.run(`CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    pieces INTEGER NOT NULL,
    rate REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (bill_id) REFERENCES bills (id) ON DELETE CASCADE
  )`, (err) => {
    if (err) console.error("Error creating bill_items:", err.message);
    else console.log("Table 'bill_items' created/verified.");
  });

  // Ensure bills table has necessary columns for grand totals
  // SQLite doesn't support easy column renaming, so we'll stick with existing names
  // total_amount -> Grand Total
  // total_pieces -> Sum of all pieces
});
