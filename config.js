require('dotenv').config();

// Fonction pour créer la configuration de la base de données
function createDbConfig() {
  // Si DATABASE_URL existe, l'utiliser en priorité
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { 
        require: true,
        rejectUnauthorized: false 
      }
    };
  }
  
  // Sinon, utiliser les variables individuelles
  return {
    user: process.env.DB_USER || 'onix_owner',
    host: process.env.DB_HOST || 'ep-empty-night-a8fkr5ob-pooler.eastus2.azure.neon.tech',
    database: process.env.DB_NAME || 'onix',
    password: process.env.DB_PASSWORD || 'npg_3AqQWU9LdrFk',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false
  };
}

module.exports = {
  db: createDbConfig(),
  jwtSecret: process.env.JWT_SECRET || 'onyx-secret0938499i0wn9u97trnc7e0a68wb',
  port: process.env.PORT || 3000,
  // Ajouter une référence à l'URL complète pour faciliter la référence ailleurs
  dbUrl: process.env.DATABASE_URL || 'postgresql://onix_owner:npg_3AqQWU9LdrFk@ep-empty-night-a8fkr5ob-pooler.eastus2.azure.neon.tech/onix?sslmode=require'
};
