const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = { key: null, data: null, expires: 0 };

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return res.status(500).json({ error: "FOOTBALL_DATA_TOKEN is not configured on the server." });
  }

  const requestedDays = Number(req.query.days);
  const days = Math.min(Math.max(Number.isFinite(requestedDays) ? requestedDays : 10, 1), 30);
  const from = new Date();
  const to = new Date();
  to.setUTCDate(to.getUTCDate() + days);
  const dateFrom = formatDate(from);
  const dateTo = formatDate(to);
  const cacheKey = dateFrom + "_" + dateTo;

  if (cache.key === cacheKey && cache.expires > Date.now()) {
    return res.status(200).json(cache.data);
  }

  try {
    const response = await fetch(
      FOOTBALL_DATA_BASE + "/competitions/PL/matches?dateFrom=" + encodeURIComponent(dateFrom)
        + "&dateTo=" + encodeURIComponent(dateTo) + "&status=SCHEDULED",
      { headers: { "X-Auth-Token": token } }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "football-data.org returned " + response.status + "." });
    }

    const body = await response.json();
    const payload = {
      matches: (body.matches || []).map((match) => ({
        id: match.id,
        utcDate: match.utcDate,
        matchday: match.matchday,
        homeTeam: {
          name: match.homeTeam?.shortName || match.homeTeam?.name || "TBD",
          crest: match.homeTeam?.crest || null,
        },
        awayTeam: {
          name: match.awayTeam?.shortName || match.awayTeam?.name || "TBD",
          crest: match.awayTeam?.crest || null,
        },
      })),
    };

    cache = { key: cacheKey, data: payload, expires: Date.now() + CACHE_TTL_MS };
    return res.status(200).json(payload);
  } catch (error) {
    console.error("football-data.org request failed", error);
    return res.status(502).json({ error: "Could not reach football-data.org." });
  }
};
