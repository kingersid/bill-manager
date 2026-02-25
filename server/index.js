const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

// Add a new bill with multiple items
app.post('/api/bills', (req, res) => {
  const { 
    customer_name, customer_phone, customer_email, customer_address, 
    items, grand_total, total_pieces, bill_date 
  } = req.body;

  if (!customer_name || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields or items' });
  }

  // Use a transaction for bill and items
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const billSql = `INSERT INTO bills (
      customer_name, customer_phone, customer_email, customer_address, total_amount, total_pieces, bill_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const billParams = [
      customer_name, customer_phone, customer_email, customer_address, 
      grand_total, total_pieces, bill_date || new Date().toISOString().split('T')[0]
    ];

    db.run(billSql, billParams, function(err) {
      if (err) {
        console.error('Bill Save Error:', err.message);
        db.run("ROLLBACK");
        return res.status(400).json({ error: err.message });
      }

      const billId = this.lastID;
      const itemSql = `INSERT INTO bill_items (bill_id, product_name, pieces, rate, total) VALUES (?, ?, ?, ?, ?)`;

      // Synchronously insert items within the transaction
      let errorOccurred = false;
      let itemsSaved = 0;

      if (items.length === 0) {
        db.run("COMMIT");
        return res.json({ id: billId, message: 'Bill saved successfully' });
      }

      items.forEach(item => {
        db.run(itemSql, [billId, item.product_name, item.pieces, item.rate, item.total], (err) => {
          if (err) {
            errorOccurred = true;
            console.error('Item Save Error:', err.message);
          }
          itemsSaved++;

          if (itemsSaved === items.length) {
            if (errorOccurred) {
              db.run("ROLLBACK");
              return res.status(400).json({ error: "Failed to save bill items" });
            } else {
              db.run("COMMIT", (err) => {
                if (err) {
                  console.error('Commit Error:', err.message);
                  return res.status(400).json({ error: "Commit failed" });
                }
                res.json({ id: billId, message: 'Bill and items saved successfully' });
              });
            }
          }
        });
      });
    });
  });
});

// Delete a bill and its items
app.delete('/api/bills/:id', (req, res) => {
  const id = req.params.id;
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run("DELETE FROM bill_items WHERE bill_id = ?", id);
    db.run("DELETE FROM bills WHERE id = ?", id, function(err) {
      if (err) {
        db.run("ROLLBACK");
        return res.status(400).json({ error: err.message });
      }
      db.run("COMMIT");
      res.json({ message: "Bill and associated items deleted successfully", changes: this.changes });
    });
  });
});

// Get all bills with their items
app.get('/api/bills', (req, res) => {
  const sql = `
    SELECT b.*, GROUP_CONCAT(bi.product_name, ', ') as products
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    GROUP BY b.id
    ORDER BY b.bill_date DESC, b.id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
});

// Get specific bill items for PDF
app.get('/api/bills/:id/items', (req, res) => {
  db.all("SELECT * FROM bill_items WHERE bill_id = ?", [req.params.id], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
});

// Stats and trends
app.get('/api/stats', (req, res) => {
  db.get("SELECT SUM(total_amount) as total_revenue, SUM(total_pieces) as total_pieces_sold, COUNT(id) as total_bills FROM bills", [], (err, row) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json({
      total_revenue: row.total_revenue || 0,
      total_pieces_sold: row.total_pieces_sold || 0,
      total_bills: row.total_bills || 0
    });
  });
});

app.get('/api/sales-trend', (req, res) => {
  db.all("SELECT bill_date as date, SUM(total_amount) as revenue FROM bills GROUP BY bill_date ORDER BY bill_date ASC LIMIT 30", [], (err, rows) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
