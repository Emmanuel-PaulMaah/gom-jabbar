import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { createProceduralController } from './animations.js';

// onscreen console mirror without recursion
const logPanel = document.getElementById('logPanel');
const origLog = window.console.log.bind(window.console);

function safeStr(v) {
  try { return typeof v === 'string' ? v : JSON.stringify(v); }
  catch { return String(v); }
}
function appendToPanel(args) {
  if (!logPanel) return;
  const line = document.createElement('div');
  line.textContent = args.map(safeStr).join(' ');
  logPanel.appendChild(line);
  logPanel.scrollTop = logPanel.scrollHeight;
}

// mirror default console.log, but never call console.log from inside
window.console.log = (...args) => {
  origLog(...args);
  appendToPanel(args);
};

// helper for tagged logs you want to see clearly
function uiLog(...args) {
  origLog('[gom-jabbar]', ...args);
  appendToPanel(['[gom-jabbar]', ...args]);
}

// ui refs
const ui = Object.fromEntries(['meshCount','skinnedCount','boneCount','animCount','morphMeshCount','weightedPct','avgInf','maxInf','status','statusChips','bonesTree','morphControls','anims','procSelect','procPlay','procStop']
  .map(id=>[id,document.getElementById(id)]));
const fileInput = document.getElementById('file');
const urlInput = document.getElementById('url');
const loadUrlBtn = document.getElementById('loadUrl');
const canvas = document.getElementById('canvas');

// renderer + scene
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, preserveDrawingBuffer:false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
camera.position.set(1.5, 1.2, 2.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// lights/helpers
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(3,5,2); scene.add(dir);
scene.add(new THREE.GridHelper(10, 20, 0x223, 0x223));
scene.add(new THREE.AxesHelper(0.5));

// state
let mixer = null;
let loadedRoot = null;
let currentClips = [];
let morphTargets = []; // [{mesh, dict, influences}]

// sizing
function resize() {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || window.innerWidth;
  const h = rect.height || window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
function layout() {
  const viewer = document.getElementById('viewer');
  if (window.innerWidth > 768) viewer.style.height = window.innerHeight + 'px';
  resize();
}
window.addEventListener('resize', layout, { passive:true });
layout();

// loaders
const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(draco);
const ktx2 = new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/basis/');
ktx2.detectSupport(renderer);
gltfLoader.setKTX2Loader(ktx2);
const fbxLoader = new FBXLoader();
const objLoader = new OBJLoader();

// procedural controller
const proc = createProceduralController({
  getRoot: ()=>loadedRoot,
  getMorphTargets: ()=>morphTargets,
  getScene: ()=>scene
});

// animation loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  proc.update(clock.getElapsedTime(), dt);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// scene utilities
function clearScene() {
  if (loadedRoot) {
    scene.remove(loadedRoot);
    loadedRoot.traverse(o=>{
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m=>{ for (const k in m) if (m[k]?.isTexture) m[k].dispose?.(); m.dispose?.(); });
      }
    });
  }
  loadedRoot = null;
  mixer = null;
  currentClips = [];
  morphTargets = [];
  ui.morphControls.innerHTML = '';
  ui.anims.innerHTML = '';
  ui.bonesTree.innerHTML = '';
  ui.status.innerText = '';
  ui.statusChips.innerHTML = '';
  ktx2.dispose?.();
  draco.dispose?.();
}

