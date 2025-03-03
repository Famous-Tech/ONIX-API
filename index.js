const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const cors = require('cors');
const { promisify } = require('util');
const { Pool } = require('pg');
const unlinkAsync = promisify(fs.unlink);

const app = express();
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
};

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

// Routes pour les produits
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

app.get('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const result = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch product: ${err.message}` });
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

// Routes pour les commandes
app.post('/orders', async (req, res) => {
  try {
    const { items, userId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty items array' });
    }

    for (const item of items) {
      if (!item.product_id || isNaN(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({ error: 'Invalid item data' });
      }
    }

    const orderResult = await db.query(
      'INSERT INTO orders (user_id) VALUES ($1) RETURNING id',
      [userId]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
        [orderId, item.product_id, item.quantity]
      );
    }

    res.status(201).json({ orderId, message: 'Order created successfully' });
  } catch (err) {
    res.status(500).json({ error: `Failed to create order: ${err.message}` });
  }
});

app.get('/orders', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT o.*, 
        json_agg(json_build_object(
          'product_id', oi.product_id,
          'quantity', oi.quantity,
          'price_at_time', oi.price_at_time
        )) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/orders/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const result = await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

module.exports = app;
