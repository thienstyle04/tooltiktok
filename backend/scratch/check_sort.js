function firstHourFromOpenHours(value) {
  const match = String(value ?? '').match(/(\d{1,2})\s*[:hH]\s*(\d{2})|(\d{1,2})/);
  if (!match) return null;
  const hour = Number(match[1] ?? match[3]);
  return Number.isFinite(hour) ? hour : null;
}

const items = [
  { name: 'Bún Bò 35K', openHours: '06:00 - 13:00' },
  { name: 'Miền Du Mục', openHours: '04:00 - 08:00' },
  { name: 'Cà Phê Đi', openHours: '07:30 - 22:00' },
  { name: 'Gạt tàn đời', openHours: '08:00 - 22:00' },
  { name: 'Tiệm nướng lẩu rừng mơ', openHours: '16:00 - 22:00' },
  { name: 'Tiệm nướng Hoàng Hôn', openHours: '17:00 - 23:00' },
  { name: '1/2 Cỉcle Coffee', openHours: '07:00 - 22:00' }
];

items.forEach(i => console.log(i.name, firstHourFromOpenHours(i.openHours)));
