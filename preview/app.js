const query = new URLSearchParams(window.location.search);
if (query.get('session')) {
  localStorage.setItem('sessionToken', query.get('session'));
  window.history.replaceState({}, '', window.location.pathname);
}

const state = {
  sessionToken: localStorage.getItem('sessionToken') || '',
  serverUrl: localStorage.getItem('serverUrl') || window.location.origin,
  status: 'pending',
  polling: null
};

const elements = {
  deviceLabel: document.querySelector('#deviceLabel'),
  summary: document.querySelector('#summary'),
  pairPanel: document.querySelector('#pairPanel'),
  parcelPanel: document.querySelector('#parcelPanel'),
  settingsPanel: document.querySelector('#settingsPanel'),
  pairingCode: document.querySelector('#pairingCode'),
  pairingHint: document.querySelector('#pairingHint'),
  createPairingButton: document.querySelector('#createPairingButton'),
  settingsButton: document.querySelector('#settingsButton'),
  saveSettingsButton: document.querySelector('#saveSettingsButton'),
  resetButton: document.querySelector('#resetButton'),
  serverUrl: document.querySelector('#serverUrl'),
  alert: document.querySelector('#alert'),
  loading: document.querySelector('#loading'),
  groups: document.querySelector('#groups')
};

function api(path, options = {}) {
  return fetch(`${state.serverUrl.replace(/\/+$/, '')}${path}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(state.sessionToken ? { authorization: `Bearer ${state.sessionToken}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
    return data;
  });
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showError(error) {
  elements.alert.textContent = error.message;
  elements.alert.hidden = false;
}

function clearError() {
  elements.alert.textContent = '';
  elements.alert.hidden = true;
}

function groupParcels(parcels) {
  const groups = new Map();
  for (const parcel of parcels) {
    const station = parcel.station || '驿站待识别';
    if (!groups.has(station)) groups.set(station, []);
    groups.get(station).push(parcel);
  }
  return [...groups.entries()];
}

function renderParcels(parcels, deviceName) {
  elements.loading.hidden = true;
  elements.groups.textContent = '';
  elements.deviceLabel.textContent = deviceName || 'Android 采集端';
  const pendingCount = parcels.filter((parcel) => parcel.status === 'pending').length;
  elements.summary.textContent = pendingCount
    ? `共有 ${pendingCount} 件待取，按驿站分组展示。`
    : '当前筛选下没有包裹。';

  if (!parcels.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '这里还没有包裹';
    elements.groups.append(empty);
    return;
  }

  for (const [station, items] of groupParcels(parcels)) {
    const group = document.createElement('section');
    group.className = 'group';

    const heading = document.createElement('div');
    heading.className = 'group-heading';
    const stationName = document.createElement('strong');
    stationName.textContent = station;
    const count = document.createElement('span');
    count.textContent = `${items.length} 件`;
    heading.append(stationName, count);

    const list = document.createElement('div');
    list.className = 'parcel-list';
    for (const parcel of items) list.append(renderParcel(parcel));
    group.append(heading, list);
    elements.groups.append(group);
  }
}

function renderParcel(parcel) {
  const row = document.createElement('article');
  row.className = 'parcel';

  const main = document.createElement('div');
  const top = document.createElement('div');
  top.className = 'parcel-topline';
  const courier = document.createElement('span');
  courier.textContent = parcel.courier || '其他快递';
  const status = document.createElement('span');
  status.className = `status status-${parcel.status}`;
  status.textContent = parcel.status === 'picked' ? '已取' : '待取';
  top.append(courier, status);

  const code = document.createElement('button');
  code.type = 'button';
  code.className = `pickup-code${parcel.pickupCode ? '' : ' empty'}`;
  code.textContent = parcel.pickupCode || '待出码';
  code.addEventListener('click', async () => {
    if (!parcel.pickupCode) return;
    await navigator.clipboard.writeText(parcel.pickupCode);
    code.textContent = '已复制';
    setTimeout(() => {
      code.textContent = parcel.pickupCode;
    }, 700);
  });

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = [
    parcel.orderNumber ? `订单 ${parcel.orderNumber}` : '',
    parcel.trackingNumber ? `运单 ${parcel.trackingNumber}` : ''
  ].filter(Boolean).join(' · ') || '没有订单号或运单号';

  const time = document.createElement('div');
  time.className = 'time';
  time.textContent = formatTime(parcel.occurredAt);
  main.append(top, code, meta, time);
  row.append(main);

  if (parcel.status === 'pending') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picked-button';
    button.textContent = '已取';
    button.addEventListener('click', async () => {
      try {
        await api(`/api/v1/parcels/${parcel.id}`, {
          method: 'PATCH',
          body: { status: 'picked' }
        });
        await loadParcels();
      } catch (error) {
        showError(error);
      }
    });
    row.append(button);
  }
  return row;
}

async function loadParcels() {
  if (!state.sessionToken) {
    elements.pairPanel.hidden = false;
    elements.parcelPanel.hidden = true;
    return;
  }

  clearError();
  elements.pairPanel.hidden = true;
  elements.parcelPanel.hidden = false;
  elements.loading.hidden = false;
  try {
    const result = await api(`/api/v1/parcels?status=${state.status}`);
    renderParcels(result.parcels || [], result.device?.name);
  } catch (error) {
    elements.loading.hidden = true;
    if (/令牌/.test(error.message)) {
      localStorage.removeItem('sessionToken');
      state.sessionToken = '';
      elements.pairPanel.hidden = false;
      elements.parcelPanel.hidden = true;
    }
    showError(error);
  }
}

async function createPairing() {
  clearError();
  elements.createPairingButton.disabled = true;
  try {
    const result = await api('/api/v1/pairings', { method: 'POST' });
    elements.pairingCode.textContent = result.code;
    elements.pairingCode.hidden = false;
    elements.pairingHint.hidden = false;
    pollPairing(result);
  } catch (error) {
    showError(error);
  } finally {
    elements.createPairingButton.disabled = false;
  }
}

function pollPairing(pairing) {
  clearTimeout(state.polling);
  state.polling = setTimeout(async () => {
    try {
      const result = await api(`/api/v1/pairings/${pairing.code}/complete`, {
        method: 'POST',
        body: { pairingToken: pairing.pairingToken }
      });
      if (result.pending) {
        pollPairing(pairing);
        return;
      }
      state.sessionToken = result.sessionToken;
      localStorage.setItem('sessionToken', result.sessionToken);
      elements.pairingHint.textContent = '连接成功，正在加载包裹。';
      await loadParcels();
    } catch (error) {
      showError(error);
    }
  }, 1500);
}

document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    state.status = button.dataset.status;
    loadParcels();
  });
});

elements.createPairingButton.addEventListener('click', createPairing);
elements.settingsButton.addEventListener('click', () => {
  elements.settingsPanel.hidden = !elements.settingsPanel.hidden;
  elements.serverUrl.value = state.serverUrl;
});
elements.saveSettingsButton.addEventListener('click', () => {
  state.serverUrl = elements.serverUrl.value.trim().replace(/\/+$/, '');
  localStorage.setItem('serverUrl', state.serverUrl);
  elements.settingsPanel.hidden = true;
  loadParcels();
});
elements.resetButton.addEventListener('click', () => {
  localStorage.removeItem('sessionToken');
  state.sessionToken = '';
  elements.settingsPanel.hidden = true;
  loadParcels();
});

loadParcels();
