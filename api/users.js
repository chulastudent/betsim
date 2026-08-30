const { db } = require("./_db.js");

module.exports = async (req, res) => {
  try {
    const client = await db();
    if (req.method === "GET") {
      const { rows } = await client.query("SELECT id, name, created_at FROM profiles ORDER BY created_at ASC");
      return res.status(200).json(rows.map(({ id, name, created_at }) => ({ id, name, createdAt: Number(created_at) })));
    }
    if (req.method === "POST") {
      const { id, name, createdAt } = req.body || {};
      if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "A profile id and name are required." });
      }
      const { rows } = await client.query(
        "INSERT INTO profiles (id, name, created_at) VALUES ($1, $2, $3) RETURNING id, name, created_at",
        [id, name.trim(), Number(createdAt) || Date.now()]
      );
      return res.status(201).json({ id: rows[0].id, name: rows[0].name, createdAt: Number(rows[0].created_at) });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "That name is already taken." });
    console.error(error);
    const message = error.message === "DATABASE_URL is not configured."
      ? error.message
      : `Database request failed${error.code ? ` (${error.code})` : ""}.`;
    return res.status(500).json({ error: message });
  }
};
