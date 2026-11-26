// ZhiBox 主应用 —— 拼箱集运 3D 装柜
'use strict';

import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { pack, CONTAINERS, colorFor } from './packer.js';

const $ = (s) => document.querySelector(s);

// ---------- 状态 ----------
const state = {
  containerKey: '40HQ',
  custom: { w: 1203.2, h: 269.8, d: 235.2 },
  items: [],          // { id, name, l, w, h, qty, weight, owner, color }
  result: null,       // 装箱结果
  playback: { playing: false, t: 0, timer: null },
  view: '3d',
  layerView: true,
  orderView: true,
  shellView: true,
};

let nextId = 1;
const owners = new Map(); // owner -> index

function ownerIndex(name) {
  if (!name) return 0;
  if (!owners.has(name)) owners.set(name, owners.size);
  return owners.get(name);
}

// ---------- 3D 场景 ----------
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1220, 600, 2200);

const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
camera.position.set(900, 600, 1100);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);
controls.maxPolarAngle = Math.PI * 0.62;

// 灯光
scene.add(new THREE.AmbientLight(0x405070, 1.4));
const hemi = new THREE.HemisphereLight(0x8899bb, 0x223344, 0.8);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.6);
dir.position.set(600, 900, 500);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
scene.add(dir);

// 地面网格参考
const grid = new THREE.GridHelper(2000, 40, 0x2a3d5c, 0x1a2a42);
scene.add(grid);

// 货柜组
const boxGroup = new THREE.Group();
scene.add(boxGroup);
let shellLines = null;
let containerBox = null;

// 缓存几何体
const boxGeoCache = new Map();
function getBoxGeo(l, w, h) {
  const key = Math.round(l) + ',' + Math.round(w) + ',' + Math.round(h);
  if (!boxGeoCache.has(key)) {
    boxGeoCache.set(key, new RoundedBoxGeometry(l, w, h, Math.min(l, w, h) * 0.06, 2));
  }
  return boxGeoCache.get(key);
}

function setView(v) {
  state.view = v;
  const cw = state.result ? state.result.container.w : 600;
  const ch = state.result ? state.result.container.h : 270;
  const cd = state.result ? state.result.container.d : 235;
  const m = Math.max(cw, ch, cd);
  const reset = () => { controls.target.set(cw/2, ch/2, cd/2); controls.update(); };
  switch (v) {
    case 'front': camera.position.set(cw/2, ch/2, cd*3 + m); reset(); break;
    case 'side':  camera.position.set(cw*3 + m, ch/2, cd/2); reset(); break;
    case 'top':   camera.position.set(cw/2, ch*3 + m, cd/2); reset(); break;
    default:      camera.position.set(cw*1.4, ch*1.0, cd*1.8); reset();
  }
}

// 绘制货柜框架 + 箱体
function drawContainer() {
  while (boxGroup.children.length) boxGroup.remove(boxGroup.children[0]);
  const res = state.result;
  const cw = res ? res.container.w : state.custom.w;
  const ch = res ? res.container.h : state.custom.h;
  const cd = res ? res.container.d : state.custom.d;

  // 框架线
  if (shellLines) scene.remove(shellLines);
  if (state.shellView) {
    const g = new THREE.BoxGeometry(cw, ch, cd);
    const edges = new THREE.EdgesGeometry(g);
    shellLines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x3b5a8a, transparent: true, opacity: 0.85 }));
    shellLines.position.set(cw/2, ch/2, cd/2);
    scene.add(shellLines);
  }

  // 地面半透明底板
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(cw, cd),
    new THREE.MeshStandardMaterial({ color: 0x1a2a47, roughness: 0.9, metalness: 0.1, transparent: true, opacity: 0.5 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cw/2, 0, cd/2);
  floor.receiveShadow = true;
  scene.add(floor);
  boxGroup.add(floor);

  // 装载箱子
  if (res) {
    const n = state.orderView ? res.placed.length : 0;
    res.placed.forEach((p, i) => {
      // layerView：只显示当前选中层（简化：全部显示，层过滤在播放时做）
      const mesh = new THREE.Mesh(
        getBoxGeo(p.l, p.h, p.w),
        boxMaterial(p)
      );
      mesh.position.set(p.x + p.l/2, p.y + p.h/2, p.z + p.w/2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { idx: i, box: p };
      boxGroup.add(mesh);
    });
  }

  // 重新设视角
  setView(state.view);
}

function boxMaterial(p) {
  const owner = state.items[p.itemIndex] ? state.items[p.itemIndex].owner : '';
  const ci = ownerIndex(owner);
  const color = colorFor(ci);
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.35, metalness: 0.15,
    transparent: true, opacity: 0.92,
  });
}

