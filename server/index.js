require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { db, isPg } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper for unified queries
const runQuery = (sql, params = []) => {
  const normalizedSql = isPg ? sql.replace(/\?/g, (_, i, full) => `$${full.slice(0, i).split('?').length}`) : sql;
  return new Promise((resolve, reject) => {
    if (isPg) {
      db.query(normalizedSql, params).then(res => resolve({ rows: res.rows, lastID: res.rows[0]?.id })).catch(reject);
    } else {
      db.all(normalizedSql, params, function(err, rows) {
        if (err) return reject(err);
        resolve({ rows, lastID: this.lastID });
      });
    }
  });
};

const execCmd = (sql, params = []) => {
  const normalizedSql = isPg ? sql.replace(/\?/g, (_, i, full) => `$${full.slice(0, i).split('?').length}`) : sql;
  return new Promise((resolve, reject) => {
    if (isPg) {
      const returnSql = normalizedSql.includes('INSERT') ? `${normalizedSql} RETURNING id` : normalizedSql;
      db.query(returnSql, params).then(res => resolve({ lastID: res.rows[0]?.id, changes: res.rowCount })).catch(reject);
    } else {
      db.run(normalizedSql, params, function(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    }
  });
};

// Bills API (No Auth)
app.post('/api/bills', async (req, res) => {
  const { 
    customer_name, customer_phone, customer_email, customer_address, 
    items, grand_total, total_pieces, bill_date 
  } = req.body;

  if (!customer_name || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields or items' });
  }

  try {
    await execCmd("BEGIN");
    const { lastID: billId } = await execCmd(`INSERT INTO bills (
      customer_name, customer_phone, customer_email, customer_address, total_amount, total_pieces, bill_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      customer_name, customer_phone, customer_email, customer_address, 
      grand_total, total_pieces, bill_date || new Date().toISOString().split('T')[0]
    ]);

    for (const item of items) {
      await execCmd(`INSERT INTO bill_items (bill_id, product_name, pieces, rate, total) VALUES (?, ?, ?, ?, ?)`, 
        [billId, item.product_name, item.pieces, item.rate, item.total]);
    }

    await execCmd("COMMIT");
    res.json({ id: billId, message: 'Bill and items saved successfully' });
  } catch (err) {
    await execCmd("ROLLBACK");
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/bills/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await execCmd("BEGIN");
    await execCmd("DELETE FROM bill_items WHERE bill_id = ?", [id]);
    const { changes } = await execCmd("DELETE FROM bills WHERE id = ?", [id]);
    await execCmd("COMMIT");
    res.json({ message: "Bill and associated items deleted successfully", changes });
  } catch (err) {
    await execCmd("ROLLBACK");
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bills', async (req, res) => {
  const sql = isPg ? `
    SELECT b.*, string_agg(bi.product_name, ', ') as products
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    GROUP BY b.id
    ORDER BY b.bill_date DESC, b.id DESC
  ` : `
    SELECT b.*, GROUP_CONCAT(bi.product_name, ', ') as products
    FROM bills b
    LEFT JOIN bill_items bi ON b.id = bi.bill_id
    GROUP BY b.id
    ORDER BY b.bill_date DESC, b.id DESC
  `;
  try {
    const { rows } = await runQuery(sql);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bills/:id/items', async (req, res) => {
  try {
    const { rows } = await runQuery("SELECT * FROM bill_items WHERE bill_id = ?", [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const { rows } = await runQuery("SELECT SUM(total_amount) as total_revenue, SUM(total_pieces) as total_pieces_sold, COUNT(id) as total_bills FROM bills");
    const row = rows[0];
    res.json({
      total_revenue: row.total_revenue || 0,
      total_pieces_sold: row.total_pieces_sold || 0,
      total_bills: row.total_bills || 0
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/sales-trend', async (req, res) => {
  try {
    const { rows } = await runQuery("SELECT bill_date as date, SUM(total_amount) as revenue FROM bills GROUP BY bill_date ORDER BY bill_date ASC LIMIT 30");
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Serve frontend for all other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
