const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);

const db = require('./db');
const config = require('./config');
const ordersRouter = require('./orders');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use('/', ordersRouter);

// Upload d'image vers Catbox
async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));

  try {
    const response = await axios.post('https://catbox.moe/user/api.php', form, {
      headers: { ...form.getHeaders() }
    });
    return response.data; // URL de l'image
  } catch (err) {
    throw new Error(`Failed to upload image to Catbox: ${err.message}`);
  } finally {
    await unlinkAsync(filePath); // Nettoyer le fichier temporaire
  }
}

// Créer un produit
app.post('/products', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price_htg } = req.body;

    // Validation des champs obligatoires
    if (!name || !description || !price_htg) {
      return res.status(400).json({ error: 'Missing required fields: name, description, price_htg' });
    }

    // Validation du type de price_htg
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

// Obtenir tous les produits
app.get('/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: `Failed to fetch products: ${err.message}` });
  }
});

// Mettre à jour un produit
app.put('/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, description, price_htg } = req.body;

    // Vérifier que l'ID est valide
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

// Supprimer un produit
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

// Initialiser la base de données et démarrer le serveur
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
