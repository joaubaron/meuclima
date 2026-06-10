export default async function handler(req, res) {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat e lon obrigatórios' });

  const key = process.env.WEATHERAPI_KEY;
  const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${lat},${lon}&lang=pt`;

  const upstream = await fetch(url);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
