const clientsService = require("../services/clients.service");

async function getClients(req, res) {
  const data = await clientsService.getAllClients();
  res.json(data);
}

async function getClient(req, res) {
  const client = await clientsService.getClientById(req.params.id);
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
}

async function addClient(req, res) {
  if (!req.body.consenso_privacy) {
    return res.status(400).json({ error: "Privacy consent required" });
  }
  const newClient = await clientsService.createClient(req.body);
  res.status(201).json(newClient);
}

async function updateClient(req, res) {
  const updated = await clientsService.updateClient(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Client not found" });
  res.json(updated);
}

async function deleteClient(req, res) {
  await clientsService.deleteClient(req.params.id);
  res.status(204).end();
}

module.exports = {
  getClients,
  getClient,
  addClient,
  updateClient,
  deleteClient,
};