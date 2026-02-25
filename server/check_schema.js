const db = require('./db');

db.serialize(() => {
  db.get("SELECT name, sql FROM sqlite_master WHERE type='table' AND name='bills'", (err, row) => {
    if (err) {
      console.error('Error fetching schema:', err);
    } else {
      console.log('Table Schema:', row.sql);
    }
    db.close();
  });
});
