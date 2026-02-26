require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, isPg, initSchema } = require('./db');

// Use environment variables for security
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'your_secure_password_here';

async function createAdmin() {
  try {
    if (isPg) {
      await initSchema();
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql = `
        INSERT INTO users (username, password) 
        VALUES ($1, $2) 
        ON CONFLICT (username) 
        DO UPDATE SET password = EXCLUDED.password
      `;
      await db.query(sql, [username, hashedPassword]);
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const sql = "INSERT OR REPLACE INTO users (username, password) VALUES (?, ?)";
      await new Promise((resolve, reject) => {
        db.run(sql, [username, hashedPassword], (err) => err ? reject(err) : resolve());
      });
    }
    console.log(`Success! User '${username}' created or password updated.`);
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    if (isPg) await db.end();
    else db.close();
  }
}

createAdmin();
