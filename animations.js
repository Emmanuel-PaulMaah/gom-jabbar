// animations.js — procedural bone + morph controller

export function createProceduralController({ getRoot }) {
  let current = null;
  let base = null;

  // ---------- bone lookup ----------
  function findBoneExact(name) {
    const root = getRoot(); if (!root) return null;
    const want = name.toLowerCase();
    let hit = null;
    root.traverse(o => { if (!hit && o.isBone && (o.name||'').toLowerCase() === want) hit = o; });
    return hit;
  }

  // common humanoid aliases
  function firstHit(names) { return names.reduce((h, n) => h || findBoneExact(n), null); }

  const bones = {
    // core
    get hips() { return firstHit(['Hips']); },
    get spine() { return firstHit(['Spine2','Spine1','Spine']); },
    get neck() { return firstHit(['Neck']); },
    get head() { return firstHit(['Head']); },
    get lEye() { return firstHit(['LeftEye']); },
    get rEye() { return firstHit(['RightEye']); },
    // shoulders/arms
    get lShoulder() { return firstHit(['LeftShoulder']); },
    get rShoulder() { return firstHit(['RightShoulder']); },
    get lArm() { return firstHit(['LeftArm']); },
    get rArm() { return firstHit(['RightArm']); },
    get lForeArm() { return firstHit(['LeftForeArm']); },
    get rForeArm() { return firstHit(['RightForeArm']); },
    get lHand() { return firstHit(['LeftHand']); },
    get rHand() { return firstHit(['RightHand']); },
    // legs/feet
    get lUpLeg() { return firstHit(['LeftUpLeg']); },
    get rUpLeg() { return firstHit(['RightUpLeg']); },
    get lLeg() { return firstHit(['LeftLeg']); },
    get rLeg() { return firstHit(['RightLeg']); },
    get lFoot() { return firstHit(['LeftFoot']); },
    get rFoot() { return firstHit(['RightFoot']); },
    get lToe() { return firstHit(['LeftToeBase']); },
    get rToe() { return firstHit(['RightToeBase']); },
  };

  // ---------- morph lookup ----------
  // Build a map { name -> { mesh, index } } for quick influence set.
  let morphMap = null;

  function buildMorphMap() {
    morphMap = new Map();
    const root = getRoot(); if (!root) return;
    root.traverse(o => {
      if (!(o.isMesh || o.isSkinnedMesh)) return;
      const dict = o.morphTargetDictionary, inf = o.morphTargetInfluences;
      if (!dict || !inf) return;
      for (const [key, idx] of Object.entries(dict)) {
        // prefer first occurrence; skip duplicates
        if (!morphMap.has(key)) morphMap.set(key, { mesh: o, index: idx, influences: inf });
      }
    });
  }

  function setMorph(name, v) {
    if (!morphMap) buildMorphMap();
    const hit = morphMap.get(name);
    if (hit) hit.influences[hit.index] = v;
  }

  function getMorph(name) {
    if (!morphMap) buildMorphMap();
    const hit = morphMap.get(name);
    return hit ? hit.influences[hit.index] : 0;
  }

  function zeroMorphs(prefixes = []) {
    if (!morphMap) buildMorphMap();
    morphMap.forEach(({ influences, index }, key) => {
      if (prefixes.length === 0 || prefixes.some(p => key.startsWith(p))) influences[index] = 0;
    });
  }

  // ---------- base pose cache/reset ----------
  function cacheBase() {
    const root = getRoot(); if (!root) return;
    base = {
      rootPos: root.position.clone(),
      rootRot: root.rotation.clone(),
      hipsRot: bones.hips?.rotation.clone(),
      spineRot: bones.spine?.rotation.clone(),
      neckRot: bones.neck?.rotation.clone(),
      headRot: bones.head?.rotation.clone(),
      leRot: bones.lEye?.rotation.clone(),
      reRot: bones.rEye?.rotation.clone(),
      lShRot: bones.lShoulder?.rotation.clone(),
      rShRot: bones.rShoulder?.rotation.clone(),
      lArRot: bones.lArm?.rotation.clone(),
      rArRot: bones.rArm?.rotation.clone(),
      lFaRot: bones.lForeArm?.rotation.clone(),
      rFaRot: bones.rForeArm?.rotation.clone(),
      lHdRot: bones.lHand?.rotation.clone(),
      rHdRot: bones.rHand?.rotation.clone(),
      lUpRot: bones.lUpLeg?.rotation.clone(),
      rUpRot: bones.rUpLeg?.rotation.clone(),
      lLgRot: bones.lLeg?.rotation.clone(),
      rLgRot: bones.rLeg?.rotation.clone(),
      lFtRot: bones.lFoot?.rotation.clone(),
      rFtRot: bones.rFoot?.rotation.clone(),
    };
  }

  function copyIf(b, r) { if (b && r) b.rotation.copy(r); }
  function resetPose() {
    const root = getRoot(); if (!root || !base) return;
    root.position.copy(base.rootPos);
    root.rotation.copy(base.rootRot);
    copyIf(bones.hips, base.hipsRot);
    copyIf(bones.spine, base.spineRot);
    copyIf(bones.neck, base.neckRot);
    copyIf(bones.head, base.headRot);
    copyIf(bones.lEye, base.leRot);
    copyIf(bones.rEye, base.reRot);
    copyIf(bones.lShoulder, base.lShRot);
    copyIf(bones.rShoulder, base.rShRot);
    copyIf(bones.lArm, base.lArRot);
    copyIf(bones.rArm, base.rArRot);
    copyIf(bones.lForeArm, base.lFaRot);
    copyIf(bones.rForeArm, base.rFaRot);
    copyIf(bones.lHand, base.lHdRot);
    copyIf(bones.rHand, base.rHdRot);
    copyIf(bones.lUpLeg, base.lUpRot);
    copyIf(bones.rUpLeg, base.rUpRot);
    copyIf(bones.lLeg, base.lLgRot);
    copyIf(bones.rLeg, base.rLgRot);
    copyIf(bones.lFoot, base.lFtRot);
    copyIf(bones.rFoot, base.rFtRot);
    // reset common facial morphs we’ll drive
    zeroMorphs(['mouth','viseme','eye','brow','cheek']);
  }

  // ---------- utils ----------
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const smoothstep = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const lerp = (a,b,t) => a + (b-a)*t;
  const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
  const easeInOut = t => (t<0.5) ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;

  // ---------- motions (10) ----------
  // return { update(t, dt), done(t) }

  const motions = {
    // 1A. Calm idle breath + micro sway (6–8s loop once)
    idleCalm() {
      const T = 7.0;
      return {
        update: (t) => {
          const p = clamp01(t/T);
          const k = Math.sin(p * Math.PI * 2);
          const root = getRoot();
          if (root && base.rootPos) root.position.y = base.rootPos.y + k * 0.008; // ±0.8 cm
          if (bones.spine && base.spineRot) bones.spine.rotation.x = base.spineRot.x + k * 0.035;
          if (bones.lShoulder && base.lShRot) bones.lShoulder.rotation.x = base.lShRot.x + k * 0.015;
          if (bones.rShoulder && base.rShRot) bones.rShoulder.rotation.x = base.rShRot.x + k * 0.015;
          // counter sway
          if (bones.neck && base.neckRot) bones.neck.rotation.z = base.neckRot.z + Math.sin(p * Math.PI * 2 + Math.PI/2) * 0.007;
          if (bones.head && base.headRot) bones.head.rotation.y = base.headRot.y + Math.sin(p * Math.PI * 1.5) * 0.01;
        },
        done: (t) => t >= T
      };
    },

    // 1B. Alert idle with weight micro-shifts (5s)
    idleAlertShift() {
      const T = 5.0;
      return {
        update: (t) => {
          const p = clamp01(t/T);
          const s = Math.sin(p * Math.PI * 2);
          if (bones.hips && base.rootPos) bones.hips.position.x = base.rootPos.x + s * 0.015;
          if (bones.spine && base.spineRot) bones.spine.rotation.z = base.spineRot.z - s * 0.014;
          if (bones.lFoot && base.lFtRot) bones.lFoot.rotation.z = base.lFtRot.z + s * 0.02;
          if (bones.rFoot && base.rFtRot) bones.rFoot.rotation.z = base.rFtRot.z - s * 0.02;
        },
        done: (t) => t >= T
      };
    },

    // 2A. Curious scan (head+eyes+brows) (3s)
    curiousScan() {
      const T = 3.0;
      const head = bones.head || bones.neck;
      const hops = [
        { t: 0.15, yaw: +0.17, pitch: -0.05, gaze: [+0.28, -0.06] },
        { t: 1.20, yaw: -0.14, pitch: -0.03, gaze: [-0.22,  0.03] },
        { t: 2.30, yaw:  0.00, pitch:  0.00, gaze: [ 0.00,  0.00] },
      ];
      return {
        update: (t) => {
          const p = clamp01(t/T);
          // eyes lead by ~120ms: pick last hop <= t-0.12
          const gazeT = Math.max(0, t - 0.12);
          const h1 = hops.reduce((a,h)=> (gazeT>=h.t? h:a), hops[0]);
          const h2 = hops.reduce((a,h)=> (t>=h.t? h:a), hops[0]);

          if (bones.lEye && bones.rEye) {
            const lx = lerp(bones.lEye.rotation.x, h1.gaze[1], 0.35);
            const ly = lerp(bones.lEye.rotation.y, h1.gaze[0], 0.35);
            bones.lEye.rotation.x = lx; bones.lEye.rotation.y = ly;
            bones.rEye.rotation.x = lx; bones.rEye.rotation.y = ly;
          }
          if (head && base.headRot) {
            head.rotation.y = lerp(head.rotation.y, (base.headRot.y + h2.yaw), 0.2);
            head.rotation.x = lerp(head.rotation.x, (base.headRot.x + h2.pitch), 0.2);
          }
          // brows: subtle rise on first half, relax later
          const e = easeInOut(p);
          setMorph('browInnerUp', 0.15*e);
          setMorph('browOuterUpLeft', 0.10*e);
          setMorph('browOuterUpRight', 0.10*e);
        },
        done: (t) => t >= T
      };
    },

    // 2B. Nod + micro blink (1s)
    nodBlink() {
      const T = 1.0;
      const head = bones.head || bones.neck;
      return {
        update: (t) => {
          const p = clamp01(t/T);
          const wave = Math.sin(p * Math.PI * 2); // two peaks
          if (head && base.headRot) head.rotation.x = base.headRot.x - wave * 0.10;
          // blink near nadir
          const blink = Math.exp(-Math.pow((p - 0.5) / 0.08, 2));
          setMorph('eyeBlinkLeft', Math.min(1, 0.9*blink));
          setMorph('eyeBlinkRight', Math.min(1, 0.9*blink));
        },
        done: (t) => t >= T
      };
    },

    // 3A. One-hand explainer (right) (1.4s)
    explainRight() {
      const T = 1.4;
      return {
        update: (t) => {
          const p = clamp01(t/T), e = easeInOut(p);
          if (bones.rShoulder && base.rShRot) bones.rShoulder.rotation.x = base.rShRot.x + e * 0.26;
          if (bones.rArm && base.rArRot) bones.rArm.rotation.y = base.rArRot.y + e * 0.14;
          if (bones.rForeArm && base.rFaRot) bones.rForeArm.rotation.x = base.rFaRot.x - Math.sin(e*Math.PI)*0.40; // open→close→open
          if (bones.rHand && base.rHdRot) bones.rHand.rotation.z = base.rHdRot.z + Math.sin(e*Math.PI*2)*0.20;
          if (bones.spine && base.spineRot) bones.spine.rotation.y = base.spineRot.y - e * 0.07; // counter
          if (bones.hips && base.rootRot) getRoot().rotation.y = base.rootRot.y - e * 0.03;
        },
        done: (t) => t >= T
      };
    },

    // 3B. Two-hand open welcome (2.0s)
    welcomeOpen() {
      const T = 2.0;
      return {
        update: (t) => {
          const p = clamp01(t/T), e = easeOut(p);
          if (bones.lShoulder && base.lShRot) bones.lShoulder.rotation.z = base.lShRot.z + e * 0.45;
          if (bones.rShoulder && base.rShRot) bones.rShoulder.rotation.z = base.rShRot.z - e * 0.45;
          if (bones.lArm && base.lArRot) bones.lArm.rotation.x = base.lArRot.x - e * 0.20;
          if (bones.rArm && base.rArRot) bones.rArm.rotation.x = base.rArRot.x - e * 0.20;
          if (bones.lForeArm && base.lFaRot) bones.lForeArm.rotation.x = base.lFaRot.x + e * 0.35;
          if (bones.rForeArm && base.rFaRot) bones.rForeArm.rotation.x = base.rFaRot.x + e * 0.35;
          if (bones.spine && base.spineRot) bones.spine.rotation.x = base.spineRot.x + e * 0.035; // chest lift
        },
        done: (t) => t >= T
      };
    },

    // 4A. Left→right weight transfer (2.2s)
    weightTransfer() {
      const T = 2.2;
      return {
        update: (t) => {
          const p = clamp01(t/T);
          const s = Math.sin(p*Math.PI); // 0→1→0
          if (bones.hips && base.rootPos) bones.hips.position.x = base.rootPos.x + lerp(-0.025, +0.025, s); // ±2.5cm
          if (bones.hips && base.rootRot) bones.hips.rotation.z = base.rootRot.z + lerp(+0.05, -0.05, s);
          if (bones.spine && base.spineRot) bones.spine.rotation.z = base.spineRot.z - lerp(+0.03, -0.03, s); // counter-roll
          if (bones.lKnee && bones.rKnee) { /* optional if naming exists */ }
        },
        done: (t) => t >= T
      };
    },

    // 4B. Lean-in emphasis (1.4s in, 0.6 out)
    leanIn() {
      const Tin = 1.4, Tout = 0.6, T = Tin+Tout;
      return {
        update: (t) => {
          const root = getRoot();
          if (!root || !base) return;
          if (t < Tin) {
            const e = easeInOut(t/Tin);
            root.position.z = base.rootPos.z - e * 0.04;
            if (bones.spine && base.spineRot) bones.spine.rotation.x = base.spineRot.x + e * 0.05;
            if (bones.head && base.headRot) bones.head.rotation.x = base.headRot.x - e * 0.07;
          } else {
            const u = (t - Tin)/Tout;
            const e = 1 - easeInOut(u);
            root.position.z = base.rootPos.z - e * 0.04;
            if (bones.spine && base.spineRot) bones.spine.rotation.x = base.spineRot.x + e * 0.05;
            if (bones.head && base.headRot) bones.head.rotation.x = base.headRot.x - e * 0.07;
          }
        },
        done: (t) => t >= T
      };
    },

    // 5A. Natural speech loop (4.5s)
    speechLoop() {
      const T = 4.5;
      return {
        update: (t) => {
          const p = clamp01(t/T);
          // syllabic bursts 8–14 Hz approximated by noise-y sin
          const jaw = 0.25 + 0.2 * Math.abs(Math.sin(t*12.0)) * (0.6 + 0.4*Math.sin(t*1.7));
          setMorph('jawOpen', Math.min(1, jaw));
          // simple viseme mix: funnel vs spread
          const round = 0.2 * (0.5 + 0.5*Math.sin(t*1.9));
          const press = 0.2 * (0.5 + 0.5*Math.sin(t*2.4 + 1.3));
          setMorph('mouthFunnel', round);
          setMorph('mouthPucker', round*0.5);
          setMorph('mouthPressLeft', press*0.8);
          setMorph('mouthPressRight', press*0.8);
          // micro blinks
          const blink = Math.max(0, Math.sin((t+0.3)*Math.PI*0.35)); // every ~3s
          setMorph('eyeBlinkLeft', blink>0.98 ? 0.9 : getMorph('eyeBlinkLeft')*0.94);
          setMorph('eyeBlinkRight', blink>0.98 ? 0.9 : getMorph('eyeBlinkRight')*0.94);
          // light brow punctuation
          setMorph('browDownLeft', 0.05*Math.max(0, Math.sin(t*0.8)));
          setMorph('browDownRight', 0.05*Math.max(0, Math.sin(t*0.8)));
        },
        done: (t) => t >= T
      };
    },

    // 5B. Smile → smirk transition (1.5s + 0.8s + 1.2s)
    smileToSmirk() {
      const Ta=1.5, Tb=0.8, Tc=1.2, T=Ta+Tb+Tc;
      return {
        update: (t) => {
          if (t < Ta) {
            const e = easeInOut(t/Ta);
            setMorph('mouthSmileLeft', 0.5*e);
            setMorph('mouthSmileRight', 0.5*e);
            setMorph('cheekSquintLeft', 0.15*e);
            setMorph('cheekSquintRight', 0.15*e);
            setMorph('eyeSquintLeft', 0.1*e);
            setMorph('eyeSquintRight', 0.1*e);
          } else if (t < Ta+Tb) {
            const u = (t - Ta)/Tb, e = easeInOut(u);
            setMorph('mouthSmileRight', lerp(0.5, 0.2, e));
            setMorph('mouthSmileLeft',  lerp(0.5, 0.6, e));
            setMorph('mouthPressRight', 0.1*e);
          } else {
            const u = (t - Ta - Tb)/Tc, e = 1 - easeInOut(u);
            setMorph('mouthSmileLeft', 0.6*e);
            setMorph('mouthSmileRight',0.2*e);
            setMorph('mouthPressRight',0.1*e);
            setMorph('eyeSquintLeft', 0.1*e);
            setMorph('eyeSquintRight',0.1*e);
            setMorph('cheekSquintLeft',0.15*e);
            setMorph('cheekSquintRight',0.15*e);
          }
        },
        done: (t) => t >= T
      };
    },
  };

  // ---------- controller api ----------
  let t0 = 0;
  function play(key) {
    const root = getRoot(); if (!root) return false;
    if (current) current = null;
    cacheBase();
    resetPose();
    const m = motions[key]?.();
    if (!m) return false;
    current = m; t0 = performance.now()/1000;
    return true;
  }
  function stop() { current = null; resetPose(); }
  function reset() { current = null; base = null; morphMap = null; }
  function update(globalT, dt) {
    if (!current) return;
    const t = globalT - t0;
    current.update(t, dt);
    if (current.done(t)) stop();
  }

  // availability gates based on rig + morphs
  function hasMorph(name) { if (!morphMap) buildMorphMap(); return morphMap.has(name); }
  function availability() {
    return {
      idleCalm: true,
      idleAlertShift: true,
      curiousScan: !!(bones.head || bones.neck) && bones.lEye && bones.rEye,
      nodBlink: !!(bones.head || bones.neck),
      explainRight: !!(bones.rShoulder && bones.rArm && bones.rForeArm && bones.rHand),
      welcomeOpen: !!(bones.lShoulder && bones.rShoulder && bones.lArm && bones.rArm),
      weightTransfer: !!bones.hips,
      leanIn: true,
      speechLoop: hasMorph('jawOpen') || hasMorph('viseme_sil'),
      smileToSmirk: hasMorph('mouthSmileLeft') && hasMorph('mouthSmileRight'),
    };
  }
  function refreshAvailability(selectEl) {
    if (!selectEl) return;
    const avail = availability();
    Array.from(selectEl.querySelectorAll('option')).forEach(opt => { opt.disabled = !avail[opt.value]; });
  }

  return { play, stop, reset, update, refreshAvailability };
}

// exported for UI population if desired
export const motionKeys = [
  'idleCalm','idleAlertShift',
  'curiousScan','nodBlink',
  'explainRight','welcomeOpen',
  'weightTransfer','leanIn',
  'speechLoop','smileToSmirk'
];