// ---------- UI 渲染 ----------
function renderTypes() {
  const el = $('#types');
  el.innerHTML = '';
  const keys = ['20GP', '40GP', '40HQ', '45HQ'];
  keys.forEach(k => {
    const c = CONTAINERS[k];
    const btn = document.createElement('div');
    btn.className = 'type' + (state.containerKey === k ? ' on' : '');
    btn.innerHTML = `<b>${k}</b><span>${c.vol.toFixed(1)} m³</span>`;
    btn.onclick = () => { state.containerKey = k; renderTypes(); doPack(); };
    el.appendChild(btn);
  });
  // 自定义
  const cb = document.createElement('div');
  cb.className = 'type custom' + (state.containerKey === 'custom' ? ' on' : '');
  cb.innerHTML = `<b>自定义</b><span>${state.custom.w.toFixed(0)}×${state.custom.h.toFixed(0)}×${state.custom.d.toFixed(0)} cm</span><span class="gear">⚙</span>`;
  cb.onclick = () => openCustomDialog();
  el.appendChild(cb);
}

function openCustomDialog() {
  const w = prompt('柜内宽 W (cm):', state.custom.w);
  if (w == null) return;
  const h = prompt('柜内高 H (cm):', state.custom.h);
  if (h == null) return;
  const d = prompt('柜内深 D (cm):', state.custom.d);
  if (d == null) return;
  state.custom = { w: +w, h: +h, d: +d };
  state.containerKey = 'custom';
  renderTypes();
  doPack();
}