async function loadFromFiles(fileList) {
  const files = Array.from(fileList);
  const main = files.find(f=>/\.(glb|gltf|fbx|obj)$/i.test(f.name)) || files[0];
  if (!main) return;

  const urlMap = new Map(files.map(f=>[f.name, URL.createObjectURL(f)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url=>{
    const name = decodeURIComponent(url.split('/').pop());
    return urlMap.get(name) || url;
  });
  manager.onLoad = ()=>{ urlMap.forEach(u=>URL.revokeObjectURL(u)); };

  if (/\.glb$/i.test(main.name)) {
    const l = new GLTFLoader(manager); l.setDRACOLoader(draco); l.setKTX2Loader(ktx2);
    const ab = await main.arrayBuffer();
    const gltf = await l.parseAsync(ab, '');
    onGLTFLoaded(gltf, main.name);
  } else if (/\.gltf$/i.test(main.name)) {
    const text = await main.text();
    const l = new GLTFLoader(manager); l.setDRACOLoader(draco); l.setKTX2Loader(ktx2);
    const gltf = await l.parseAsync(text, '');
    onGLTFLoaded(gltf, main.name);
  } else if (/\.fbx$/i.test(main.name)) {
    const ab = await main.arrayBuffer();
    const fbx = await fbxLoader.parseAsync(ab, '');
    onGenericLoaded(fbx, fbx.animations || [], main.name);
  } else if (/\.obj$/i.test(main.name)) {
    const text = await main.text();
    const obj = objLoader.parse(text);
    onGenericLoaded(obj, [], main.name);
  } else {
    ui.status.innerText = 'unsupported selection. pick a .glb/.gltf/.fbx/.obj (and related files).';
  }
}

async function loadFromUrl(url) {
  if (!url) return;
  const clean = url.trim();
  const ext = clean.split('?')[0].split('#')[0].split('.').pop().toLowerCase();
  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await gltfLoader.loadAsync(clean);
    onGLTFLoaded(gltf, clean);
  } else if (ext === 'fbx') {
    const fbx = await fbxLoader.loadAsync(clean);
    onGenericLoaded(fbx, fbx.animations || [], clean);
  } else if (ext === 'obj') {
    const obj = await objLoader.loadAsync(clean);
    onGenericLoaded(obj, [], clean);
  } else {
    ui.status.innerText = 'url must point to .glb/.gltf/.fbx/.obj and allow cors (http 200 + access-control-allow-origin).';
  }
}

function onGLTFLoaded(gltf, label) {
  const root = gltf.scene || gltf.scenes?.[0];
  const clips = gltf.animations || [];
  currentClips = clips;
  onGenericLoaded(root, clips, label);
}

function onGenericLoaded(root, clips, label) {
  clearScene();
  loadedRoot = root;

  // center + scale to fit
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); const center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  const scale = 1.6 / Math.max(size.x || 1, size.y || 1, size.z || 1);
  const pivot = new THREE.Group(); pivot.add(root);
  root.position.sub(center); root.scale.setScalar(scale);
  scene.add(pivot); loadedRoot = pivot;

  if (clips?.length) mixer = new THREE.AnimationMixer(pivot);

  const report = inspectModel(pivot);
  renderReport(report, label, clips);
  fitCameraToObject(pivot, 1.3);

  // reset procedural baseline & refresg=h availability for this rig
  proc.reset();
  const sel = document.getElementById('procSelect');
  proc.refreshAvailability(sel);

  // log which options are enabled/disabled
  if (logPanel) logPanel.innerHTML = ''; // clear old logs

  // show model + motion availability
  uiLog('model loaded:', label);
  const tableData = Array.from(sel.options).map(o => ({
    motion: o.value,
    disabled: o.disabled
  }));
  uiLog('available motions:', JSON.stringify(tableData, null, 2));
  }


function inspectModel(root) {
  let meshCount = 0, skinnedCount = 0;
  let totalVerts = 0, weightedVerts = 0, totalInfluences = 0, maxInfluences = 0;

  const skeletons = new Set();
  const morphMeshes = [];

  root.traverse(obj=>{
    if (obj.isMesh || obj.isSkinnedMesh) {
      meshCount++;
      const geom = obj.geometry; if (!geom) return;
      const si = geom.getAttribute('skinIndex');
      const sw = geom.getAttribute('skinWeight');
      if (si && sw) {
        skinnedCount++;
        const verts = si.count; totalVerts += verts;
        let localWeighted = 0;
        for (let i=0; i<verts; i++) {
          const w = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
          const count = w.filter(v=>v>1e-5).length;
          if (count>0) localWeighted++;
          totalInfluences += count;
          if (count > maxInfluences) maxInfluences = count;
        }
        weightedVerts += localWeighted;
        if (obj.skeleton) skeletons.add(obj.skeleton);
      }
      const dict = obj.morphTargetDictionary;
      const inf = obj.morphTargetInfluences;
      if (dict && inf) morphMeshes.push({ mesh: obj, dict, influences: inf });
    }
  });

  // unique bone count and tree
  let boneCount = 0;
  skeletons.forEach(s => { boneCount += s.bones.length; });

  const bonesTree = [];
  skeletons.forEach(skel=>{
    const roots = skel.bones.filter(b=>!b.parent || !skel.bones.includes(b.parent));
    roots.forEach(r=> bonesTree.push(printBoneTree(r, 0)));
  });

  morphTargets = morphMeshes;

  const weightedPct = totalVerts ? (100 * weightedVerts / totalVerts) : 0;
  const avgInf = totalVerts ? (totalInfluences / totalVerts) : 0;

  return {
    meshCount, skinnedCount, boneCount,
    weightedPct: weightedPct.toFixed(1) + '%',
    avgInf: avgInf.toFixed(2),
    maxInfluences,
    morphMeshCount: morphMeshes.length,
    bonesTree: bonesTree.join('\n')
  };
}

function printBoneTree(bone, depth) {
  const prefix = '  '.repeat(depth) + (depth? '└─':'') + bone.name;
  let lines = [prefix];
  for (const child of bone.children) if (child.isBone) lines.push(printBoneTree(child, depth+1));
  return lines.join('\n');
}

