const db = require('./db');

db.serialize(() => {
  // Add product_name column to bills table
  db.run("ALTER TABLE bills ADD COLUMN product_name TEXT", (err) => {
    if (err) {
      if (err.message.includes("duplicate column name")) {
        console.log("Column 'product_name' already exists.");
      } else {
        console.error("Migration Error:", err.message);
      }
    } else {
      console.log("Successfully added 'product_name' column to bills table.");
    }
    db.close();
  });
});
