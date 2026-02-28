import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("confeccao.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS company_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    cnpj TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo TEXT
  );

  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT,
    email TEXT,
    role TEXT,
    photo TEXT
  );

  CREATE TABLE IF NOT EXISTS supplies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    unit TEXT DEFAULT 'peças',
    min_stock REAL DEFAULT 0,
    initial_quantity REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    unit_cost REAL DEFAULT 0,
    color TEXT,
    photo TEXT
  );

  CREATE TABLE IF NOT EXISTS operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'Aguardando'
  );

  CREATE TABLE IF NOT EXISTS team (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT
  );

  CREATE TABLE IF NOT EXISTS production_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    entry_date TEXT,
    delivery_date TEXT,
    priority TEXT DEFAULT 'Média',
    status TEXT DEFAULT 'Planejado',
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS production_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    operator_id INTEGER,
    operation_id INTEGER,
    start_time TEXT,
    end_time TEXT,
    status TEXT DEFAULT 'Aguardando',
    FOREIGN KEY (order_id) REFERENCES production_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (operator_id) REFERENCES team(id) ON DELETE CASCADE,
    FOREIGN KEY (operation_id) REFERENCES operations(id) ON DELETE CASCADE
  );

  -- Initial Data
  INSERT OR IGNORE INTO company_info (id, name) VALUES (1, 'Minha Confecção');
  INSERT OR IGNORE INTO user_profile (id, name, role) VALUES (1, 'Administrador', 'Gerente');

  -- Migration: Ensure status column exists in operations
  PRAGMA table_info(operations);
  PRAGMA table_info(products);
  PRAGMA table_info(production_orders);
