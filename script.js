const API = "http://localhost:3000";
let editingProductId = null;
let cart = [];
let allProducts = [];
const LOW_STOCK_THRESHOLD = 5;
const NPT_OFFSET_MINUTES = 5 * 60 + 45;

const elements = {
    name: document.getElementById("name"),
    sku: document.getElementById("sku"),
    price: document.getElementById("price"),
    qty: document.getElementById("qty"),
    saveProduct: document.getElementById("saveProduct"),
    clearProduct: document.getElementById("clearProduct"),
    productMessage: document.getElementById("productMessage"),
    productTable: document.getElementById("productTable"),
    productSearch: document.getElementById("productSearch"),
    productSelect: document.getElementById("productSelect"),
    cartQty: document.getElementById("cartQty"),
    cartTable: document.getElementById("cartTable"),
    cartTotal: document.getElementById("cartTotal"),
    billingMessage: document.getElementById("billingMessage"),
    salesTable: document.getElementById("salesTable"),
    inventoryTabBtn: document.getElementById("inventoryTabBtn"),
    billingTabBtn: document.getElementById("billingTabBtn"),
    productCount: document.getElementById("productCount"),
    salesCount: document.getElementById("salesCount"),
    revenueTotal: document.getElementById("revenueTotal"),
    lowStockCount: document.getElementById("lowStockCount"),
    clock: document.getElementById("clock"),
};

const getNepalTime = () => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + NPT_OFFSET_MINUTES * 60000);
};

const pad = (value) => value.toString().padStart(2, "0");

const updateClock = () => {
    const now = getNepalTime();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    elements.clock.textContent = `${date} ${time} GMT+5:45`;
};

const showSection = (section) => {
    const inventoryPage = document.getElementById("inventoryPage");
    const billingPage = document.getElementById("billingPage");
    const isInventory = section === "inventory";

    inventoryPage.style.display = isInventory ? "block" : "none";
    billingPage.style.display = isInventory ? "none" : "block";
    elements.inventoryTabBtn.classList.toggle("active", isInventory);
    elements.billingTabBtn.classList.toggle("active", !isInventory);
};

const showMessage = (element, message, isError = false) => {
    element.textContent = message;
    element.classList.toggle("error", isError);
    if (message) {
        setTimeout(() => {
            element.textContent = "";
            element.classList.remove("error");
        }, 4000);
    }
};

const resetForm = () => {
    editingProductId = null;
    elements.name.value = "";
    elements.sku.value = "";
    elements.price.value = "";
    elements.qty.value = "";
    elements.saveProduct.textContent = "Save Product";
};

const refreshProductSelect = (products) => {
    elements.productSelect.innerHTML = "";
    if (products.length === 0) {
        elements.productSelect.innerHTML = "<option value=''>No products available</option>";
        return;
    }
    elements.productSelect.innerHTML = "<option value=''>Select product</option>";
    products.forEach((product) => {
        const option = document.createElement("option");
        option.value = product.id;
        option.textContent = `${product.name} (${product.sku}) — ${product.quantity} in stock`;
        option.dataset.price = product.price;
        option.dataset.name = product.name;
        option.dataset.sku = product.sku;
        elements.productSelect.appendChild(option);
    });
};

const updateSummaryCards = (products, sales) => {
    const lowStockCount = products.filter((p) => p.quantity <= LOW_STOCK_THRESHOLD).length;
    const revenueTotal = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

    elements.productCount.textContent = products.length;
    elements.salesCount.textContent = sales.length;
    elements.revenueTotal.textContent = revenueTotal.toFixed(2);
    elements.lowStockCount.textContent = lowStockCount;
};

const renderProductTable = (products) => {
    const query = elements.productSearch.value.trim().toLowerCase();
    elements.productTable.innerHTML = "";
    products
        .filter((product) => {
            if (!query) return true;
            return (
                product.name.toLowerCase().includes(query) ||
                product.sku.toLowerCase().includes(query)
            );
        })
        .forEach((product) => {
            const row = document.createElement("tr");
            const isLowStock = product.quantity <= LOW_STOCK_THRESHOLD;
            row.innerHTML = `
                <td>${product.id}</td>
                <td>${product.name}</td>
                <td>${product.sku}</td>
                <td>${product.price.toFixed(2)}</td>
                <td class="${isLowStock ? "low-stock" : ""}">${product.quantity}</td>
                <td>
                    <button onclick="editProduct(${product.id})">Edit</button>
                    <button onclick="deleteProduct(${product.id})" class="secondary">Delete</button>
                </td>
            `;
            elements.productTable.appendChild(row);
        });
};

const loadProducts = () => {
    fetch(`${API}/api/products`)
        .then((res) => res.json())
        .then((products) => {
            allProducts = products;
            renderProductTable(allProducts);
            refreshProductSelect(products);
            if (window.salesData) {
                updateSummaryCards(products, window.salesData);
            }
        })
        .catch((err) => showMessage(elements.productMessage, err.message || err, true));
};

