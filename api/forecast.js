export default async function handler(req, res) {
  const { lat, lon, days = 2 } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat e lon obrigatórios' });

  const key = process.env.WEATHERAPI_KEY;
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${lat},${lon}&days=${days}&lang=pt`;

  const upstream = await fetch(url);
  const data = await upstream.json();
  res.status(upstream.status).json(data);
}