function renderItems() {
  const el = $('#items');
  el.innerHTML = '';
  state.items.forEach((it, i) => {
    const div = document.createElement('div');
    div.className = 'item';
    const ownerCls = it.owner ? '' : '';
    div.innerHTML = `
      <div class="item-head">
        <span class="swatch" style="background:${colorFor(ownerIndex(it.owner))}"></span>
        <input class="nm" value="${esc(it.name)}" data-i="${i}" data-f="name">
        ${it.owner ? `<span class="owner-tag">${esc(it.owner)}</span>` : ''}
        <button class="del" data-i="${i}">✕</button>
      </div>
      <div class="grid3">
        <span></span>
        <div class="fld"><label>长(cm)</label><input type="number" value="${it.l}" data-i="${i}" data-f="l"></div>
        <div class="fld"><label>宽(cm)</label><input type="number" value="${it.w}" data-i="${i}" data-f="w"></div>
        <div class="fld"><label>高(cm)</label><input type="number" value="${it.h}" data-i="${i}" data-f="h"></div>
      </div>
      <div class="row2">
        <div class="fld"><label>数量</label><input type="number" value="${it.qty}" data-i="${i}" data-f="qty"></div>
        <div class="fld"><label>单重(kg)</label><input type="number" value="${it.weight}" data-i="${i}" data-f="weight"></div>
        <div class="fld" style="flex:1"><label>货主</label><input type="text" value="${esc(it.owner)}" data-i="${i}" data-f="owner" placeholder="可选"></div>
      </div>
      <div class="chips">
        <span>摆向</span>
        <button class="chip ${it.rotate !== false ? 'on' : ''}" data-i="${i}" data-f="rotate">旋转</button>
      </div>
    `;
    el.appendChild(div);
  });
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// 事件委托
$('#items').addEventListener('click', (e) => {
  const btn = e.target.closest('.del');
  if (btn) {
    const i = +btn.dataset.i;
    state.items.splice(i, 1);
    renderItems(); doPack();
    return;
  }
  const chip = e.target.closest('.chip');
  if (chip) {
    const i = +chip.dataset.i, f = chip.dataset.f;
    state.items[i].rotate = state.items[i].rotate === false ? true : false;
    renderItems(); doPack();
  }
});
$('#items').addEventListener('input', (e) => {
  const inp = e.target.closest('input');
  if (!inp || !inp.dataset.f) return;
  const i = +inp.dataset.i, f = inp.dataset.f;
  const val = inp.value;
  const numeric = ['l','w','h','qty','weight'].includes(f);
  state.items[i][f] = numeric ? parseFloat(val) || 0 : val;
  if (f === 'owner') {
    state.items[i].owner = val.trim();
    renderItems(); doPack();
  }
  if (numeric && ['l','w','h','qty'].includes(f)) doPack();
});

function renderResult() {
  const r = state.result;
  if (!r) return;
  const pct = r.utilization.toFixed(1);
  $('#utilVal').textContent = pct + '%';
  $('#utilBig').textContent = pct + '% 装载率';
  $('#ring').style.background = `conic-gradient(var(--accent) ${pct}%, var(--border2) ${pct}%)`;
  $('#mCount').textContent = `${r.placedCount} / ${r.totalCount} 件`;
  $('#mVol').textContent = (r.usedVol / 1e6).toFixed(2) + ' m³';
  $('#mWeight').textContent = r.totalWeight.toLocaleString() + ' kg';
  $('#mLayer').textContent = (r.maxLayer / 100).toFixed(1) + ' m';
  const cz = r.cogZOffset, cx = r.cogXOffset;
  $('#mCog').textContent = `${cz >= 0 ? '后' : '前'} ${Math.abs(cz).toFixed(1)}% / ${cx >= 0 ? '右' : '左'} ${Math.abs(cx).toFixed(1)}%`;
  $('#mCog').className = 'ok';
  $('#mLeft').textContent = ((r.totalVol - r.usedVol) / 1e6).toFixed(2) + ' m³';
  $('#mChipPct').textContent = pct + '%';
  $('#mChipCnt').textContent = `${r.placedCount}/${r.totalCount} 件`;
}

function doPack() {
  const cw = state.containerKey === 'custom' ? state.custom.w : CONTAINERS[state.containerKey].w;
  const ch = state.containerKey === 'custom' ? state.custom.h : CONTAINERS[state.containerKey].h;
  const cd = state.containerKey === 'custom' ? state.custom.d : CONTAINERS[state.containerKey].d;
  const container = { w: cw, h: ch, d: cd, name: state.containerKey };

  // 过滤有效货物
  const valid = state.items.filter(it => it.l > 0 && it.w > 0 && it.h > 0 && it.qty > 0);
  const result = pack(container, valid, { allowRotate: valid.every(it => it.rotate !== false) || true, sortBy: 'volume-desc' });
  state.result = result;
  renderResult();
  drawContainer();
}

// ---------- 播放（装载动画） ----------
function playToggle() {
  if (state.playback.playing) { pausePlay(); return; }
  if (!state.result) return;
  state.playback.playing = true;
  $('#playBtn').textContent = '❚❚';
  const speed = parseFloat($('#playSpeed').value);
  const interval = 400 / speed;
  clearInterval(state.playback.timer);
  state.playback.timer = setInterval(() => {
    state.playback.t += 1;
    const total = state.result.placed.length;
    const shown = Math.min(state.playback.t, total);
    drawPlayback(shown);
    $('#playRange').value = Math.round(shown / total * 100);
    if (state.playback.t >= total) pausePlay();
  }, interval);
}
function pausePlay() {
  state.playback.playing = false;
  clearInterval(state.playback.timer);
  $('#playBtn').textContent = '▶';
}
function drawPlayback(shown) {
  // 只渲染前 shown 个箱子
  while (boxGroup.children.length) boxGroup.remove(boxGroup.children[0]);
  const res = state.result;
  const cw = res.container.w, ch = res.container.h, cd = res.container.d;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd), new THREE.MeshStandardMaterial({ color: 0x1a2a47, roughness: 0.9, transparent: true, opacity: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cw/2, 0, cd/2);
  boxGroup.add(floor);
  for (let i = 0; i < shown; i++) {
    const p = res.placed[i];
    const m = new THREE.Mesh(getBoxGeo(p.l, p.h, p.w), boxMaterial(p));
    m.position.set(p.x + p.l/2, p.y + p.h/2, p.z + p.w/2);
    m.castShadow = true;
    boxGroup.add(m);
  }
}

// ---------- 分享（生成链接） ----------
function share() {
  const data = { containerKey: state.containerKey, custom: state.custom, items: state.items };
  const base = location.origin + location.pathname;
  const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
  const url = base + '?share=' + encoded;
  if (navigator.share) {
    navigator.share({ title: 'ZhiBox 装柜方案', url }).catch(() => {});
  } else {
    prompt('复制此链接分享方案：', url);
  }
}

function loadFromShare() {
  const p = new URLSearchParams(location.search).get('share');
  if (!p) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(p)))));
    state.containerKey = data.containerKey || '40HQ';
    state.custom = data.custom || state.custom;
    state.items = data.items || [];
    renderTypes(); renderItems(); doPack();
  } catch (e) { console.warn('share parse failed', e); }
}

// ---------- 导出 CSV ----------
function exportCSV() {
  if (!state.result) return;
  const rows = [['货主','货名','长(cm)','宽(cm)','高(cm)','数量','单重(kg)','已装','体积(m³)']];
  state.items.forEach((it, i) => {
    const placed = state.result.placed.filter(p => p.itemIndex === i).length;
    const vol = (it.l * it.w * it.h * it.qty / 1e6).toFixed(3);
    rows.push([it.owner, it.name, it.l, it.w, it.h, it.qty, it.weight, placed, vol]);
  });
  let csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'zhibox-装载清单.csv';
  a.click();
}

