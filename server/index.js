require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { db, isPg } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied, token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Helper for unified queries (supports ? for both)
const runQuery = (sql, params = []) => {
  const normalizedSql = isPg ? sql.replace(/\?/g, (_, i, full) => `$${full.slice(0, i).split('?').length}`) : sql;
  return new Promise((resolve, reject) => {
    if (isPg) {
      db.query(normalizedSql, params).then(res => resolve({ rows: res.rows, lastID: res.rows[0]?.id })).catch(reject);
    } else {
      db.all(normalizedSql, params, function(err, rows) {
        if (err) return reject(err);
        resolve({ rows, lastID: this.lastID }); // 'this' context works in function() but not () =>
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

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await execCmd("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword]);
    res.json({ message: 'User registered successfully' });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.message.includes('duplicate key value')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const { rows } = await runQuery("SELECT * FROM users WHERE username = ?", [username]);
    const user = rows[0];
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Bills API
app.post('/api/bills', authenticateToken, async (req, res) => {
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

app.delete('/api/bills/:id', authenticateToken, async (req, res) => {
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

app.get('/api/bills', authenticateToken, async (req, res) => {
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

app.get('/api/bills/:id/items', authenticateToken, async (req, res) => {
  try {
    const { rows } = await runQuery("SELECT * FROM bill_items WHERE bill_id = ?", [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
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

app.get('/api/sales-trend', authenticateToken, async (req, res) => {
  try {
    const { rows } = await runQuery("SELECT bill_date as date, SUM(total_amount) as revenue FROM bills GROUP BY bill_date ORDER BY bill_date ASC LIMIT 30");
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Serve frontend for all other routes
app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
