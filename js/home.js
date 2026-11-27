// 1. Dark Mode
const themeBtn = document.getElementById('theme-toggle');
function applyTheme(isDark) {
  document.body.classList.toggle('dark', isDark);
  themeBtn.textContent = isDark ? '☀️ Chế độ sáng' : '🌙 Chế độ tối';
}
const savedTheme = localStorage.getItem('hub_theme') === 'dark';
applyTheme(savedTheme);
themeBtn.addEventListener('click', () => {
  const next = !document.body.classList.contains('dark');
  localStorage.setItem('hub_theme', next ? 'dark' : 'light');
  applyTheme(next);
});

// 2. Ngày & Giờ TP.HCM (múi giờ Asia/Ho_Chi_Minh)
function updateDateTime() {
  const now = new Date();
  const tz = 'Asia/Ho_Chi_Minh';

  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const get = (type) => (parts.find(p => p.type === type) || {}).value || '';
  const weekdayRaw = get('weekday');
  const weekday = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);
  const day = get('day');
  const month = get('month');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  document.getElementById('today-date').textContent =
    `Hôm nay là ${weekday}, ngày ${day} tháng ${month} năm ${year}`;
  document.getElementById('clock-time').textContent = `${hour}:${minute}:${second}`;

  const h = parseInt(hour, 10);
  let greet = 'Chúc bạn học tập hiệu quả!';
  if (h >= 5 && h < 11) greet = 'Chào buổi sáng ☀️';
  else if (h >= 11 && h < 14) greet = 'Chào buổi trưa 🌤️';
  else if (h >= 14 && h < 18) greet = 'Chào buổi chiều ☕';
  else if (h >= 18 && h < 22) greet = 'Chào buổi tối 🌙';
  else greet = 'Ôn bài khuya nhớ giữ sức khỏe nhé ✨';
  document.getElementById('greeting-text').textContent = greet;
}
updateDateTime();
setInterval(updateDateTime, 1000);

// 3. Thời tiết TP.HCM (Open-Meteo - miễn phí, không cần API key)
function getWeatherMeta(code, isDay) {
  if (code === 0) return { icon: isDay ? '☀️' : '🌙', text: 'Trời quang đãng' };
  if (code === 1) return { icon: isDay ? '🌤️' : '🌙', text: 'Ít mây' };
  if (code === 2) return { icon: '⛅', text: 'Có mây' };
  if (code === 3) return { icon: '☁️', text: 'Nhiều mây' };
  if (code === 45 || code === 48) return { icon: '🌫️', text: 'Có sương mù' };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', text: 'Mưa phùn nhẹ' };
  if ([61, 63, 65, 66, 67].includes(code)) return { icon: '🌧️', text: 'Trời có mưa' };
  if ([80, 81, 82].includes(code)) return { icon: '🌦️', text: 'Mưa rào rải rác' };
  if ([95, 96, 99].includes(code)) return { icon: '⛈️', text: 'Có mưa dông' };
  return { icon: '🌡️', text: 'Thời tiết ổn định' };
}

async function fetchHcmWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=10.8231&longitude=106.6297&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code&timezone=Asia%2FHo_Chi_Minh';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const cur = data.current;
    if (!cur) throw new Error('No data');

    const temp = Math.round(cur.temperature_2m);
    const feelsLike = Math.round(cur.apparent_temperature);
    const humidity = cur.relative_humidity_2m;
    const meta = getWeatherMeta(cur.weather_code, cur.is_day === 1);

    document.getElementById('weather-icon').textContent = meta.icon;
    document.getElementById('weather-temp').textContent = `${temp}°C`;
    document.getElementById('weather-desc').textContent =
      `${meta.text} • Cảm giác ${feelsLike}°C • Độ ẩm ${humidity}%`;
  } catch (e) {
    document.getElementById('weather-icon').textContent = '🌐';
    document.getElementById('weather-temp').textContent = '--°C';
    document.getElementById('weather-desc').textContent = 'Không tải được thời tiết (kiểm tra mạng)';
  }
}
fetchHcmWeather();
setInterval(fetchHcmWeather, 15 * 60 * 1000);

// 4. Tiến độ ôn tập & số lượt thi của 2 môn
function loadSubjectStats(practiceKey, historyKey, total, statId, barId, examsId) {
  try {
    const raw = localStorage.getItem(practiceKey);
    const data = raw ? JSON.parse(raw) : {};
    const answered = data.userAnswers && typeof data.userAnswers === 'object'
      ? Object.keys(data.userAnswers).length
      : 0;
    const pct = Math.min(100, Math.round((answered / total) * 100));
    document.getElementById(statId).textContent = `${answered} / ${total} (${pct}%)`;
    document.getElementById(barId).style.width = `${pct}%`;
  } catch (e) {}

  try {
    const rawHist = localStorage.getItem(historyKey);
    const hist = rawHist ? JSON.parse(rawHist) : [];
    const count = Array.isArray(hist) ? hist.length : 0;
    document.getElementById(examsId).textContent = `📝 Đã thi: ${count} lượt`;
  } catch (e) {}
}

loadSubjectStats('triet_hoc_300_practice_v2', 'triet_hoc_300_exam_history_v2', 300, 'triet-stat', 'triet-bar', 'triet-exams');
loadSubjectStats('pl_shtt_239_practice_v1', 'pl_shtt_239_exam_history_v1', 239, 'pl-stat', 'pl-bar', 'pl-exams');
