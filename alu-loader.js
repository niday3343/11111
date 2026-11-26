// ZhiBox 铝材装柜 —— 型材排柜 + 凸出物避让 + 分层
'use strict';
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { CONTAINERS, colorFor, pack } from './packer.js';

const $ = s => document.querySelector(s);
const state = { containerKey:'40GP', layers:3, obstH:15, obstD:100, items:[
  {id:1,name:'铝型材 6m',l:600,w:10,h:10,qty:200,weight:3},
  {id:2,name:'型材 3m',l:300,w:15,h:15,qty:80,weight:5},
] };
let nextId=3;

const renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new THREE.Scene(); scene.fog=new THREE.Fog(0x0b1220,600,2200);
const camera=new THREE.PerspectiveCamera(45,1,1,5000); camera.position.set(900,600,1000);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0x8899bb,0x223344,0.9));
const dl=new THREE.DirectionalLight(0xffffff,1.5); dl.position.set(600,900,500); dl.castShadow=true; scene.add(dl);
scene.add(new THREE.GridHelper(2000,40,0x2a3d5c,0x1a2a42));

const root=new THREE.Group(); scene.add(root);
const CW=()=>CONTAINERS[state.containerKey].w, CH=()=>CONTAINERS[state.containerKey].h, CD=()=>CONTAINERS[state.containerKey].d;

function redraw(result){
  while(root.children.length) root.remove(root.children[0]);
  // 柜体
  const g=new THREE.BoxGeometry(CW(),CH(),CD());
  const sh=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x3b5a8a,transparent:true,opacity:0.85}));
  sh.position.set(CW()/2,CH()/2,CD()/2); root.add(sh);
  // 分层线
  for(let i=1;i<state.layers;i++){
    const y=CH()/state.layers*i;
    const line=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(CW(),CD())),
      new THREE.LineBasicMaterial({color:0x4a6a9a,transparent:true,opacity:0.3}));
    line.rotation.x=-Math.PI/2; line.position.set(CW()/2,y,CD()/2); root.add(line);
  }
  // 凸出物（避让区）
  const ob=new THREE.Mesh(new THREE.BoxGeometry(CW(),state.obstH,20),
    new THREE.MeshStandardMaterial({color:0xf59e0b,transparent:true,opacity:0.5}));
  ob.position.set(CW()/2,state.obstH/2,CD()-state.obstD); root.add(ob);

  // 型材
  const placed = result ? result.placed : [];
  placed.forEach((p,i)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(p.l,p.h,p.w),
      new THREE.MeshStandardMaterial({color:new THREE.Color(colorFor(p.itemIndex)),roughness:0.3,metalness:0.3,transparent:true,opacity:0.92}));
    m.position.set(p.x+p.l/2,p.y+p.h/2,p.z+p.w/2); m.castShadow=true; root.add(m);
  });
}

function renderTypes(){
  const el=$('#types'); el.innerHTML='';
  ['20GP','40GP','40HQ','45HQ'].forEach(k=>{
    const b=document.createElement('div'); b.className='type'+(state.containerKey===k?' on':'');
    b.innerHTML=`<b>${k}</b>${CONTAINERS[k].vol.toFixed(1)} m³`;
    b.onclick=()=>{ state.containerKey=k; renderTypes(); redraw(); };
    el.appendChild(b);
  });
}
function renderItems(){
  const el=$('#items'); el.innerHTML='';
  state.items.forEach((it,i)=>{
    const d=document.createElement('div'); d.className='item';
    d.innerHTML=`<div class="row"><input value="${it.name}" data-i="${i}" data-f="name"><button class="del" data-i="${i}">✕</button></div>
      <div class="row"><input type="number" value="${it.l}" data-i="${i}" data-f="l" placeholder="长"><input type="number" value="${it.w}" data-i="${i}" data-f="w" placeholder="宽"><input type="number" value="${it.h}" data-i="${i}" data-f="h" placeholder="高"></div>
      <div class="row"><input type="number" value="${it.qty}" data-i="${i}" data-f="qty" placeholder="数量"><input type="number" value="${it.weight}" data-i="${i}" data-f="weight" placeholder="单重kg"></div>`;
    el.appendChild(d);
  });
}
$('#items').addEventListener('input',e=>{
  const inp=e.target.closest('input'); if(!inp||!inp.dataset.f)return;
  const i=+inp.dataset.i, f=inp.dataset.f, v=inp.value;
  state.items[i][f]=['l','w','h','qty','weight'].includes(f)?parseFloat(v)||0:v;
});
$('#items').addEventListener('click',e=>{
  const del=e.target.closest('.del'); if(del){ state.items.splice(+del.dataset.i,1); renderItems(); }
});

function doPack(){
  const container={w:CW(),h:CH(),d:CD(),name:state.containerKey};
  const valid=state.items.filter(it=>it.l>0&&it.w>0&&it.h>0&&it.qty>0);
  const result=pack(container,valid,{sortBy:'height-desc'});
  redraw(result);
  const pct=result.utilization.toFixed(1);
  alert(`排柜完成：装载率 ${pct}%，装入 ${result.placedCount}/${result.totalCount} 件`);
}

$('#calc').onclick=doPack;
$('#addItem').onclick=()=>{ state.items.push({id:nextId++,name:'新铝材',l:300,w:10,h:10,qty:50,weight:3}); renderItems(); };
$('#layers').oninput=e=>{ state.layers=parseInt(e.target.value)||1; redraw(); };
$('#obstH').oninput=e=>{ state.obstH=parseFloat(e.target.value)||0; redraw(); };
$('#obstD').oninput=e=>{ state.obstD=parseFloat(e.target.value)||0; redraw(); };
$('#sheetBtn').onclick=()=>$('#sheet').classList.toggle('open');
$('#sheetClose').onclick=()=>$('#sheet').classList.remove('open');
function resize(){ const vp=$('#viewport'); renderer.setSize(vp.clientWidth,vp.clientHeight,false); camera.aspect=vp.clientWidth/vp.clientHeight; camera.updateProjectionMatrix(); }
window.addEventListener('resize',resize);

renderTypes(); renderItems(); doPack(); resize();
function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene,camera); }
loop();