const saveProduct = () => {
    const product = {
        name: elements.name.value.trim(),
        sku: elements.sku.value.trim(),
        price: Number(elements.price.value),
        quantity: Number(elements.qty.value),
    };

    if (!product.name || !product.sku || !product.price || !product.quantity) {
        return showMessage(elements.productMessage, "All product fields are required.", true);
    }

    const url = editingProductId ? `${API}/api/products/${editingProductId}` : `${API}/api/products`;
    const method = editingProductId ? "PUT" : "POST";

    fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
    })
        .then((res) => res.json())
        .then((data) => {
            if (data.error) throw new Error(data.error);
            showMessage(elements.productMessage, editingProductId ? "Product updated." : "Product added.");
            resetForm();
            loadProducts();
        })
        .catch((err) => showMessage(elements.productMessage, err.message || err, true));
};

const editProduct = (id) => {
    fetch(`${API}/api/products`)
        .then((res) => res.json())
        .then((products) => {
            const product = products.find((p) => p.id === id);
            if (!product) return showMessage(elements.productMessage, "Product not found.", true);
            editingProductId = id;
            elements.name.value = product.name;
            elements.sku.value = product.sku;
            elements.price.value = product.price;
            elements.qty.value = product.quantity;
            elements.saveProduct.textContent = "Update Product";
        })
        .catch((err) => showMessage(elements.productMessage, err.message || err, true));
};

const deleteProduct = (id) => {
    if (!confirm("Delete this product?")) return;
    fetch(`${API}/api/products/${id}`, { method: "DELETE" })
        .then((res) => res.json())
        .then((data) => {
            if (data.error) throw new Error(data.error);
            showMessage(elements.productMessage, "Product deleted.");
            loadProducts();
        })
        .catch((err) => showMessage(elements.productMessage, err.message || err, true));
};

const getSelectedProduct = () => {
    const option = elements.productSelect.selectedOptions[0];
    if (!option || !option.value) return null;
    return {
        id: Number(option.value),
        name: option.dataset.name,
        sku: option.dataset.sku,
        price: Number(option.dataset.price),
    };
};

const addToCart = () => {
    const product = getSelectedProduct();
    const quantity = Number(elements.cartQty.value);

    if (!product) return showMessage(elements.billingMessage, "Please select a product.", true);
    if (!quantity || quantity < 1) return showMessage(elements.billingMessage, "Enter a valid quantity.", true);

    const existing = cart.find((item) => item.id === product.id);
    if (existing) {
        existing.quantity += quantity;
    } else {
        cart.push({ ...product, quantity });
    }
    elements.cartQty.value = "";
    renderCart();
};

const renderCart = () => {
    elements.cartTable.innerHTML = "";
    let total = 0;

    cart.forEach((item, index) => {
        const row = document.createElement("tr");
        const subtotal = item.price * item.quantity;
        total += subtotal;
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.price.toFixed(2)}</td>
            <td>${item.quantity}</td>
            <td>${subtotal.toFixed(2)}</td>
            <td><button onclick="removeCartItem(${index})" class="secondary">Remove</button></td>
        `;
        elements.cartTable.appendChild(row);
    });
    elements.cartTotal.textContent = total.toFixed(2);
};

const removeCartItem = (index) => {
    cart.splice(index, 1);
    renderCart();
};

const checkoutSale = () => {
    if (cart.length === 0) return showMessage(elements.billingMessage, "Cart is empty.", true);

    fetch(`${API}/api/sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart }),
    })
        .then((res) => res.json())
        .then((data) => {
            if (data.error) throw new Error(data.error);
            cart = [];
            renderCart();
            loadProducts();
            loadSales();
            showMessage(elements.billingMessage, `Sale completed: $${data.total.toFixed(2)}`);
        })
        .catch((err) => showMessage(elements.billingMessage, err.message || err, true));
};

const loadSales = () => {
    fetch(`${API}/api/sales`)
        .then((res) => res.json())
        .then((sales) => {
            window.salesData = sales;
            elements.salesTable.innerHTML = "";
            sales.forEach((sale) => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${sale.id}</td>
                    <td>${sale.total.toFixed(2)}</td>
                    <td>${sale.date}</td>
                `;
                elements.salesTable.appendChild(row);
            });
            updateSummaryCards(allProducts, sales);
        })
        .catch((err) => showMessage(elements.billingMessage, err.message || err, true));
};

const exportProducts = (format) => {
    window.open(`${API}/api/export/products/${format}`, "_blank");
};

const exportSales = (format) => {
    window.open(`${API}/api/export/sales/${format}`, "_blank");
};

window.onload = () => {
    elements.saveProduct.addEventListener("click", saveProduct);
    elements.clearProduct.addEventListener("click", resetForm);
    elements.inventoryTabBtn.addEventListener("click", () => showSection("inventory"));
    elements.billingTabBtn.addEventListener("click", () => showSection("billing"));
    elements.productSearch.addEventListener("input", () => renderProductTable(allProducts));
    updateClock();
    setInterval(updateClock, 1000);
    showSection("inventory");
    loadProducts();
    loadSales();
};