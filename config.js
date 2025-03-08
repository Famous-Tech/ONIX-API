require('dotenv').config();

module.exports = {
  db: {
    user: process.env.DB_USER || 'onix_owner',
    host: process.env.DB_HOST || 'ep-empty-night-a8fkr5ob-pooler.eastus2.azure.neon.tech',
    database: process.env.DB_NAME || 'onix',
    password: process.env.DB_PASSWORD || 'npg_3AqQWU9LdrFk',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : true // SSL configuration
  },
  jwtSecret: process.env.JWT_SECRET || 'onyx-secret0938499i0wn9u97trnc7e0a68wb',
  port: process.env.PORT || 3000
};