`);

// Check if status column exists in operations
const tableInfoOps = db.prepare("PRAGMA table_info(operations)").all() as any[];
if (!tableInfoOps.some(col => col.name === 'status')) {
  try { db.exec("ALTER TABLE operations ADD COLUMN status TEXT DEFAULT 'Aguardando'"); } catch (e) {}
}

// Check if code column exists in products
const tableInfoProducts = db.prepare("PRAGMA table_info(products)").all() as any[];
if (!tableInfoProducts.some(col => col.name === 'code')) {
  try { db.exec("ALTER TABLE products ADD COLUMN code TEXT"); } catch (e) {}
}

// Check if color column exists in products
if (!tableInfoProducts.some(col => col.name === 'color')) {
  try { db.exec("ALTER TABLE products ADD COLUMN color TEXT"); } catch (e) {}
}

// Check if photo column exists in products
if (!tableInfoProducts.some(col => col.name === 'photo')) {
  try { db.exec("ALTER TABLE products ADD COLUMN photo TEXT"); } catch (e) {}
}

// Check if code column exists in production_orders
const tableInfoOrders = db.prepare("PRAGMA table_info(production_orders)").all() as any[];
if (!tableInfoOrders.some(col => col.name === 'code')) {
  try { db.exec("ALTER TABLE production_orders ADD COLUMN code TEXT"); } catch (e) {}
}

// Check if avatar column exists in team
const tableInfoTeam = db.prepare("PRAGMA table_info(team)").all() as any[];
if (!tableInfoTeam.some(col => col.name === 'avatar')) {
  try { db.exec("ALTER TABLE team ADD COLUMN avatar TEXT"); } catch (e) {}
}

// Check if photo column exists in user_profile
const tableInfoUser = db.prepare("PRAGMA table_info(user_profile)").all() as any[];
if (!tableInfoUser.some(col => col.name === 'photo')) {
  try { db.exec("ALTER TABLE user_profile ADD COLUMN photo TEXT"); } catch (e) {}
}


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get("/api/dashboard", (req, res) => {
    const activeOrders = db.prepare("SELECT COUNT(*) as count FROM production_orders WHERE status != 'Finalizado'").get() as any;
    const lowStock = db.prepare("SELECT COUNT(*) as count FROM supplies WHERE quantity <= min_stock").get() as any;
    const totalProduced = db.prepare("SELECT SUM(quantity) as total FROM production_orders WHERE status = 'Finalizado'").get() as any;
    
    res.json({
      activeOrders: activeOrders.count,
      lowStockAlerts: lowStock.count,
      totalProduced: totalProduced.total || 0,
      efficiency: 85 // Mocked for now
    });
  });

  // Company & Profile
  app.get("/api/settings", (req, res) => {
    const company = db.prepare("SELECT * FROM company_info WHERE id = 1").get();
    const user = db.prepare("SELECT * FROM user_profile WHERE id = 1").get();
    res.json({ company, user });
  });

  app.post("/api/settings/company", (req, res) => {
    const { name, cnpj, address, phone, email, logo } = req.body;
    db.prepare(`
      UPDATE company_info 
      SET name = ?, cnpj = ?, address = ?, phone = ?, email = ?, logo = ?
      WHERE id = 1
    `).run(name, cnpj, address, phone, email, logo);
    res.json({ success: true });
  });

  app.post("/api/settings/profile", (req, res) => {
    const { name, email, role, photo } = req.body;
    db.prepare(`
      UPDATE user_profile 
      SET name = ?, email = ?, role = ?, photo = ?
      WHERE id = 1
    `).run(name, email, role, photo);
    res.json({ success: true });
  });

  // Supplies (Estoque)
  app.get("/api/supplies", (req, res) => {
    res.json(db.prepare("SELECT * FROM supplies").all());
  });

  app.post("/api/supplies", (req, res) => {
    const { name, quantity, unit, min_stock, initial_quantity } = req.body;
    const result = db.prepare("INSERT INTO supplies (name, quantity, unit, min_stock, initial_quantity) VALUES (?, ?, ?, ?, ?)").run(name, quantity, unit, min_stock, initial_quantity);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/supplies/:id", (req, res) => {
    const { name, quantity, unit, min_stock } = req.body;
    db.prepare("UPDATE supplies SET name = ?, quantity = ?, unit = ?, min_stock = ? WHERE id = ?").run(name, quantity, unit, min_stock, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/supplies/:id", (req, res) => {
    db.prepare("DELETE FROM supplies WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Products
  app.get("/api/products", (req, res) => {
    res.json(db.prepare("SELECT * FROM products").all());
  });

  app.post("/api/products", (req, res) => {
    const { code, name, description, unit_cost, color, photo } = req.body;
    const result = db.prepare("INSERT INTO products (code, name, description, unit_cost, color, photo) VALUES (?, ?, ?, ?, ?, ?)").run(code, name, description, unit_cost, color, photo);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/products/:id", (req, res) => {
    const { code, name, description, unit_cost, color, photo } = req.body;
    db.prepare("UPDATE products SET code = ?, name = ?, description = ?, unit_cost = ?, color = ?, photo = ? WHERE id = ?").run(code, name, description, unit_cost, color, photo, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/products/:id", (req, res) => {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Team
  app.get("/api/team", (req, res) => {
    res.json(db.prepare("SELECT * FROM team").all());
  });

  app.post("/api/team", (req, res) => {
    const { name, role, avatar } = req.body;
    const result = db.prepare("INSERT INTO team (name, role, avatar) VALUES (?, ?, ?)").run(name, role, avatar);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/team/:id", (req, res) => {
    const { name, role, avatar } = req.body;
    db.prepare("UPDATE team SET name = ?, role = ?, avatar = ? WHERE id = ?").run(name, role, avatar, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/team/:id", (req, res) => {
    db.prepare("DELETE FROM team WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Operations
  app.get("/api/operations", (req, res) => {
    res.json(db.prepare("SELECT * FROM operations").all());
  });

  app.post("/api/operations", (req, res) => {
    const { code, description, status } = req.body;
    const result = db.prepare("INSERT INTO operations (code, description, status) VALUES (?, ?, ?)").run(code, description, status || 'Aguardando');
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/operations/:id", (req, res) => {
    const { code, description, status } = req.body;
    db.prepare("UPDATE operations SET code = ?, description = ?, status = ? WHERE id = ?").run(code, description, status, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/operations/:id", (req, res) => {
    db.prepare("DELETE FROM operations WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Production Orders
  app.get("/api/orders", (req, res) => {
    res.json(db.prepare(`
      SELECT po.*, p.name as product_name 
      FROM production_orders po 
      JOIN products p ON po.product_id = p.id
    `).all());
  });

  app.post("/api/orders", (req, res) => {
    const { code, product_id, quantity, entry_date, delivery_date, priority } = req.body;
    const result = db.prepare(`
      INSERT INTO production_orders (code, product_id, quantity, entry_date, delivery_date, priority) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, product_id, quantity, entry_date, delivery_date, priority);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/orders/:id", (req, res) => {
    const { code, product_id, quantity, delivery_date, priority, status } = req.body;
    db.prepare(`
      UPDATE production_orders 
      SET code = ?, product_id = ?, quantity = ?, delivery_date = ?, priority = ?, status = ? 
      WHERE id = ?
    `).run(code, product_id, quantity, delivery_date, priority, status, req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/orders/:id/status", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE production_orders SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/orders/:id", (req, res) => {
    db.prepare("DELETE FROM production_orders WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Production Logs (Apontamentos)
  app.get("/api/production-logs", (req, res) => {
    res.json(db.prepare(`
      SELECT pl.*, po.id as order_id, po.code as order_code, p.name as product_name, t.name as operator_name, o.description as operation_name
      FROM production_logs pl
      JOIN production_orders po ON pl.order_id = po.id
      JOIN products p ON po.product_id = p.id
      JOIN team t ON pl.operator_id = t.id
      JOIN operations o ON pl.operation_id = o.id
    `).all());
  });

  app.post("/api/production-logs", (req, res) => {
    const { order_id, operator_id, operation_id } = req.body;
    const result = db.prepare(`
      INSERT INTO production_logs (order_id, operator_id, operation_id, status) 
      VALUES (?, ?, ?, 'Aguardando')
    `).run(order_id, operator_id, operation_id);
    res.json({ id: result.lastInsertRowid });
  });

  app.post("/api/production-logs/start", (req, res) => {
    const { order_id, operator_id, operation_id } = req.body;
    const start_time = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO production_logs (order_id, operator_id, operation_id, start_time, status) 
      VALUES (?, ?, ?, ?, 'Em Produção')
    `).run(order_id, operator_id, operation_id, start_time);
    
    // Also update order status if it was planned
    db.prepare("UPDATE production_orders SET status = 'Em Produção' WHERE id = ? AND status = 'Planejado'").run(order_id);
    
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/production-logs/:id", (req, res) => {
    const { order_id, operator_id, operation_id, status, start_time, end_time } = req.body;
    db.prepare(`
      UPDATE production_logs 
      SET order_id = ?, operator_id = ?, operation_id = ?, status = ?, start_time = ?, end_time = ? 
      WHERE id = ?
    `).run(order_id, operator_id, operation_id, status, start_time, end_time, req.params.id);
    res.json({ success: true });
  });

  app.patch("/api/production-logs/:id/status", (req, res) => {
    const { status } = req.body;
    const now = new Date().toISOString();
    
    if (status === 'Em Produção') {
      // If moving to production, set start_time if not already set, and clear end_time
      db.prepare(`
        UPDATE production_logs 
        SET status = ?, 
            start_time = COALESCE(start_time, ?), 
            end_time = NULL 
        WHERE id = ?
      `).run(status, now, req.params.id);
      
      // Update order status too
      const log = db.prepare("SELECT order_id FROM production_logs WHERE id = ?").get() as any;
      if (log) {
        db.prepare("UPDATE production_orders SET status = 'Em Produção' WHERE id = ? AND status = 'Planejado'").run(log.order_id);
      }
    } else if (status === 'Finalizado') {
      // If finishing, set end_time
      db.prepare("UPDATE production_logs SET status = ?, end_time = ? WHERE id = ?").run(status, now, req.params.id);
    } else if (status === 'Aguardando') {
      // If reverting to waiting, clear both times
      db.prepare("UPDATE production_logs SET status = ?, start_time = NULL, end_time = NULL WHERE id = ?").run(status, req.params.id);
    } else {
      db.prepare("UPDATE production_logs SET status = ? WHERE id = ?").run(status, req.params.id);
    }
    
    res.json({ success: true });
  });

  app.post("/api/production-logs/:id/finish", (req, res) => {
    const end_time = new Date().toISOString();
    db.prepare("UPDATE production_logs SET end_time = ?, status = 'Finalizado' WHERE id = ?").run(end_time, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/production-logs/:id", (req, res) => {
    db.prepare("DELETE FROM production_logs WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
