// src/models/MeliToken.js
const mongoose = require("mongoose");

const MeliTokenSchema = new mongoose.Schema(
    {
        userId: { type: String, unique: true, default: "default" },
        accessToken: String,
        refreshToken: String,
        expiresAt: Date,
    },
    { timestamps: true }
);

module.exports = mongoose.model("MeliToken", MeliTokenSchema);
