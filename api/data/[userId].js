const { db } = require("../_db.js");

module.exports = async (req, res) => {
  try {
    const client = await db();
    const userId = req.query.userId;
    if (!userId || Array.isArray(userId)) return res.status(400).json({ error: "Invalid profile id." });
    if (req.method === "GET") {
      const { rows } = await client.query("SELECT data FROM ledger_data WHERE profile_id = $1", [userId]);
      return res.status(200).json(rows[0]?.data || { weekends: [] });
    }
    if (req.method === "PUT") {
      const data = req.body;
      if (!data || !Array.isArray(data.weekends)) return res.status(400).json({ error: "Invalid ledger data." });
      await client.query(
        `INSERT INTO ledger_data (profile_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (profile_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [userId, JSON.stringify(data)]
      );
      return res.status(204).end();
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    const message = error.message === "DATABASE_URL is not configured."
      ? error.message
      : `Database request failed${error.code ? ` (${error.code})` : ""}.`;
    return res.status(500).json({ error: message });
  }
};
