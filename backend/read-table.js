const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Get table name from command line argument
const tableName = process.argv[2];

if (!tableName) {
  console.error('Error: Please specify a table name');
  console.log('Usage: node read-table.js <table_name>');
  console.log('Example: node read-table.js assignments');
  process.exit(1);
}

// Open the database
const dbPath = path.join(__dirname, 'study_planner.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

// Validate table name to prevent SQL injection
const allowedTables = ['users', 'assignments', 'study_tasks'];
if (!allowedTables.includes(tableName)) {
  console.error(`Error: Invalid table name. Allowed tables: ${allowedTables.join(', ')}`);
  db.close();
  process.exit(1);
}

// Read all records from the specified table
db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
  if (err) {
    console.error('Error reading from table:', err.message);
    db.close();
    process.exit(1);
  }

  if (rows.length === 0) {
    console.log(`No records found in table '${tableName}'`);
  } else {
    console.log(`\n=== Records from '${tableName}' table (${rows.length} total) ===\n`);
    
    rows.forEach((row, index) => {
      console.log(`--- Record ${index + 1} ---`);
      Object.keys(row).forEach(key => {
        console.log(`${key}: ${row[key]}`);
      });
      console.log('');
    });
  }

  // Close the database
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    }
  });
});