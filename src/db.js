const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = {
    query: (text, params) => pool.query(text, params)
};
