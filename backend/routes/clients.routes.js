const express = require("express");
const router = express.Router();
const controller = require("../controllers/clients.controller");

router.get("/", controller.getClients);
router.get("/:id", controller.getClient);
router.post("/", controller.addClient);
router.put("/:id", controller.updateClient);
router.delete("/:id", controller.deleteClient);

module.exports = router;