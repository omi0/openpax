const pool = require("../db");

async function getAllClients() {
  const result = await pool.query(`
    SELECT * FROM clienti ORDER BY created_at DESC
  `);
  return result.rows;
}

async function getClientById(id) {
  const result = await pool.query(
    `SELECT * FROM clienti WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function createClient(data) {
  const {
    nome,
    cognome,
    email,
    telefono,
    vip = false,
    note,
    allergie,
    preferenze,
    consenso_privacy,
    consenso_newsletter = false,
    fonte = "website",
    ip_address,
  } = data;

  const result = await pool.query(
    `INSERT INTO clienti (
      nome, cognome, email, telefono, vip, note, allergie, preferenze,
      consenso_privacy, consenso_newsletter, fonte, ip_address
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
    ) RETURNING *`,
    [
      nome,
      cognome,
      email,
      telefono,
      vip,
      note,
      allergie,
      preferenze,
      consenso_privacy,
      consenso_newsletter,
      fonte,
      ip_address,
    ]
  );

  return result.rows[0];
}


async function updateClient(id, data) {
   // TODO: finish this
}


async function deleteClient(id) {
  await pool.query(`DELETE FROM clienti WHERE id = $1`, [id]);
  return { message: "Client deleted" };
}

module.exports = {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
};