// ZhiBox 拖拽装柜 —— 手动拖拽 + 自动吸附堆叠
'use strict';
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { CONTAINERS, colorFor } from './packer.js';

const $ = s => document.querySelector(s);
const state = { containerKey: '40GP', placed: [], pallet: [], drag: null };

const CW = () => CONTAINERS[state.containerKey].w;
const CH = () => CONTAINERS[state.containerKey].h;
const CD = () => CONTAINERS[state.containerKey].d;

// ---- 3D ----
const renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1220, 600, 2200);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
camera.position.set(800, 500, 900);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
scene.add(new THREE.HemisphereLight(0x8899bb, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.5);
dir.position.set(600, 900, 500); dir.castShadow = true; scene.add(dir);
const grid = new THREE.GridHelper(2000, 40, 0x2a3d5c, 0x1a2a42); scene.add(grid);

const root = new THREE.Group(); scene.add(root);
let shell = null;
const geoCache = new Map();
function geo(l,w,h){ const k=Math.round(l)+','+Math.round(w)+','+Math.round(h);
  if(!geoCache.has(k)) geoCache.set(k,new RoundedBoxGeometry(l,h,w,Math.min(l,h,w)*0.06,2));
  return geoCache.get(k); }

function shellMesh(){
  if(shell) scene.remove(shell);
  const g=new THREE.BoxGeometry(CW(),CH(),CD());
  shell=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x3b5a8a,transparent:true,opacity:0.85}));
  shell.position.set(CW()/2,CH()/2,CD()/2); scene.add(shell);
}
function floor(){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(CW(),CD()),new THREE.MeshStandardMaterial({color:0x1a2a47,roughness:0.9,transparent:true,opacity:0.5}));
  m.rotation.x=-Math.PI/2; m.position.set(CW()/2,0,CD()/2); m.receiveShadow=true; return m;
}
let floorMesh;
function redraw(){
  while(root.children.length) root.remove(root.children[0]);
  floorMesh=floor(); root.add(floorMesh);
  state.placed.forEach(p=>{
    const m=new THREE.Mesh(geo(p.l,p.w,p.h),new THREE.MeshStandardMaterial({color:new THREE.Color(p.color),roughness:0.35,metalness:0.15,transparent:true,opacity:0.92}));
    m.position.set(p.x+p.l/2,p.y+p.h/2,p.z+p.w/2); m.castShadow=true;
    m.userData={placed:true,box:p}; root.add(m);
  });
  shellMesh();
}

// ---- 吸附算法：找最贴近的合法位置 ----
function overlaps(a,b){
  return a.x < b.x+b.l-1e-6 && a.x+a.l > b.x+1e-6 &&
         a.y < b.y+b.h-1e-6 && a.y+a.h > b.y+1e-6 &&
         a.z < b.z+b.w-1e-6 && a.z+a.w > b.z+1e-6;
}
function snapPosition(l,w,h){
  // 目标：把箱子放在柜内最靠下、靠里、靠后（贴底贴壁）的合法位置
  const cand = [];
  cand.push({x:0,y:0,z:0});
  // 收集所有已放置箱子的顶面/右面/前面作为候选支撑点
  state.placed.forEach(p=>{
    cand.push({x:p.x, y:p.y+p.h, z:p.z});           // 顶部
    cand.push({x:p.x+p.l, y:p.y, z:p.z});           // 右侧
    cand.push({x:p.x, y:p.y, z:p.z+p.w});           // 前方
  });
  // 给每个候选点做微调（吸附到最近的已占表面）
  const best=[];
  for(const c of cand){
    for(const [l2,w2,h2] of [ [l,w,h],[l,h,w],[w,l,h],[w,h,l],[h,l,w],[h,w,l] ]){
      const test={x:c.x,y:c.y,z:c.z,l:l2,w:w2,h:h2};
      if(test.x<0||test.y<0||test.z<0) continue;
      if(test.x+l2>CW()+1e-6||test.y+h2>CH()+1e-6||test.z+w2>CD()+1e-6) continue;
      if(!state.placed.some(o=>overlaps(test,o))){
        best.push({...test, l:l2,w:w2,h:h2, score:test.y*1e6+test.z*1e4+test.x});
      }
    }
  }
  best.sort((a,b)=>a.score-b.score);
  return best[0] || null;
}

