const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
app.use(express.json({ limit: '20kb' }));

// Demo data is ephemeral: restarting the server restores these records.
const products = [
  { id: 1, name: 'Keyboard', price: 50, stock: 10 },
  { id: 2, name: 'Mouse', price: 25, stock: 15 },
  { id: 3, name: 'Headphones', price: 100, stock: 8 }
];
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString('hex');
const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', password: 'Password123!' },
  { id: 2, name: 'Bob', email: 'bob@example.com', password: 'Password123!' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', password: 'Password123!' }
].map(({ password, ...user }) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return { ...user, salt, passwordHash: hashPassword(password, salt) };
});
const sessions = new Map();
const carts = new Map();
let nextUserId = 4;
let nextOrderId = 1;
const orders = [];

const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const validEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const publicUser = ({ id, name, email }) => ({ id, name, email });
function authenticate(req, res, next) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '');
  const userId = match && sessions.get(match[1]);
  const user = users.find(item => item.id === userId);
  if (!user) return res.status(401).json({ error: 'Valid Bearer token required' });
  req.user = user;
  next();
}

app.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || !validEmail(email) ||
      typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Provide name, valid email and password (at least 8 characters)' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (users.some(user => user.email === normalizedEmail)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const user = { id: nextUserId++, name: name.trim(), email: normalizedEmail, salt, passwordHash: hashPassword(password, salt) };
  users.push(user);
  return res.status(201).json({ user: publicUser(user) });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const user = users.find(item => item.email === email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const candidate = Buffer.from(hashPassword(password, user.salt), 'hex');
  const stored = Buffer.from(user.passwordHash, 'hex');
  if (!crypto.timingSafeEqual(candidate, stored)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  return res.json({ token, tokenType: 'Bearer', user: publicUser(user) });
});

// POST /cart replaces the current user's cart. Products are referenced by ID.
app.post('/cart', authenticate, (req, res) => {
  const items = req.body && req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a nonempty array' });
  }
  const seen = new Set();
  const lines = [];
  for (const item of items) {
    if (!item || !Number.isSafeInteger(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      return res.status(400).json({ error: 'Each item requires integer productId and positive integer quantity' });
    }
    if (seen.has(item.productId)) return res.status(400).json({ error: 'Duplicate productId in cart' });
    seen.add(item.productId);
    const product = products.find(p => p.id === item.productId);
    if (!product) return res.status(404).json({ error: `Product ${item.productId} not found` });
    if (item.quantity > product.stock) return res.status(409).json({ error: `Insufficient stock for product ${item.productId}` });
    lines.push({ productId: product.id, name: product.name, unitPrice: product.price, quantity: item.quantity, lineTotal: money(product.price * item.quantity) });
  }
  carts.set(req.user.id, items.map(({ productId, quantity }) => ({ productId, quantity })));
  return res.json({ items: lines, subtotal: money(lines.reduce((sum, line) => sum + line.lineTotal, 0)) });
});

app.post('/checkout', authenticate, (req, res) => {
  const { paymentMethod } = req.body || {};
  if (!['cash', 'credit_card'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'paymentMethod must be cash or credit_card' });
  }
  const items = carts.get(req.user.id);
  if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });
  const lines = [];
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product || product.stock < item.quantity) return res.status(409).json({ error: `Product ${item.productId} is unavailable or out of stock` });
    lines.push({ productId: product.id, name: product.name, quantity: item.quantity, unitPrice: product.price, lineTotal: money(product.price * item.quantity) });
  }
  const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = paymentMethod === 'cash' ? money(subtotal * 0.10) : 0;
  const order = { id: nextOrderId++, userId: req.user.id, items: lines, paymentMethod, subtotal, discount, total: money(subtotal - discount) };
  for (const line of lines) products.find(p => p.id === line.productId).stock -= line.quantity;
  orders.push(order);
  carts.delete(req.user.id);
  return res.status(201).json({ order });
});

const specPath = path.join(__dirname, '..', 'openapi.yaml');
const spec = YAML.load(specPath);
app.get('/openapi.yaml', (_req, res) => res.type('application/yaml').sendFile(specPath));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Checkout API listening on http://localhost:${port}`));
