import express from "express";
import userRoutes from "./routes/userRoutes.js";
import workspaceRoutes from "./routes/workspaceRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";


const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`📍 ${req.method} ${req.originalUrl}`);
  next();
});
// Add this BEFORE all your routes
app.use((req, res, next) => {
  console.log("==========================================");
  console.log("📨 INCOMING REQUEST");
  console.log("==========================================");
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Path:", req.path);
  console.log("Base URL:", req.baseUrl);
  console.log("Headers:", req.headers);
  console.log("==========================================");
  next();
});

app.use("/api/user", userRoutes);
app.use("/api/workspace", workspaceRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/task", taskRoutes);

export default app;