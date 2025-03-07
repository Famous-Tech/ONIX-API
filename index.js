const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const cors = require('cors');
const { promisify } = require('util');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const unlinkAsync = promisify(fs.unlink);

// Charger les variables d'environnement
dotenv.config();

const app = express();
const corsOptions = {
  origin: '*', // Pour le développement seulement - Je mettrai le domaine en production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Configuration de la base de données à partir des variables d'environnement
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? {
    require: true,
    rejectUnauthorized: false
  } : false
});

const db = {
  query: (text, params) => pool.query(text, params),
};

const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// Middleware de logging pour chaque requête API
app.use((req, res, next) => {
  const start = Date.now();
  const timestamp = new Date().toISOString();
  
  // Log au début de la requête
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl} - Request started`);
  
  // Capturer les paramètres de la requête sans données sensibles
  const requestData = {
    params: req.params,
    query: req.query,
    body: req.method !== 'GET' ? sanitizeRequestBody(req.body) : undefined
  };
  
  console.log(`[${timestamp}] Request data:`, JSON.stringify(requestData));
  
  // Intercepter la fin de la réponse pour logger les résultats
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const endTimestamp = new Date().toISOString();
    
    console.log(`[${endTimestamp}] ${req.method} ${req.originalUrl} - Response status: ${res.statusCode} - Duration: ${duration}ms`);
    
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
});

// Fonction pour sanitiser les données de la requête (éviter de logger des données sensibles)
function sanitizeRequestBody(body) {
  if (!body) return {};
  
  const sanitized = { ...body };
  
  // Masquer les mots de passe
  if (sanitized.password) sanitized.password = '[MASKED]';
  
  // Évitez de logger des fichiers ou des données volumineuses
  if (sanitized.image) sanitized.image = '[IMAGE DATA]';
  
  return sanitized;
}

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

// Mise à jour de la structure de la table (si nécessaire)
// Cette requête devra être exécutée sur la base de données
// ALTER TABLE products RENAME COLUMN price_htg TO price;

// Mise à jour de la route POST pour créer des produits
app.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;

    if (!name || !description || !price) {
      return res.status(400).json({ error: 'Missing required fields: name, description, price' });
    }

    if (isNaN(price)) {
      return res.status(400).json({ error: 'price must be a number' });
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
      'INSERT INTO products (name, description, price, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, price, imageUrl]
    );

    // Format de réponse pour la compatibilité avec les composants Front-end
    const product = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description,
      price: parseFloat(result.rows[0].price),
      image_url: result.rows[0].image_url,
      image: result.rows[0].image_url // Ajouter le champ image pour la compatibilité
    };

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: `Failed to create product: ${err.message}` });
  }
});

// Route pour la connexion - Note: bcrypt et jwt ne sont pas dans package.json, donc j'ai modifié cette fonction
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Recherchez l'utilisateur dans la base de données
    const userResult = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Note: Comme bcrypt n'est pas dans package.json, on utilise une comparaison simple
    // En production, il faudrait installer bcrypt et utiliser bcrypt.compare
    if (user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Note: Comme jsonwebtoken n'est pas dans package.json, on génère un token simple
    // En production, il faudrait installer jsonwebtoken et utiliser jwt.sign
    const token = Buffer.from(JSON.stringify({ userId: user.id, username: user.username })).toString('base64');

    // Renvoyez le token et les informations de l'utilisateur
    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: `Failed to login: ${err.message}` });
  }
});

// Mise à jour de la route GET pour récupérer tous les produits
app.get('/products', async (req, res) => {
  try {
    console.log('Début de la récupération des produits');
    
    // Vérifier la connexion à la base de données
    console.log('Test de connexion à la base de données...');
    await db.query('SELECT 1');
    console.log('Connexion à la base de données réussie');
    
    // Vérifier si la table existe
    console.log('Vérification de la table products...');
    await db.query('SELECT * FROM products LIMIT 1');
    console.log('Table products accessible');
    
    const result = await db.query('SELECT * FROM products ORDER BY id');
    console.log(`${result.rows.length} produits récupérés de la base de données`);
    
    // Reformater les données
    const products = result.rows.map(product => ({
      id: product.id.toString(),
      name: product.name,
      description: product.description,
      price: parseFloat(product.price),
      image_url: product.image_url,
      image: product.image_url
    }));
    
    res.json(products);
  } catch (err) {
    console.error('Erreur détaillée:', err);
    res.status(500).json({ error: `Failed to fetch products: ${err.message}` });
  }
});
// Mise à jour de la route GET pour récupérer un produit spécifique
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

    // Reformater pour correspondre au format attendu par le composant ProductDetails
    const product = {
      id: result.rows[0].id.toString(),
      name: result.rows[0].name,
      description: result.rows[0].description,
      price: parseFloat(result.rows[0].price),
      image_url: result.rows[0].image_url,
      image: result.rows[0].image_url // Ajouter le champ image pour la compatibilité
    };
    
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch product: ${err.message}` });
  }
});

// Mise à jour de la route PUT pour mettre à jour un produit
app.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
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
    if (price) {
      if (isNaN(price)) {
        return res.status(400).json({ error: 'price must be a number' });
      }
      updateFields.push(`price = $${valueIndex}`);
      values.push(price);
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

    // Reformater pour correspondre au format attendu
    const product = {
      id: result.rows[0].id.toString(),
      name: result.rows[0].name,
      description: result.rows[0].description,
      price: parseFloat(result.rows[0].price),
      image_url: result.rows[0].image_url,
      image: result.rows[0].image_url
    };
    
    res.json(product);
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

// Route pour l'inscription 
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Note: Ces routes seront bientot enlevees puisque le front end utilise firebase avec authentification par compte google
    const result = await db.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: `Failed to register user: ${err.message}` });
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

// Utilisation des variables d'environnement pour le port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
