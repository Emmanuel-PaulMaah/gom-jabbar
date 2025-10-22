// exposes a small controller: play(key), stop(), reset(), update(t,dt)
// keys: listeningIdle, breathingLoop, weightShift, eyebrowRaise, relaxedCalm, eyeDarts

export function createProceduralController({ getRoot, getMorphTargets }) {
  let current = null;
  let base = null;
  let blinkNextAt = 0;

  function traverseBones(fn) {
    const root = getRoot();
    if (!root) return;
    root.traverse(o=>{ if (o.isBone) fn(o); });
  }

  function findBone(names=[]) {
    const root = getRoot(); if (!root) return null;
    let hit = null;
    traverseBones(b=>{
      if (hit) return;
      const n = b.name?.toLowerCase() || '';
      if (names.some(k=>n.includes(k))) hit = b;
    });
    return hit;
  }

  function findMorph(meshPredicate, namePredicates=[]) {
    const m = getMorphTargets() || [];
    for (const {mesh, dict} of m) {
      if (meshPredicate && !meshPredicate(mesh)) continue;
      for (const [n, idx] of Object.entries(dict)) {
        const ln = n.toLowerCase();
        if (namePredicates.some(k=>ln.includes(k))) return { mesh, index: idx };
      }
    }
    return null;
  }

  function getHead() { return findBone(['head','mixamorig:head','b_head','neck']); }
  function getLeftEye() { return findBone(['lefteye','eye_l','mixamorig:lefteye','eye.l']); }
  function getRightEye() { return findBone(['righteye','eye_r','mixamorig:righteye','eye.r']); }

  function cacheBase() {
    const root = getRoot(); if (!root) return;
    base = {
      rootPos: root.position.clone(),
      rootRot: root.rotation.clone(),
      headRot: getHead()?.rotation.clone(),
      leftEyeRot: getLeftEye()?.rotation.clone(),
      rightEyeRot: getRightEye()?.rotation.clone(),
    };
  }

  function morphZero(keys=[]) {
    (getMorphTargets()||[]).forEach(({mesh,dict,influences})=>{
      Object.entries(dict).forEach(([n,i])=>{
        const ln = n.toLowerCase();
        if (keys.some(k=>ln.includes(k))) influences[i] = 0;
      });
      mesh.needsUpdate = true;
    });
  }

  function resetPose() {
    const root = getRoot(); if (!root || !base) return;
    root.position.copy(base.rootPos); root.rotation.copy(base.rootRot);
    const h = getHead(); if (h && base.headRot) h.rotation.copy(base.headRot);
    const le = getLeftEye(); if (le && base.leftEyeRot) le.rotation.copy(base.leftEyeRot);
    const re = getRightEye(); if (re && base.rightEyeRot) re.rotation.copy(base.rightEyeRot);
    morphZero(['brow','blink','lid','eyebrow']);
  }

  const motions = {
    listeningIdle() {
      const head = getHead(); const root = getRoot();
      return (t)=>{
        const a = 0.08, f = 0.35;
        if (head) {
          head.rotation.z = (base.headRot?.z||0) + Math.sin(t*f)*a;
          head.rotation.x = (base.headRot?.x||0) + Math.sin(t*f*0.5)*0.03;
        } else if (root) {
          root.rotation.z = (base.rootRot?.z||0) + Math.sin(t*f)*a*0.5;
        }
      };
    },

    breathingLoop() {
      const head = getHead(); const root = getRoot();
      return (t)=>{
        const amp = 0.015, f = 0.5;
        const dy = Math.sin(t*f)*amp;
        if (root) root.position.y = (base.rootPos?.y||0) + dy;
        if (head) head.rotation.x = (base.headRot?.x||0) + Math.sin(t*f)*0.02;
      };
    },

    weightShift() {
      const root = getRoot();
      return (t)=>{
        const amp = 0.015, f = 0.25;
        const dx = Math.sin(t*f)*amp;
        if (!root) return;
        root.position.x = (base.rootPos?.x||0) + dx;
        root.rotation.y = (base.rootRot?.y||0) + dx*1.2;
      };
    },

    eyebrowRaise() {
      const brow = findMorph(null,['brow','innerbrow','outerbrow','eyebrow']);
      return (t)=>{
        if (!brow) return;
        const {mesh,index} = brow;
        const inf = mesh.morphTargetInfluences;
        inf[index] = 0.3 + Math.max(0, Math.sin(t*1.2))*0.25;
      };
    },

    relaxedCalm() {
      const root = getRoot();
      const head = getHead();
      const blink = findMorph(null,['blink','eyeclose','eye_close','lid']);
      blinkNextAt = 0;
      return (t)=>{
        if (root) root.position.y = (base.rootPos?.y||0) + Math.sin(t*0.25)*0.01;
        if (head) head.rotation.x = (base.headRot?.x||0) + 0.05;

        if (blink) {
          const {mesh,index} = blink;
          const inf = mesh.morphTargetInfluences;
          if (t >= blinkNextAt) {
            const phase = (t - blinkNextAt) * 8;
            if (phase < 0.5) inf[index] = phase*2;
            else if (phase < 1.0) inf[index] = 1 - (phase-0.5)*2;
            else { inf[index] = 0; blinkNextAt = t + 2 + Math.random()*3; }
          }
          if (blinkNextAt === 0) blinkNextAt = t + 1 + Math.random()*2;
        }
      };
    },

    eyeDarts() {
      const le = getLeftEye(), re = getRightEye();
      let hold = 0, target = {x:0,y:0};
      function retarget(now) {
        target = { x:(Math.random()-0.5)*0.08, y:(Math.random()-0.5)*0.05 };
        hold = now + 0.5 + Math.random()*1.2;
      }
      return (t)=>{
        if (t > hold) retarget(t);
        const lerp = 0.12;
        if (le) { le.rotation.y += (target.x - le.rotation.y) * lerp; le.rotation.x += (target.y - le.rotation.x) * lerp; }
        if (re) { re.rotation.y += (target.x - re.rotation.y) * lerp; re.rotation.x += (target.y - re.rotation.x) * lerp; }
      };
    }
  };

  // controller api
  function play(key) {
    const root = getRoot();
    if (!root) return;
    cacheBase();
    resetPose();
    current = motions[key]?.();
  }
  function stop() { current = null; resetPose(); }
  function reset() { current = null; base = null; }
  function update(t, dt) { if (current) current(t, dt); }

  return { play, stop, reset, update };
}
