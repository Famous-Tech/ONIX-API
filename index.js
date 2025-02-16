const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const cors = require('cors');
const { promisify } = require('util');
const { Pool } = require('pg');
const unlinkAsync = promisify(fs.unlink);
const corsOptions = {
  origin: '*', // Pour le développement seulement - Je mettrai le domaine en production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

const config = require('./config');

const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

const db = {
  query: (text, params) => pool.query(text, params),
  async initDb() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Vérifier si la table products existe déjà
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'products'
        );
      `);

      // Si la table existe, la supprimer pour la recréer avec la bonne structure
      if (tableExists.rows[0].exists) {
        await client.query('DROP TABLE IF EXISTS order_items CASCADE');
        await client.query('DROP TABLE IF EXISTS products CASCADE');
      }

      // Création de la table products avec la bonne structure
      await client.query(`
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          price_htg NUMERIC(10, 2) NOT NULL,
          image_url TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Création de la table orders
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          customer_name VARCHAR(255) NOT NULL,
          customer_email VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50),
          total_amount NUMERIC(10, 2) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Création de la table order_items
      await client.query(`
        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
          quantity INTEGER NOT NULL,
          price_at_time NUMERIC(10, 2) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Création du trigger pour updated_at
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';
      `);

      // Ajout des triggers sur les tables
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
            CREATE TRIGGER update_products_updated_at
              BEFORE UPDATE ON products
              FOR EACH ROW
              EXECUTE FUNCTION update_updated_at_column();
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_orders_updated_at') THEN
            CREATE TRIGGER update_orders_updated_at
              BEFORE UPDATE ON orders
              FOR EACH ROW
              EXECUTE FUNCTION update_updated_at_column();
          END IF;
        END
        $$;
      `);

      await client.query('COMMIT');
      
      // Vérifier la structure de la table
      const columns = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'products';
      `);
      console.log('Table products structure:', columns.rows);
      
      console.log('Database initialized successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Database initialization failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
};

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));

  try {
    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: { ...form.getHeaders() }
    });
    return response.data;
  } catch (err) {
    throw new Error(`Failed to upload image to Catbox: ${err.message}`);
  } finally {
    await unlinkAsync(filePath);
  }
}

app.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price_htg } = req.body;

    if (!name || !description || !price_htg) {
      return res.status(400).json({ error: 'Missing required fields: name, description, price_htg' });
    }

    if (isNaN(price_htg)) {
      return res.status(400).json({ error: 'price_htg must be a number' });
    }

    let imageUrl = null;
    if (req.file) {
      try {
        imageUrl = await uploadToCatbox(req.file.path);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    const result = await db.query(
      'INSERT INTO products (name, description, price_htg, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, price_htg, imageUrl]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: `Failed to create product: ${err.message}` });
  }
});

app.get('/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch products: ${err.message}` });
  }
});

app.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price_htg } = req.body;
    const productId = parseInt(req.params.id);
    
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    let imageUrl = undefined;
    if (req.file) {
      try {
        imageUrl = await uploadToCatbox(req.file.path);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    const updateFields = [];
    const values = [];
    let valueIndex = 1;

    if (name) {
      updateFields.push(`name = $${valueIndex}`);
      values.push(name);
      valueIndex++;
    }
    if (description) {
      updateFields.push(`description = $${valueIndex}`);
      values.push(description);
      valueIndex++;
    }
    if (price_htg) {
      if (isNaN(price_htg)) {
        return res.status(400).json({ error: 'price_htg must be a number' });
      }
      updateFields.push(`price_htg = $${valueIndex}`);
      values.push(price_htg);
      valueIndex++;
    }
    if (imageUrl) {
      updateFields.push(`image_url = $${valueIndex}`);
      values.push(imageUrl);
      valueIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(productId);
    const query = `
      UPDATE products 
      SET ${updateFields.join(', ')} 
      WHERE id = $${valueIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: `Failed to update product: ${err.message}` });
  }
});

app.delete('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const result = await db.query(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete product: ${err.message}` });
  }
});

db.initDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

module.exports = app;
