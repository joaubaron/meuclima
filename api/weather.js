export default async function handler(req, res) {
  const { lat, lon, days = 2, type = 'current' } = req.query;
  const key = process.env.WEATHER_API_KEY;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Latitude e longitude são obrigatórios' });
  }

  let url = '';

  if (type === 'current') {
    url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${lat},${lon}&lang=pt`;
  } else if (type === 'forecast') {
    url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${lat},${lon}&days=${days}&lang=pt`;
  } else if (type === 'astronomy') {
    const date = req.query.date || 'today';
    url = `https://api.weatherapi.com/v1/astronomy.json?key=${key}&q=${lat},${lon}&dt=${date}`;
  } else {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('Erro ao buscar dados na WeatherAPI:', error);
    return res.status(500).json({ error: 'Erro na requisição da WeatherAPI' });
  }
}
