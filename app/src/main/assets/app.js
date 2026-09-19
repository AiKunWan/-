// 外卖评价 PWA — 纯前端 + IndexedDB 本地存储
const DB_NAME = 'waimai_pingjia';
const DB_VERSION = 1;
const STORE = 'orders';

// ---------- 数据库 ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('storeKey', 'storeKey', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let db;
async function getAll() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function putOrder(o) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(o);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function deleteOrder(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- 工具 ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

// 选图后自动压缩缩放，控制本地存储体积
function compressImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------- 表单 ----------
let pendingImage = null;
let pendingDishImage = null;
let pendingEditOrder = null; // 编辑中的原订单，null 表示新增
const DRAFT_KEY = 'waimai_draft';

function readForm() {
  return {
    storeName: $('#storeName').value,
    city: $('#city').value,
    platform: $('#platform').value,
    foodType: $('#foodType').value,
    channel: $('#channel').value,
    items: $('#items').value,
    totalPrice: $('#totalPrice').value,
    people: $('#people').value,
    rating: $('#rating').value,
    review: $('#review').value,
    image: pendingImage,
    dishImage: pendingDishImage,
  };
}

function writeForm(d) {
  if (!d) return;
  $('#storeName').value = d.storeName || '';
  $('#city').value = d.city || '';
  $('#platform').value = d.platform || '';
  $('#foodType').value = d.foodType || '';
  $('#channel').value = d.channel || '仅外卖';
  $('#items').value = d.items || '';
  $('#totalPrice').value = d.totalPrice || '';
  $('#people').value = d.people || '1';
  $('#rating').value = d.rating || '5';
  $('#rating-val').textContent = d.rating || '5';
  $('#review').value = d.review || '';
  pendingImage = d.image || null;
  const preview = $('#preview'), pick = $('#pick-btn');
  if (pendingImage) { preview.src = pendingImage; preview.hidden = false; pick.hidden = true; }
  else { preview.hidden = true; pick.hidden = false; }
  pendingDishImage = d.dishImage || null;
  const previewDish = $('#preview-dish'), pickDish = $('#pick-dish-btn');
  if (pendingDishImage) { previewDish.src = pendingDishImage; previewDish.hidden = false; pickDish.hidden = true; }
  else { previewDish.hidden = true; pickDish.hidden = false; }
}

function resetForm() {
  $('#order-form').reset();
  pendingImage = null; pendingDishImage = null; pendingEditOrder = null;
  const preview = $('#preview'), pick = $('#pick-btn');
  preview.hidden = true; preview.src = ''; pick.hidden = false;
  const previewDish = $('#preview-dish'), pickDish = $('#pick-dish-btn');
  previewDish.hidden = true; previewDish.src = ''; pickDish.hidden = false;
  $('#rating-val').textContent = '5';
  const sb = $('#submit-btn'); if (sb) sb.textContent = '保存订单';
}

function hasDraft() { return !!localStorage.getItem(DRAFT_KEY); }
function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(readForm()));
  showDraftBanner(true);
  toast('已暂存草稿');
}
function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  showDraftBanner(false);
}
function showDraftBanner(on) { $('#draft-banner').hidden = !on; }