function renderReport(r, label, clips) {
  ui.meshCount.textContent = r.meshCount;
  ui.skinnedCount.textContent = r.skinnedCount;
  ui.boneCount.textContent = r.boneCount;
  ui.animCount.textContent = clips?.length ?? 0;
  ui.morphMeshCount.textContent = r.morphMeshCount;
  ui.weightedPct.textContent = r.weightedPct;
  ui.avgInf.textContent = r.avgInf;
  ui.maxInf.textContent = r.maxInfluences;
  ui.bonesTree.textContent = r.bonesTree || '(no bones found)';

  const chips = [];
  chips.push(chip('loaded','ok'));
  chips.push(chip(r.skinnedCount>0 ? 'rigged' : 'no skinning', r.skinnedCount>0 ? 'ok' : 'bad'));
  if (r.morphMeshCount>0) chips.push(chip('blendshapes','ok'));
  if ((clips?.length||0)>0) chips.push(chip('animations: '+clips.length,'ok'));
  ui.statusChips.replaceChildren(...chips);

  ui.status.innerText = `source: ${label}
controls: pinch/scroll to zoom, drag to rotate, right-drag to pan.`;

  // morph sliders
  ui.morphControls.innerHTML = '';
  morphTargets.forEach(({mesh, dict, influences}, idx)=>{
    const group = document.createElement('details'); group.open = idx===0;
    const title = document.createElement('summary'); title.textContent = mesh.name || `mesh ${idx+1}`; group.appendChild(title);
    Object.entries(dict).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name, index])=>{
      const row = document.createElement('div'); row.className = 'grid';
      const lab = document.createElement('div'); lab.textContent = name;
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = 0; slider.max = 1; slider.step = 0.01;
      slider.value = influences[index] ?? 0; slider.className = 'slider';
      slider.addEventListener('input', ()=>{ influences[index] = parseFloat(slider.value); });
      row.appendChild(lab); row.appendChild(slider);
      group.appendChild(row);
    });
    ui.morphControls.appendChild(group);
  });

  // animation clips
  ui.anims.innerHTML = '';
  if (clips?.length) {
    clips.forEach((clip, i)=>{
      const row = document.createElement('div'); row.className = 'row kv';
      const name = document.createElement('div'); name.textContent = `${i+1}. ${clip.name} (${clip.duration.toFixed(2)}s)`;
      const btn = document.createElement('button'); btn.textContent = 'play';
      btn.addEventListener('click', ()=>{
        mixer.stopAllAction?.();
        const action = mixer.clipAction(clip);
        action.reset(); action.clampWhenFinished = true; action.loop = THREE.LoopRepeat;
        action.play();
      });
      const speed = document.createElement('input');
      speed.type='number'; speed.value='1'; speed.step='0.1'; speed.style.width='70px';
      speed.addEventListener('change', ()=>{ mixer.timeScale = parseFloat(speed.value)||1; });
      const loop = document.createElement('input'); loop.type='checkbox'; loop.checked=true; loop.title='loop';
      loop.addEventListener('change', ()=>{
        const action = mixer.existingAction(clip);
        if (action) action.setLoop(loop.checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      });
      row.appendChild(name); row.appendChild(btn); row.appendChild(speed); row.appendChild(loop);
      ui.anims.appendChild(row);
    });
    const stop = document.createElement('button'); stop.textContent='stop'; stop.style.marginTop='6px';
    stop.addEventListener('click', ()=> mixer?.stopAllAction?.());
    ui.anims.appendChild(stop);
  } else {
    ui.anims.textContent = '(no animation clips detected)';
  }
}

function chip(text, cls) {
  const el = document.createElement('div'); el.className = 'chip ' + (cls||''); el.textContent = text; return el;
}

function fitCameraToObject(obj, padding = 1.3) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const fov = camera.fov * (Math.PI/180);
  let dist = (maxSize/2) / Math.tan(fov/2);
  dist *= padding;
  const dirVec = new THREE.Vector3(1, 0.8, 1).normalize();
  camera.position.copy(center.clone().add(dirVec.multiplyScalar(dist)));
  camera.near = dist/50; camera.far = dist*50; camera.updateProjectionMatrix();
  controls.target.copy(center); controls.maxDistance = dist*4; controls.update();
}

// events
fileInput.addEventListener('change', async (e)=>{
  try { await loadFromFiles(e.target.files); }
  catch(err) { ui.status.innerText = 'load error: ' + err.message; }
});
loadUrlBtn.addEventListener('click', async ()=>{
  try { await loadFromUrl(urlInput.value); }
  catch(err) { ui.status.innerText = 'load error: ' + err.message + '\nlikely cors blocked.'; }
});
document.addEventListener('dragover', e=>{ e.preventDefault(); });
document.addEventListener('drop', e=>{
  e.preventDefault();
  if (e.dataTransfer?.files?.length) loadFromFiles(e.dataTransfer.files);
});
document.getElementById('panel').addEventListener('touchmove', e=>{ e.stopPropagation(); }, {passive:true});

// procedural ui
ui.procPlay.addEventListener('click', ()=>{
  if (!loadedRoot) {
    ui.status.innerText = 'load a model first.';
    return;
  }
  const key = ui.procSelect.value;
  const ok = proc.play(key);
  uiLog('play:', key, ok ? '✓' : 'x (unsupported)');
});

ui.procStop.addEventListener('click', ()=>{
  uiLog('stop');
  proc.stop();
});
