const express = require("express")

const authenticate = require("./middleware/authenticate");

const clientRoutes = require("./routes/clients.routes");
const layoutRoutes = require("./routes/layouts.routes");
const tableRoutes = require("./routes/tables.routes");
const userRoutes = require("./routes/users.routes");

const PORT = 3000;

const app = express();
app.use(express.json());


app.use("/api", authenticate);

// routes
app.use("/api/clients", clientRoutes);
app.use("/api/layouts", layoutRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/users", userRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});