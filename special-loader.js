// ZhiBox 特殊尺寸装柜 —— 异形件（L形/缺口/梯形）测算
'use strict';
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { CONTAINERS, colorFor } from './packer.js';

const $ = s => document.querySelector(s);

// 形状定义
const SHAPES = {
  box:     { name:'规则箱', desc:'长方体', fields:['l','w','h'] },
  lshape:  { name:'L形件', desc:'带缺角的 L 形', fields:['l','w','h','cutL','cutW','cutH'] },
  notch:   { name:'缺口件', desc:'侧面带缺口', fields:['l','w','h','notchL','notchH'] },
};
const DIMS_LABEL = { l:'长 (cm)', w:'宽 (cm)', h:'高 (cm)', cutL:'缺口长 (cm)', cutW:'缺口宽 (cm)', cutH:'缺口高 (cm)', notchL:'缺口深 (cm)', notchH:'缺口高 (cm)' };

let shape = 'box';
const vals = { l:80, w:60, h:50, cutL:30, cutW:30, cutH:30, notchL:20, notchH:20 };

function shapeVolume(){
  const base = vals.l * vals.w * vals.h;
  if(shape==='box') return base;
  if(shape==='lshape') return base - vals.cutL * vals.cutW * vals.cutH;
  if(shape==='notch') return base - vals.notchL * vals.notchL * vals.notchH;
  return base;
}

// ---- 3D ----
const renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const scene=new THREE.Scene(); scene.fog=new THREE.Fog(0x0b1220,600,2200);
const camera=new THREE.PerspectiveCamera(45,1,1,5000); camera.position.set(800,500,900);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0x8899bb,0x223344,0.9));
const dl=new THREE.DirectionalLight(0xffffff,1.5); dl.position.set(600,900,500); scene.add(dl);
scene.add(new THREE.GridHelper(2000,40,0x2a3d5c,0x1a2a42));

const root=new THREE.Group(); scene.add(root);
const CW=CONTAINERS['40GP'].w, CH=CONTAINERS['40GP'].h, CD=CONTAINERS['40GP'].d;

function drawShape(){
  while(root.children.length) root.remove(root.children[0]);
  // 柜体
  const g=new THREE.BoxGeometry(CW,CH,CD);
  const sh=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x3b5a8a,transparent:true,opacity:0.85}));
  sh.position.set(CW/2,CH/2,CD/2); root.add(sh);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(CW,CD),new THREE.MeshStandardMaterial({color:0x1a2a47,transparent:true,opacity:0.5}));
  floor.rotation.x=-Math.PI/2; floor.position.set(CW/2,0,CD/2); root.add(floor);

  // 异形件（用多个 box 拼出近似外形）
  const color=new THREE.Color('#2dd4bf');
  if(shape==='box'){
    addBox(vals.l,vals.w,vals.h,0,0,0,color);
  } else if(shape==='lshape'){
    // L 形 = 主体 + 缺口部分（反向：画主体再挖掉视觉上用两块拼）
    addBox(vals.l,vals.w,vals.h,0,0,0,color);
    // 缺口用暗色标示
    addBox(vals.cutL,vals.cutW,vals.cutH,vals.l-vals.cutL,0,vals.h-vals.cutH,new THREE.Color('#1a2a47'));
  } else if(shape==='notch'){
    addBox(vals.l,vals.w,vals.h,0,0,0,color);
    addBox(vals.notchL,vals.w,vals.notchH,vals.l-vals.notchL,0,0,new THREE.Color('#1a2a47'));
  }
}
function addBox(l,w,h,x,y,z,color){
  const m=new THREE.Mesh(new THREE.BoxGeometry(l,h,w),new THREE.MeshStandardMaterial({color,roughness:0.4,transparent:true,opacity:0.92}));
  m.position.set(x+l/2,y+h/2,z+w/2); root.add(m);
}

function renderShapes(){
  const el=$('#shapes'); el.innerHTML='';
  Object.keys(SHAPES).forEach(k=>{
    const d=document.createElement('div'); d.className='shape'+(shape===k?' on':'');
    d.innerHTML=`<svg width="30" height="30" viewBox="0 0 30 30"><rect x="3" y="3" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"/></svg>${SHAPES[k].name}`;
    d.onclick=()=>{ shape=k; renderShapes(); renderDims(); drawShape(); };
    el.appendChild(d);
  });
}
function renderDims(){
  const el=$('#dims'); el.innerHTML=`<div class="sec-title">尺寸参数 —— ${SHAPES[shape].desc}</div>`;
  const fields=SHAPES[shape].fields;
  const pairs=[];
  for(let i=0;i<fields.length;i+=2){ pairs.push([fields[i],fields[i+1]]); }
  pairs.forEach(pr=>{
    const g=document.createElement('div'); g.className='grid2';
    pr.forEach(f=>{
      if(!f) return;
      const d=document.createElement('div'); d.className='fld';
      d.innerHTML=`<label>${DIMS_LABEL[f]}</label><input type="number" value="${vals[f]}" data-f="${f}">`;
      g.appendChild(d);
    });
    el.appendChild(g);
  });
  el.querySelectorAll('input').forEach(inp=>{
    inp.oninput=()=>{ vals[inp.dataset.f]=parseFloat(inp.value)||0; drawShape(); };
  });
}
function calc(){
  const vol=shapeVolume();
  const cvol=CW*CH*CD;
  const maxCount=Math.floor(cvol/vol*0.72); // 考虑间隙留 72% 效率
  const resVol=(vol/1e6).toFixed(3);
  const left=((cvol-vol*maxCount)/1e6).toFixed(2);
  $('#result').style.display='block';
  $('#resUtil').textContent=(vol*maxCount/cvol*100).toFixed(1)+'%';
  $('#resCount').textContent=maxCount+' 件';
  $('#resVol').textContent=resVol+' m³';
  $('#resLeft').textContent=left+' m³';
}
function resize(){ const vp=$('#viewport'); renderer.setSize(vp.clientWidth,vp.clientHeight,false); camera.aspect=vp.clientWidth/vp.clientHeight; camera.updateProjectionMatrix(); }

$('#calc').onclick=calc;
$('#sheetBtn').onclick=()=>$('#sheet').classList.toggle('open');
$('#sheetClose').onclick=()=>$('#sheet').classList.remove('open');
window.addEventListener('resize',resize);

renderShapes(); renderDims(); drawShape(); resize();
function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene,camera); }
loop();
