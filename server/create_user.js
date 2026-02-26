require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, isPg } = require('./db');

const username = 'admin';
const password = 'your_secure_password_here'; // Change this!

async function createAdmin() {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (username, password) VALUES (?, ?)";
    
    if (isPg) {
      await db.query(sql.replace('?', '$1').replace('?', '$2'), [username, hashedPassword]);
    } else {
      await new Promise((resolve, reject) => {
        db.run(sql, [username, hashedPassword], (err) => err ? reject(err) : resolve());
      });
    }
    console.log(`Admin user created! Username: ${username}`);
  } catch (err) {
    console.error('Error creating user:', err.message);
  } finally {
    if (isPg) await db.end();
    else db.close();
  }
}

createAdmin();
