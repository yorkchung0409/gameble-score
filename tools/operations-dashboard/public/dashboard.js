const countFormatter = new Intl.NumberFormat('zh-CN');
const amountFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);
let refreshTimer = null;

function setText(id, value) { $(id).textContent = value; }
function formatDate(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'; }

function renderRooms(containerId, rooms, overdue) {
  const container = $(containerId);
  container.replaceChildren();
  if (!rooms.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = overdue ? '没有待归档异常房间' : '暂无麻将房数据';
    container.append(empty);
    return;
  }
  for (const room of rooms) {
    const row = document.createElement('div');
    row.className = 'data-row';
    const main = document.createElement('div');
    main.className = 'data-main';
    const name = document.createElement('span');
    name.className = 'data-name';
    name.textContent = `房间 ${room.roomCode}`;
    const note = document.createElement('span');
    note.className = 'data-note';
    note.textContent = overdue ? room.name : `${room.mode === 'seated' ? '坐下模式' : '普通模式'} · ${room.transactionCount} 笔流水`;
    main.append(name, note);
    const time = document.createElement('span');
    time.className = 'data-time';
    time.textContent = formatDate(room.lastActivityAt);
    row.append(main, time);
    container.append(row);
  }
}

function render(data) {
  setText('userTotal', countFormatter.format(data.users.total));
  setText('userNew24', countFormatter.format(data.users.new24Hours));
  setText('userActive5', countFormatter.format(data.users.active5Minutes));
  setText('mahjongTotal', countFormatter.format(data.rooms.mahjongTotal));
  setText('mahjongActive', countFormatter.format(data.rooms.mahjongActive30Minutes));
  setText('pokerTotal', countFormatter.format(data.rooms.pokerLedgerTotal));
  setText('pokerActive', countFormatter.format(data.rooms.pokerActive30Minutes));
  setText('txHour', countFormatter.format(data.transactions.lastHour));
  setText('txDay', countFormatter.format(data.transactions.last24Hours));
  setText('reversalDay', countFormatter.format(data.transactions.reversals24Hours));
  setText('teaFeeCount', countFormatter.format(data.transactions.teaFeeCount24Hours));
  setText('teaFeeAmount', amountFormatter.format(data.transactions.teaFeeAmount24Hours));
  setText('updatedAt', `更新于 ${formatDate(data.generatedAt)}`);
  renderRooms('recentRooms', data.recentMahjongRooms || [], false);
  renderRooms('overdueRooms', data.overdueMahjongRooms || [], true);
}

async function loadOverview() {
  const button = $('refreshButton');
  const error = $('errorMessage');
  button.disabled = true;
  error.hidden = true;
  try {
    const response = await fetch('/api/overview', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || '读取运营数据失败');
    render(payload);
  } catch (loadError) {
    error.textContent = loadError.message || '读取运营数据失败';
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

$('refreshButton').addEventListener('click', loadOverview);
$('autoRefresh').addEventListener('change', (event) => {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = event.target.checked ? setInterval(loadOverview, 60_000) : null;
});
loadOverview();
