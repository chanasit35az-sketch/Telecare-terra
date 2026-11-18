'use strict';
// Deletes all data and re-creates the demo seed. Usage: npm run reset-db
const fs = require('fs');
const path = require('path');
const db = require('../server/db');
const { seed } = require('../server/seed');

fs.rmSync(path.join(db.DATA_DIR, 'uploads'), { recursive: true, force: true });
db.load();
db.reset();
db.load();
seed();
console.log('Database reset with demo data at', db.DATA_DIR);
