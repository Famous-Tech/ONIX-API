const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const config = require('./config');
const db = require('./db');
const authMiddleware = require('./middleware/auth');

const app = express();

// Configuration du middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Configuration de Multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Routes d'authentification
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const validPassword = await bcrypt.compare(password, result.rows[0].password);
            if (validPassword) {
                req.session.adminId = result.rows[0].id;
                res.redirect('/dashboard');
            } else {
                res.redirect('/login?error=invalid');
            }
        } else {
            res.redirect('/login?error=invalid');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Upload vers Catbox
async function uploadToCatbox(fileBuffer, filename) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', fileBuffer, filename);

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders()
    });

    return response.data;
}

// Routes pour les produits
app.post('/api/products', authMiddleware, upload.single('image'), async (req, res) => {
    try {
        const { name, price, stock, description } = req.body;
        let imageUrl = '';

        if (req.file) {
            imageUrl = await uploadToCatbox(req.file.buffer, req.file.originalname);
        }

        const result = await db.query(
            'INSERT INTO products (name, price, stock, description, image_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, price, stock, description, imageUrl]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/products', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
    try {
        const { name, price, stock, description } = req.body;
        const result = await db.query(
            'UPDATE products SET name=$1, price=$2, stock=$3, description=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5 RETURNING *',
            [name, price, stock, description, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
    try {
        await db.query('DELETE FROM products WHERE id=$1', [req.params.id]);
        res.json({ message: 'Produit supprimé' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour les commandes
app.post('/api/orders', async (req, res) => {
    try {
        const { customer_name, products, total_amount, address } = req.body;
        const result = await db.query(
            'INSERT INTO orders (customer_name, products, total_amount, address) VALUES ($1, $2, $3, $4) RETURNING *',
            [customer_name, JSON.stringify(products), total_amount, address]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM orders ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes pour servir les pages HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/orders', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

// Démarrage du serveur
app.listen(config.PORT, () => {
    console.log(`Serveur démarré sur le port ${config.PORT}`);
});
