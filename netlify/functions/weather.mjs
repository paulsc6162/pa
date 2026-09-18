// Weather, from the Met Office where possible.
//
// The key has to stay server-side, so the phone calls this instead of
// calling the Met Office directly. If the Met Office is unreachable, over
// its daily quota, or the key is missing, this falls back to Open-Meteo
// so the brief never simply goes quiet.
//
// Netlify env var (optional):
//   METOFFICE_API_KEY  — from datahub.metoffice.gov.uk, after subscribing
//                        to Site Specific → Global Spot. Free tier is
//                        360 calls a day, which is far more than needed.

const MO_DAILY = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point/daily';

/* Met Office significant weather codes. */
const NCM = {
  0:'clear', 1:'sunny', 2:'partly cloudy', 3:'partly cloudy',
  5:'misty', 6:'foggy', 7:'cloudy', 8:'overcast',
  9:'light showers', 10:'light showers', 11:'drizzle', 12:'light rain',
  13:'heavy showers', 14:'heavy showers', 15:'heavy rain',
  16:'sleet showers', 17:'sleet showers', 18:'sleet',
  19:'hail showers', 20:'hail showers', 21:'hail',
  22:'light snow showers', 23:'light snow showers', 24:'light snow',
  25:'heavy snow showers', 26:'heavy snow showers', 27:'heavy snow',
  28:'thundery showers', 29:'thundery showers', 30:'thunderstorms'
};

const WMO = {
  0:'clear', 1:'mostly clear', 2:'some cloud', 3:'overcast',
  45:'foggy', 48:'freezing fog',
  51:'light drizzle', 53:'drizzle', 55:'heavy drizzle',
  61:'light rain', 63:'rain', 65:'heavy rain',
  71:'light snow', 73:'snow', 75:'heavy snow',
  80:'showers', 81:'showers', 82:'heavy showers',
  95:'thunderstorms', 96:'thunderstorms', 99:'thunderstorms'
};

const round = n => (n === null || n === undefined || isNaN(n)) ? null : Math.round(n);

async function metOffice(lat, lon, key){
  const url = `${MO_DAILY}?latitude=${lat}&longitude=${lon}&excludeParameterMetadata=true`
            + `&includeLocationName=true`;
  const r = await fetch(url, {headers: {apikey: key, accept: 'application/json'}});
  if (!r.ok) throw new Error('metoffice ' + r.status);

  const j = await r.json();
  const f = j.features && j.features[0];
  const series = f && f.properties && f.properties.timeSeries;
  if (!series || !series.length) throw new Error('metoffice empty');

  const days = series.slice(0, 6);
  return {
    source: 'Met Office',
    place: (f.properties && f.properties.location && f.properties.location.name) || null,
    daily: {
      time: days.map(d => (d.time || '').slice(0, 10)),
      text: days.map(d => NCM[d.daySignificantWeatherCode] ||
                          NCM[d.nightSignificantWeatherCode] || 'mixed'),
      hi:   days.map(d => round(d.dayMaxScreenTemperature)),
      lo:   days.map(d => round(d.nightMinScreenTemperature)),
      rain: days.map(d => round(d.dayProbabilityOfPrecipitation)),
      wind: days.map(d => round((d.midday10MWindSpeed || 0) * 2.237))   // m/s → mph
    }
  };
}

async function openMeteo(lat, lon){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,`
    + `precipitation_probability_max,wind_speed_10m_max`
    + `&forecast_days=6&timezone=auto&wind_speed_unit=mph`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('openmeteo ' + r.status);
  const d = (await r.json()).daily;
  return {
    source: 'Open-Meteo',
    place: null,
    daily: {
      time: d.time,
      text: d.weather_code.map(c => WMO[c] || 'mixed'),
      hi:   d.temperature_2m_max.map(round),
      lo:   d.temperature_2m_min.map(round),
      rain: d.precipitation_probability_max.map(round),
      wind: d.wind_speed_10m_max.map(round)
    }
  };
}

export default async (req) => {
  const u = new URL(req.url);
  const lat = parseFloat(u.searchParams.get('lat'));
  const lon = parseFloat(u.searchParams.get('lon'));
  if (isNaN(lat) || isNaN(lon)) return new Response('lat and lon required', {status: 400});

  const key = process.env.METOFFICE_API_KEY;
  let out = null, note = null;

  if (key){
    try { out = await metOffice(lat.toFixed(4), lon.toFixed(4), key); }
    catch (e){ note = String(e.message || e); }
  }
  if (!out){
    try { out = await openMeteo(lat.toFixed(4), lon.toFixed(4)); }
    catch (e){ return new Response(JSON.stringify({error: String(e.message || e)}), {status: 502}); }
  }
  if (note) out.note = note;      // so a quiet fallback is still visible

  return new Response(JSON.stringify(out), {
    headers: {'content-type': 'application/json', 'cache-control': 'no-store'}
  });
};
