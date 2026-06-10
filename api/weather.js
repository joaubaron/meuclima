// Esse arquivo vai pro GitHub - é seguro!
export default async function handler(req, res) {
  const API_KEY = process.env.WEATHERAPI_KEY; // ← Só uma variável
  
  const { path, lat, lon } = req.query;
  const url = `https://api.weatherapi.com/v1/${path}.json?key=${API_KEY}&q=${lat},${lon}&lang=pt`;
  
  const response = await fetch(url);
  const data = await response.json();
  res.json(data);
}
