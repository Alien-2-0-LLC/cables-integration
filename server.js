// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/cables-stock";

mongoose.connection.on('connected', () => console.log("✅ MongoDB connected"));
mongoose.connection.on('disconnected', () => console.warn("⚠️ MongoDB disconnected"));
mongoose.connection.on('reconnected', () => console.log("🔄 MongoDB reconnected"));
mongoose.connection.on('error', (err) => console.error("❌ MongoDB connection error:", err));

async function connectWithRetry() {
    try {
        await mongoose.connect(MONGODB_URI, {
            // fail fast so the 5s retry loop drives reconnection cadence
            serverSelectionTimeoutMS: 5000,
        });
    } catch (err) {
        console.error("❌ MongoDB initial connect failed, retrying in 5s...", err.message);
        setTimeout(connectWithRetry, 5000);
    }
}

connectWithRetry();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// *MERCADO LIBRE*
const MercadoLibreService = require('./src/services/mercadolibre/meliService');
const meliService = new MercadoLibreService();

// Schedule a cron job to run every 5 hours to check the token expiration
cron.schedule("0 */5 * * *", async () => {
    console.log("🕒 Running scheduled token refresh...");
    try {
        await meliService.automaticAccessToken();
        console.log("✅ Token refreshed via cron");
    } catch (err) {
        console.error("❌ Cron token refresh failed:", err.message);
    }
});


// *ODOO*
const odooService = require('./src/services/odooService');
const odooSer = new odooService();

app.use('/api/meli', require('./src/routes/meliRoutes')(meliService));
app.use('/api/sync', require('./src/routes/odooRoutes.js')(odooSer, meliService));


/* const AmazonService = require('./src/services/amazon/amazonService'); */
/* const ShopifyService = require('./src/services/shopify/shopifyService'); */

// Initialize services
/* const amazonService = new AmazonService(); */
/* const shopifyService = new ShopifyService(); */

// Routes
/* app.use('/api/amazon', require('./src/routes/amazonRoutes')(amazonService)); */
/* app.use('/api/shopify', require('./src/routes/shopifyRoutes')(shopifyService)); */


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Integration hub running on port ${PORT}`);
});

cron.schedule("0 0 * * *", async () => {
    console.log("🕒 Running scheduled inventory check...");

    try {
        const response = await axios.get(`http://localhost:${PORT}/api/meli/check-inventory`);
        console.log("✅ Inventory check result:", response.data);
    } catch (err) {
        console.error("❌ Error in inventory check cron job:", err.message);
    }
});
