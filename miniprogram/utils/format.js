function pad(value) {
  return String(value).padStart(2, '0');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameYear = now.getFullYear() === date.getFullYear();
  const datePart = sameYear
    ? `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function groupParcels(parcels) {
  const groups = new Map();
  for (const parcel of parcels) {
    const station = parcel.station || '驿站待识别';
    if (!groups.has(station)) groups.set(station, []);
    groups.get(station).push({
      ...parcel,
      displayTime: formatTime(parcel.occurredAt),
      hasCode: Boolean(parcel.pickupCode),
      statusLabel: parcel.status === 'picked' ? '已取' : parcel.status === 'archived' ? '已归档' : '待取'
    });
  }
  return [...groups.entries()].map(([station, items]) => ({
    station,
    count: items.length,
    items
  }));
}

module.exports = {
  formatTime,
  groupParcels
};

