require('dotenv').config();

module.exports = {
  db: {
    user: process.env.DB_USER || 'neondb_owner',
    host: process.env.DB_HOST || 'ep-bitter-math-a8ohsbm2-pooler.eastus2.azure.neon.tech',
    database: process.env.DB_NAME || 'neondb',
    password: process.env.DB_PASSWORD || 'dztnfvLhM2r6',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL || { rejectUnauthorized: false } // SSL configuration
  },
  jwtSecret: 'onyx-secret0938499i0wn9u97trnc7e0a68wb'
  port: process.env.PORT || 3000
};
