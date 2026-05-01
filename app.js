const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const Database = require("better-sqlite3");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));


const db = new Database(path.join(__dirname, "database.db"));

// Create tables
db.prepare(`
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total REAL NOT NULL,
    date TEXT NOT NULL
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
)
`).run();

const EXPORTS_DIR = path.join(__dirname, "exports");
const NPT_OFFSET_MINUTES = 5 * 60 + 45;

const ensureExportsDir = () => {
    if (!fs.existsSync(EXPORTS_DIR)) {
        fs.mkdirSync(EXPORTS_DIR, { recursive: true });
    }
};

const getNepalTime = () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + NPT_OFFSET_MINUTES * 60000);
};

const formatNptDateTime = (date = getNepalTime()) => {
    const pad = (value) => value.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatNptDate = (date = getNepalTime()) => {
    const pad = (value) => value.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const createWorkbook = (sheetName, columns, rows) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns;

    rows.forEach((row) => worksheet.addRow(row));
    return workbook;
};

const exportInventoryFile = async (filename) => {
    const products = db.prepare("SELECT * FROM products ORDER BY id").all();
    const workbook = createWorkbook("Products", [
        { header: "ID", key: "id", width: 10 },
        { header: "Name", key: "name", width: 25 },
        { header: "SKU", key: "sku", width: 20 },
        { header: "Price", key: "price", width: 12 },
        { header: "Quantity", key: "quantity", width: 12 },
    ], products);
    await workbook.xlsx.writeFile(filename);
};

const exportSalesFile = async (filename) => {
    const sales = db.prepare("SELECT * FROM sales ORDER BY date DESC").all();
    const workbook = createWorkbook("Sales", [
        { header: "ID", key: "id", width: 10 },
        { header: "Total", key: "total", width: 12 },
        { header: "Date", key: "date", width: 24 },
    ], sales);
    await workbook.xlsx.writeFile(filename);
};

const autoSaveLatestFiles = async () => {
    ensureExportsDir();
    await exportInventoryFile(path.join(EXPORTS_DIR, "latest-inventory.xlsx"));
    await exportSalesFile(path.join(EXPORTS_DIR, "latest-sales.xlsx"));
};

const saveDailySnapshot = async (dateString) => {
    ensureExportsDir();
    await exportInventoryFile(path.join(EXPORTS_DIR, `inventory-${dateString}.xlsx`));
    await exportSalesFile(path.join(EXPORTS_DIR, `sales-${dateString}.xlsx`));
};

let currentNptDate = formatNptDate();

const scheduleDailyReset = () => {
    setInterval(async () => {
        const today = formatNptDate();
        if (today !== currentNptDate) {
            try {
                await saveDailySnapshot(currentNptDate);
                db.prepare("DELETE FROM sale_items").run();
                db.prepare("DELETE FROM sales").run();
                currentNptDate = today;
                await autoSaveLatestFiles();
                console.log(`Date changed to ${today}, sales reset and daily snapshot saved.`);
            } catch (err) {
                console.error("Daily reset failed:", err);
            }
        }
    }, 60000);
};

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "App.html"));
});

// 🔹 Get Products
app.get("/api/products", (req, res) => {
    try {
        const products = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Add Product
app.post("/api/products", async (req, res) => {
    const { name, sku, price, quantity } = req.body;
    try {
        const result = db.prepare(`
            INSERT INTO products (name, sku, price, quantity)
            VALUES (?, ?, ?, ?)
        `).run(name, sku, price, quantity);
        await autoSaveLatestFiles();
        res.json({ id: result.lastInsertRowid, name, sku, price, quantity });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 🔹 Update Product
app.put("/api/products/:id", async (req, res) => {
    const { id } = req.params;
    const { name, sku, price, quantity } = req.body;
    try {
        const result = db.prepare(`
            UPDATE products SET name = ?, sku = ?, price = ?, quantity = ?
            WHERE id = ?
        `).run(name, sku, price, quantity, id);
        if (result.changes === 0) return res.status(404).json({ error: "Product not found" });
        await autoSaveLatestFiles();
        res.json({ id: Number(id), name, sku, price, quantity });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 🔹 Delete Product
app.delete("/api/products/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
        if (result.changes === 0) return res.status(404).json({ error: "Product not found" });
        await autoSaveLatestFiles();
        res.json({ deleted: Number(id) });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 🔹 Get Sales
app.get("/api/sales", (req, res) => {
    try {
        const sales = db.prepare("SELECT * FROM sales ORDER BY date DESC").all();
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Get Sale Items
app.get("/api/sales/:id", (req, res) => {
    const { id } = req.params;
    try {
        const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(id);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Create Sale (Billing)
app.post("/api/sales", async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Cart must contain at least one item." });
    }

    let total = 0;
    for (let item of items) {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.id);
        if (!product) return res.status(400).json({ error: `Product with id ${item.id} not found.` });
        if (product.quantity < item.quantity) return res.status(400).json({ error: `Insufficient stock for ${product.name}.` });
        total += product.price * item.quantity;
    }

    const saleDate = formatNptDateTime();

    const transaction = db.transaction(() => {
        const saleResult = db.prepare(`
            INSERT INTO sales (total, date)
            VALUES (?, ?)
        `).run(total, saleDate);
        const saleId = saleResult.lastInsertRowid;

        for (let item of items) {
            const product = db.prepare("SELECT * FROM products WHERE id = ?").get(item.id);
            db.prepare(`
                UPDATE products SET quantity = quantity - ? WHERE id = ?
            `).run(item.quantity, item.id);
            db.prepare(`
                INSERT INTO sale_items (sale_id, product_id, name, sku, price, quantity)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(saleId, item.id, product.name, product.sku, product.price, item.quantity);
        }

        return saleId;
    });

    try {
        const saleId = transaction();
        await autoSaveLatestFiles();
        res.json({ saleId, total, items, date: saleDate });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 🔹 Export Products to CSV
app.get("/api/export/products/csv", (req, res) => {
    try {
        const products = db.prepare("SELECT * FROM products ORDER BY id").all();
        let csv = "ID,Name,SKU,Price,Quantity\n";
        products.forEach(p => {
            csv += `${p.id},"${p.name}","${p.sku}",${p.price},${p.quantity}\n`;
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=products.csv");
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Export Sales to CSV
app.get("/api/export/sales/csv", (req, res) => {
    try {
        const sales = db.prepare("SELECT * FROM sales ORDER BY date DESC").all();
        let csv = "ID,Total,Date\n";
        sales.forEach(s => {
            csv += `${s.id},${s.total},"${s.date}"\n`;
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=sales.csv");
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Export Products to XLS
app.get("/api/export/products/xls", async (req, res) => {
    try {
        const products = db.prepare("SELECT * FROM products ORDER BY id").all();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Products");
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Name", key: "name", width: 20 },
            { header: "SKU", key: "sku", width: 15 },
            { header: "Price", key: "price", width: 10 },
            { header: "Quantity", key: "quantity", width: 10 },
        ];
        products.forEach(p => worksheet.addRow(p));
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=products.xlsx");
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🔹 Export Sales to XLS
app.get("/api/export/sales/xls", async (req, res) => {
    try {
        const sales = db.prepare("SELECT * FROM sales ORDER BY date DESC").all();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Sales");
        worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "Total", key: "total", width: 10 },
            { header: "Date", key: "date", width: 20 },
        ];
        sales.forEach(s => worksheet.addRow(s));
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=sales.xlsx");
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

ensureExportsDir();
autoSaveLatestFiles().catch((err) => console.error("Failed to auto-save latest files:", err));
scheduleDailyReset();

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