// ---- UI ----
function renderTypes(){
  const el=$('#types'); el.innerHTML='';
  ['20GP','40GP','40HQ','45HQ'].forEach(k=>{
    const b=document.createElement('div'); b.className='type'+(state.containerKey===k?' on':'');
    b.innerHTML=`<b>${k}</b>${CONTAINERS[k].vol.toFixed(1)} m³`;
    b.onclick=()=>{ state.containerKey=k; renderTypes(); redraw(); };
    el.appendChild(b);
  });
}
function renderPallet(){
  const el=$('#pallet'); el.innerHTML='';
  state.pallet.forEach((p,i)=>{
    const d=document.createElement('div'); d.className='pallet-item';
    d.draggable=true; d.dataset.i=i;
    d.innerHTML=`<b>${p.name}</b><span class="sz">${p.l}×${p.w}×${p.h}</span>`;
    d.addEventListener('dragstart',e=>{ e.dataTransfer.setData('text/plain',String(i)); state.drag=i; });
    el.appendChild(d);
  });
}
function addItem(name,l,w,h,color){
  state.pallet.push({name,l,w,h,color});
  renderPallet();
}

// 拖放到场景
const viewport=$('#viewport');
viewport.addEventListener('dragover',e=>e.preventDefault());
viewport.addEventListener('drop',e=>{
  e.preventDefault();
  const i=+e.dataTransfer.getData('text/plain');
  const p=state.pallet[i];
  const pos=snapPosition(p.l,p.w,p.h);
  if(pos){ state.placed.push({...pos, name:p.name, color:p.color}); redraw(); }
  else { alert('放不下：柜内空间不足'); }
  state.drag=null;
});

function autoFill(){
  state.placed=[];
  const all=[]; state.pallet.forEach(p=>all.push({...p}));
  // 按体积降序自动放进柜内
  all.sort((a,b)=>(b.l*b.w*b.h)-(a.l*a.w*a.h));
  let count=0;
  for(const p of all){
    const pos=snapPosition(p.l,p.w,p.h);
    if(pos){ state.placed.push({...pos, name:p.name, color:p.color}); count++; }
  }
  redraw();
  alert(`自动铺满完成：装入 ${count} 件`);
}

function resize(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
}

// 视角
document.querySelectorAll('.tool[data-view]').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('.tool[data-view]').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    const v=b.dataset.view, m=Math.max(CW(),CH(),CD());
    if(v==='top'){camera.position.set(CW()/2,CH()*3+m,CD()/2);}
    else if(v==='front'){camera.position.set(CW()/2,CH()/2,CD()*3+m);}
    else {camera.position.set(CW()*1.4,CH(),CD()*1.8);}
    controls.target.set(CW()/2,CH()/2,CD()/2); controls.update();
  };
});
$('#shellToggle').onclick=e=>{ e.target.classList.toggle('on'); if(shell&&shell.parent) scene.remove(shell); shell=null; if(e.target.classList.contains('on')) shellMesh(); };
$('#autoFill').onclick=autoFill;
$('#addItem').onclick=()=>{ addItem('箱子'+(state.pallet.length+1),60,40,40,'#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')); };
$('#clearAll').onclick=()=>{ state.placed=[]; redraw(); };
$('#sheetBtn').onclick=()=>$('#sheet').classList.toggle('open');
$('#sheetClose').onclick=()=>$('#sheet').classList.remove('open');
window.addEventListener('resize',resize);

// 初始化示例
renderTypes();
['家电 80×60×50','纸箱 60×40×40','木箱 120×80×70','托盘 100×100×90'].forEach((n,idx)=>{
  const sizes=[[80,60,50],[60,40,40],[120,80,70],[100,100,90]][idx];
  addItem(n,sizes[0],sizes[1],sizes[2],colorFor(idx));
});
redraw(); resize();
function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene,camera); }
loop();
