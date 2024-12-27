require('dotenv').config();

const config = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET || 'ONIX-2024-Jpouahihp1w9eogiybyct98yrgoi8e268t58qwbtec7285-8c6',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin'
};

module.exports = config;
