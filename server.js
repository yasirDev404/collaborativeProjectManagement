import dotenv from "dotenv";
dotenv.config();
import app from "./app.js";
import { connect } from "mongoose";
const PORT = 3000;

connect("mongodb://localhost:27017/cpm")
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  
  .catch((err) => console.error("❌ MongoDB connection error:", err));
