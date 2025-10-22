// animations.js — bone-based procedural motions for this skeleton:
// Hips, Spine, Spine1, Spine2, Neck, Head, LeftEye, RightEye, ...

export function createProceduralController({ getRoot }) {
  let current = null;
  let base = null;

  // exact-name lookup, case-insensitive
  function findBoneExact(name) {
    const root = getRoot(); if (!root) return null;
    const want = name.toLowerCase();
    let hit = null;
    root.traverse(o => {
      if (hit || !o.isBone) return;
      if ((o.name || '').toLowerCase() === want) hit = o;
    });
    return hit;
  }

  // convenience getters for your rig
  const bones = {
    get hips() { return findBoneExact('Hips'); },
    get spine() { return findBoneExact('Spine2') || findBoneExact('Spine1') || findBoneExact('Spine'); },
    get neck() { return findBoneExact('Neck'); },
    get head() { return findBoneExact('Head'); },
    get lEye() { return findBoneExact('LeftEye'); },
    get rEye() { return findBoneExact('RightEye'); },
  };

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
    };
  }

  function resetPose() {
    const root = getRoot(); if (!root || !base) return;
    root.position.copy(base.rootPos);
    root.rotation.copy(base.rootRot);
    if (bones.hips && base.hipsRot) bones.hips.rotation.copy(base.hipsRot);
    if (bones.spine && base.spineRot) bones.spine.rotation.copy(base.spineRot);
    if (bones.neck && base.neckRot) bones.neck.rotation.copy(base.neckRot);
    if (bones.head && base.headRot) bones.head.rotation.copy(base.headRot);
    if (bones.lEye && base.leRot) bones.lEye.rotation.copy(base.leRot);
    if (bones.rEye && base.reRot) bones.rEye.rotation.copy(base.reRot);
  }

  // utils
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const smoothstep = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  // finite sequences: return { update(t, dt), done() }
  const motions = {
    // listening / conversational: tilt left → right → settle (4s)
    listeningIdle() {
      const head = bones.head || bones.neck;
      if (!head) return null;
      const T = 4.0, a = 0.18;
      return {
        update: (t) => {
          const p = clamp01(t / T);
          let phase;
          if (p < 0.33) phase = smoothstep(p / 0.33);           // left
          else if (p < 0.66) phase = 1 - smoothstep((p - 0.33) / 0.33); // to right
          else phase = smoothstep((p - 0.66) / 0.34) * 0.0;     // settle to 0
          head.rotation.z = (base.headRot?.z || 0) + (phase - 0.5) * 2 * a;
          head.rotation.x = (base.headRot?.x || 0) + (Math.sin(p * Math.PI) * 0.05);
        },
        done: (t) => t >= T
      };
    },

    // relaxed / idle loops: two breaths then stop (6s)
    breathingLoop() {
      const spine = bones.spine;
      const T = 6.0; // 2 cycles at 0.33 Hz
      return {
        update: (t) => {
          const p = clamp01(t / T);
          const y = Math.sin(p * Math.PI * 4) * 0.02; // up/down
          if (spine && base.spineRot) spine.rotation.x = base.spineRot.x + Math.sin(p * Math.PI * 4) * 0.03;
          const root = getRoot();
          if (root && base.rootPos) root.position.y = base.rootPos.y + y;
        },
        done: (t) => t >= T
      };
    },

    // posture dynamics: sway left ↔ right with slight yaw (3s)
    weightShift() {
      const hips = bones.hips || getRoot();
      if (!hips) return null;
      const T = 3.0, a = 0.03;
      return {
        update: (t) => {
          const p = clamp01(t / T);
          const s = Math.sin(p * Math.PI * 2);
          if (hips.position && base.rootPos) hips.position.x = base.rootPos.x + s * a;
          if (base.rootRot) getRoot().rotation.y = base.rootRot.y + s * 0.07;
        },
        done: (t) => t >= T
      };
    },

    // engaged: quick double nod (1.6s)
    eyebrowRaise() { // renamed behavior: double nod via head.x
      const head = bones.head || bones.neck;
      if (!head) return null;
      const T = 1.6;
      return {
        update: (t) => {
          const p = clamp01(t / T);
          // two pulses
          const pulse = (q) => Math.exp(-40 * (q - 0.15) ** 2) + Math.exp(-40 * (q - 0.55) ** 2);
          head.rotation.x = (base.headRot?.x || 0) + pulse(p) * 0.20;
        },
        done: (t) => t >= T
      };
    },

    // emotional tone: head lower, micro stillness, return (3s)
    relaxedCalm() {
      const head = bones.head || bones.neck;
      const T = 3.0;
      return {
        update: (t) => {
          const p = clamp01(t / T);
          const down = smoothstep(Math.min(p, 0.5) / 0.5) * 0.08; // down in first half
          const up = p > 0.5 ? smoothstep((p - 0.5) / 0.5) * 0.08 : 0; // back up
          if (head) head.rotation.x = (base.headRot?.x || 0) + (down - up);
        },
        done: (t) => t >= T
      };
    },

    // stylized: 3 eye darts then stop (~2.5s)
    eyeDarts() {
      const le = bones.lEye, re = bones.rEye;
      if (!le || !re) return null;
      const T = 2.5;
      const hops = [
        { t: 0.3, x: 0.06, y: -0.02 },
        { t: 1.2, x: -0.05, y: 0.03 },
        { t: 1.9, x: 0.00, y: 0.00 }
      ];
      return {
        update: (t) => {
          // pick last target with time <= t, ease toward it
          const target = hops.reduce((acc, h) => (t >= h.t ? h : acc), hops[0]);
          const lerp = 0.35;
          [le, re].forEach(eye => {
            eye.rotation.y += (target.x - eye.rotation.y) * lerp;
            eye.rotation.x += (target.y - eye.rotation.x) * lerp;
          });
        },
        done: (t) => t >= T
      };
    }
  };

  // controller api
  let t0 = 0;
    function play(key) {
    const root = getRoot(); if (!root) return false;

    // stop any currently running motion
    if (current) { current = null; }

    cacheBase();
    resetPose();

    const m = motions[key]?.();
    if (!m) return false;

    current = m;
    t0 = performance.now() / 1000;
    return true;
  }

  function stop() { current = null; resetPose(); }
  function reset() { current = null; base = null; }
  function update(globalT /* seconds */, dt) {
    if (!current) return;
    const t = globalT - t0;
    current.update(t, dt);
    if (current.done(t)) { stop(); }
  }

  // disable options not supported by this rig
  function availability() {
    return {
      listeningIdle: !!(bones.head || bones.neck),
      breathingLoop: true,
      weightShift: true,
      eyebrowRaise: !!(bones.head || bones.neck),
      relaxedCalm: !!(bones.head || bones.neck),
      eyeDarts: !!(bones.lEye && bones.rEye),
    };
  }
  function refreshAvailability(selectEl) {
    if (!selectEl) return;
    const avail = availability();
    Array.from(selectEl.querySelectorAll('option')).forEach(opt=>{
      opt.disabled = !avail[opt.value];
    });
  }

  return { play, stop, reset, update, refreshAvailability };
}

// exported for app.js usage if needed
export const motionKeys = ['listeningIdle','breathingLoop','weightShift','eyebrowRaise','relaxedCalm','eyeDarts'];