// ---------- 导入 Excel ----------
function importExcel(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      // 找表头（含 长/宽/高 或 L/W/H）
      let start = 0;
      rows.forEach((r, idx) => {
        const s = (r || []).join(' ').toLowerCase();
        if (!start && (s.includes('长') || s.includes('l') && s.includes('w') && s.includes('h'))) start = idx;
      });
      state.items = [];
      for (let i = start + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const name = String(r[0] || '货物');
        const l = parseFloat(r[1]) || 0, w = parseFloat(r[2]) || 0, h = parseFloat(r[3]) || 0;
        const qty = parseFloat(r[4]) || 1;
        const weight = parseFloat(r[5]) || 0;
        const owner = r[6] ? String(r[6]) : '';
        if (l > 0 && w > 0 && h > 0) {
          state.items.push({ id: nextId++, name, l, w, h, qty, weight: weight, owner, rotate: true });
        }
      }
      renderItems(); doPack();
      alert('导入成功：' + state.items.length + ' 种货物');
    } catch (err) { alert('导入失败：' + err.message); }
  };
  reader.readAsArrayBuffer(file);
}

// ---------- 预设示例 ----------
const PRESETS = {
  '拼箱示例': [
    { name: '家电 A 型', l: 80, w: 60, h: 50, qty: 40, weight: 15, owner: '货主张三', rotate: true },
    { name: '纸箱 B 型', l: 60, w: 40, h: 40, qty: 80, weight: 8, owner: '货主李四', rotate: true },
    { name: '木箱 C 型', l: 120, w: 80, h: 70, qty: 20, weight: 60, owner: '货主王五', rotate: true },
    { name: '托盘 D 型', l: 100, w: 100, h: 90, qty: 15, weight: 80, owner: '货主张三', rotate: false },
  ],
};

function renderPresets() {
  const el = $('#presets');
  el.innerHTML = '';
  Object.keys(PRESETS).forEach(name => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.textContent = name;
    b.onclick = () => {
      state.items = PRESETS[name].map(it => ({ id: nextId++, ...it }));
      state.containerKey = '40HQ';
      renderTypes(); renderItems(); doPack();
    };
    el.appendChild(b);
  });
}

// ---------- 初始化 ----------
function init() {
  renderTypes();
  renderItems();
  renderPresets();
  loadFromShare();

  $('#addItem').onclick = () => {
    state.items.push({ id: nextId++, name: '新货物', l: 60, w: 40, h: 40, qty: 10, weight: 10, owner: '', rotate: true });
    renderItems(); doPack();
  };
  $('#importBtn').onclick = () => $('#fileInput').click();
  $('#csvBtn').onclick = exportCSV;
  $('#csvBtnM').onclick = exportCSV;
  $('#shareBtn').onclick = share;
  $('#smartBtn').onclick = () => {
    // 智能满载：填满示例数据
    state.items = PRESETS['拼箱示例'].map(it => ({ id: nextId++, ...it }));
    renderItems(); doPack();
  };
  $('#packBtn').onclick = doPack;
  $('#sheetBtn').onclick = () => $('#sheet').classList.toggle('open');
  $('#sheetClose').onclick = () => $('#sheet').classList.remove('open');
  $('#fileInput').onchange = (e) => { if (e.target.files[0]) importExcel(e.target.files[0]); };

  // 视角按钮
  document.querySelectorAll('.tool[data-view]').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tool[data-view]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      setView(b.dataset.view);
      if (window.innerWidth <= 760) collapseTools();
    };
  });
  // 视图折叠切换
  $('#viewToggle').onclick = () => {
    const ov = $('#ovTools');
    ov.classList.toggle('collapsed');
    ov.classList.toggle('expanded');
  };
  function collapseTools() {
    const ov = $('#ovTools');
    ov.classList.add('collapsed');
    ov.classList.remove('expanded');
  }
  $('#layerToggle').onclick = (e) => { state.layerView = !state.layerView; e.target.classList.toggle('on', state.layerView); };
  $('#orderToggle').onclick = (e) => { state.orderView = !state.orderView; e.target.classList.toggle('on', state.orderView); };
  $('#shellToggle').onclick = (e) => { state.shellView = !state.shellView; e.target.classList.toggle('on', state.shellView); drawContainer(); };
  $('#playBtn').onclick = playToggle;
  $('#playRange').oninput = (e) => {
    if (!state.result) return;
    state.playback.t = Math.round(e.target.value / 100 * state.result.placed.length);
    drawPlayback(state.playback.t);
  };

  // 默认载入一个示例，首次打开就有东西看
  state.items = PRESETS['拼箱示例'].map(it => ({ id: nextId++, ...it }));
  renderItems();
  doPack();

  // 动画循环
  function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }
  loop();
}

function resize() {
  const vp = $('#viewport');
  const w = vp.clientWidth, h = vp.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

init();