// ---------- 导入 / 导出 ----------
function exportData() {
  getAll().then((orders) => {
    const blob = new Blob([JSON.stringify(orders, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `waimai-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`已导出 ${orders.length} 条`);
  });
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (e) { toast('文件格式错误'); return; }
    if (!Array.isArray(data)) { toast('不是有效的备份文件'); return; }
    let n = 0;
    const tasks = data.map((o) => {
      if (!o.id) o.id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random() + n));
      if (!o.storeKey && o.storeName && o.city) o.storeKey = o.storeName + '|' + o.city;
      if (!o.date) o.date = Date.now();
      n++;
      return putOrder(o);
    });
    Promise.all(tasks).then(() => { refreshAll(); toast(`已导入 ${n} 条（按 ID 合并）`); });
  };
  reader.readAsText(file);
}

function bindForm() {
  const pick = $('#pick-btn');
  const file = $('#image');
  const preview = $('#preview');
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    toast('处理图片中…');
    try {
      pendingImage = await compressImage(f);
      preview.src = pendingImage; preview.hidden = false; pick.hidden = true;
    } catch (e) {
      toast('图片读取失败');
    }
  });

  const pickDish = $('#pick-dish-btn');
  const fileDish = $('#dish');
  const previewDish = $('#preview-dish');
  pickDish.addEventListener('click', () => fileDish.click());
  fileDish.addEventListener('change', async () => {
    const f = fileDish.files[0];
    if (!f) return;
    toast('处理图片中…');
    try {
      pendingDishImage = await compressImage(f);
      previewDish.src = pendingDishImage; previewDish.hidden = false; pickDish.hidden = true;
    } catch (e) {
      toast('图片读取失败');
    }
  });

  $('#rating').addEventListener('input', (e) => { $('#rating-val').textContent = e.target.value; });

  $('#draft-save').addEventListener('click', saveDraft);
  $('#draft-clear').addEventListener('click', () => { clearDraft(); resetForm(); toast('已清除暂存'); });

  $('#order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const storeName = $('#storeName').value.trim();
    const city = $('#city').value.trim();
    const total = parseFloat($('#totalPrice').value);
    if (!storeName || !city || !(total >= 0)) { toast('请填写店铺、城市和价格'); return; }
    const people = Math.max(1, parseInt($('#people').value) || 1);
    const editing = pendingEditOrder;
    const order = {
      id: editing ? editing.id : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      storeName, city,
      platform: $('#platform').value,
      foodType: $('#foodType').value,
      channel: $('#channel').value,
      items: $('#items').value.trim(),
      totalPrice: total,
      people,
      rating: parseInt($('#rating').value),
      review: $('#review').value.trim(),
      image: pendingImage,
      dishImage: pendingDishImage,
      date: editing ? editing.date : Date.now(), // 编辑保留原下单时间
      storeKey: storeName + '|' + city,
    };
    await putOrder(order);
    clearDraft();
    resetForm();
    toast(editing ? '已更新' : '已保存');
    refreshAll();
    switchView('stores');
  });
}

// ---------- 聚合 ----------
function groupByStore(orders) {
  const map = new Map();
  for (const o of orders) {
    if (!map.has(o.storeKey)) map.set(o.storeKey, []);
    map.get(o.storeKey).push(o);
  }
  const stores = [];
  for (const [key, list] of map) {
    list.sort((a, b) => b.date - a.date);
    const sumTotal = list.reduce((s, o) => s + o.totalPrice, 0);
    const sumPeople = list.reduce((s, o) => s + o.people, 0);
    const avgPrice = sumTotal / list.length;
    const perCapita = sumTotal / sumPeople; // 人均 = 总价合计 / 人数合计
    const avgRating = list.reduce((s, o) => s + (o.rating || 0), 0) / list.length;
    const [name, city] = key.split('|');
    stores.push({
      key, name, city, list,
      count: list.length, avgPrice, perCapita, avgRating,
      foodTypes: [...new Set(list.map((o) => o.foodType).filter(Boolean))],
      channels: [...new Set(list.map((o) => o.channel).filter(Boolean))],
      platforms: [...new Set(list.map((o) => o.platform).filter(Boolean))],
      dishImages: list.map((o) => o.dishImage).filter(Boolean),
    });
  }
  stores.sort((a, b) => b.perCapita - a.perCapita);
  return stores;
}

function storeCard(s) {
  const reviews = s.list.map((o) => `
    <div class="review-item">
      <div class="review-meta">${esc(new Date(o.date).toLocaleDateString())} · ${esc(o.platform || '平台未填')} · ${esc(o.foodType || '种类未填')} · ¥${o.totalPrice}（${o.people}人，人均¥${(o.totalPrice / o.people).toFixed(1)}）· <span class="stars">${stars(o.rating || 0)}</span></div>
      <div class="review-text">${esc(o.items ? '菜品：' + o.items + '\n' : '')}${esc(o.review || '（无评价）')}</div>
      ${o.dishImage ? `<img class="review-img" src="${o.dishImage}" alt="菜品图片">` : ''}
      ${o.image ? `<img class="review-img" src="${o.image}" alt="订单截图">` : ''}
      <div class="review-actions">
        <button type="button" data-edit="${esc(o.id)}">编辑</button>
        <button type="button" data-del="${esc(o.id)}">删除</button>
      </div>
    </div>`).join('');
  return `
    <div class="store" data-key="${esc(s.key)}">
      <div class="store-head">
        <div>
          <div class="store-name">${esc(s.name)}</div>
          <div class="store-sub">${esc(s.city)} · ${s.foodTypes.map(esc).join('、') || '种类未填'} · ${s.channels.map(esc).join('/') || '消费方式未填'}</div>
        </div>
        <div class="stars">${stars(Math.round(s.avgRating))}</div>
      </div>
      <div class="stats">
        <div class="stat"><b>${s.count}</b>订单数</div>
        <div class="stat"><b>¥${s.avgPrice.toFixed(1)}</b>均价</div>
        <div class="stat"><b>¥${s.perCapita.toFixed(1)}</b>人均</div>
      </div>
      ${s.dishImages.length ? `<div class="dish-strip">${s.dishImages.slice(0, 4).map((src) => `<img src="${src}" alt="菜品">`).join('')}</div>` : ''}
      <button class="toggle" type="button">查看 ${s.count} 条订单评价 ▾</button>
      <div class="reviews">${reviews}</div>
    </div>`;
}

function renderStores(orders) {
  const box = $('#store-list');
  if (!orders.length) { box.innerHTML = '<div class="empty">还没有订单，去「添加」上传第一单吧</div>'; return; }
  const stores = groupByStore(orders);
  box.innerHTML = stores.map(storeCard).join('');
}

// 最近一次全量订单，供编辑时按 id 查找
let _lastOrders = [];

// 列表点击委托：展开/收起、编辑、删除（只绑一次，避免重复监听）
function onStoreListClick(e) {
  const toggle = e.target.closest('.toggle');
  if (toggle) {
    const r = toggle.nextElementSibling;
    const open = r.classList.toggle('open');
    toggle.textContent = open ? '收起评价 ▴' : `查看 ${toggle.closest('.store').querySelectorAll('.review-item').length} 条订单评价 ▾`;
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const id = del.getAttribute('data-del');
    if (confirm('确定删除这条订单？此操作不可撤销。')) {
      deleteOrder(id).then(() => { toast('已删除'); refreshAll(); });
    }
    return;
  }
  const ed = e.target.closest('[data-edit]');
  if (ed) {
    const id = ed.getAttribute('data-edit');
    const o = _lastOrders.find((x) => x.id === id);
    if (o) {
      pendingEditOrder = o;
      writeForm(o);
      const sb = $('#submit-btn'); if (sb) sb.textContent = '保存修改';
      switchView('add');
      window.scrollTo(0, 0);
      toast('编辑中：保存后覆盖原记录');
    }
  }
}

// ---------- 筛选 ----------
function fillFilterOptions(orders) {
  const cities = [...new Set(orders.map((o) => o.city).filter(Boolean))].sort();
  const foods = [...new Set(orders.map((o) => o.foodType).filter(Boolean))].sort();
  const plats = [...new Set(orders.map((o) => o.platform).filter(Boolean))].sort();
  const fc = $('#f-city'), ff = $('#f-food'), fs = $('#food-suggest'), ps = $('#platform-suggest');
  fc.innerHTML = '<option value="">全部</option>' + cities.map((c) => `<option>${esc(c)}</option>`).join('');
  ff.innerHTML = '<option value="">全部</option>' + foods.map((c) => `<option>${esc(c)}</option>`).join('');
  if (fs) fs.innerHTML = foods.map((c) => `<option value="${esc(c)}"></option>`).join('');
  if (ps) ps.innerHTML = plats.map((c) => `<option value="${esc(c)}"></option>`).join('');
}

function applyFilter(orders) {
  const city = $('#f-city').value;
  const food = $('#f-food').value;
  const channel = $('#f-channel').value;
  const min = parseFloat($('#f-min').value);
  const max = parseFloat($('#f-max').value);
  const stores = groupByStore(orders).filter((s) => {
    if (city && s.city !== city) return false;
    if (food && !s.foodTypes.includes(food)) return false;
    if (channel && !s.channels.includes(channel)) return false;
    if (!isNaN(min) && s.perCapita < min) return false;
    if (!isNaN(max) && s.perCapita > max) return false;
    return true;
  });
  const box = $('#filter-list');
  if (!stores.length) { box.innerHTML = '<div class="empty">没有符合条件的店铺</div>'; return; }
  box.innerHTML = stores.map(storeCard).join('');
}

// ---------- 视图切换 ----------
function switchView(name) {
  $$('.view').forEach((v) => v.classList.remove('active'));
  $$('.tab').forEach((t) => t.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  $(`.tab[data-view="${name}"]`).classList.add('active');
  if (name === 'stores' || name === 'filter') refreshAll();
}

async function refreshAll() {
  const orders = await getAll();
  _lastOrders = orders;
  renderStores(orders);
  fillFilterOptions(orders);
  applyFilter(orders);
}

// ---------- 启动 ----------
function renderFilterView() { getAll().then(applyFilter); }

(async function init() {
  db = await openDB();
  bindForm();
  $('#export-btn').addEventListener('click', exportData);
  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    importData(f);
    e.target.value = '';
  });
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
  $('#store-list').addEventListener('click', onStoreListClick);
  $('#filter-list').addEventListener('click', onStoreListClick);
  ['#f-city', '#f-food', '#f-channel', '#f-min', '#f-max'].forEach((sel) =>
    $(sel).addEventListener('change', renderFilterView));
  $('#f-reset').addEventListener('click', () => {
    $('#f-city').value = ''; $('#f-food').value = ''; $('#f-channel').value = ''; $('#f-min').value = ''; $('#f-max').value = '';
    renderFilterView();
  });
  if (hasDraft()) {
    try { writeForm(JSON.parse(localStorage.getItem(DRAFT_KEY))); showDraftBanner(true); } catch (e) { /* ignore corrupt draft */ }
  }
  // PWA 离线缓存：仅在真·安全上下文注册（localhost / https 域名）。
  // APK 内用 WebViewAssetLoader 的 https 虚拟域，资源已内嵌离线，无需 SW，跳过以免 404。
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !location.hostname.includes('androidplatform')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 失败属预期，忽略 */ });
  }
  await refreshAll();
})();
