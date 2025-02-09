// orders.js
const express = require('express');
const router = express.Router();
const db = require('./db');

// Créer une nouvelle commande
router.post('/orders', async (req, res) => {
  const { customer_name, customer_phone, items } = req.body;
  
  try {
    await db.query('BEGIN');
    
    // Créer la commande
    const orderResult = await db.query(
      'INSERT INTO orders (customer_name, customer_phone) VALUES ($1, $2) RETURNING id',
      [customer_name, customer_phone]
    );
    
    const orderId = orderResult.rows[0].id;
    
    // Ajouter les items de la commande
    for (const item of items) {
      const product = await db.query('SELECT price_htg FROM products WHERE id = $1', [item.product_id]);
      if (product.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found`);
      }
      
      await db.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
        [orderId, item.product_id, item.quantity, product.rows[0].price_htg]
      );
    }
    
    await db.query('COMMIT');
    res.status(201).json({ message: 'Order created successfully', order_id: orderId });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Obtenir toutes les commandes
router.get('/orders', async (req, res) => {
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

// Mettre à jour le statut d'une commande
router.patch('/orders/:id', async (req, res) => {
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

module.exports = router;
