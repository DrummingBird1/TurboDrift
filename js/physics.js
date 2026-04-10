// js/physics.js — Vehicle physics & collision (FIXED driving)
export function updatePhysics(dt, S, carCfg, keys, colls, nitroRef, audioMod, sfxOn, particles, THREE, GFX) {
  dt = Math.min(dt, .033);
  const C = carCfg;
  let thr = 0, brk = 0, trn = 0, hb = false, nit = false;

  if (keys.KeyW || keys.ArrowUp) thr = 1;
  if (keys.KeyS || keys.ArrowDown) brk = 1;
  if (keys.KeyA || keys.ArrowLeft) trn = 1;
  if (keys.KeyD || keys.ArrowRight) trn = -1;
  if (keys.Space) hb = true;
  if (keys.ShiftLeft || keys.ShiftRight) nit = true;

  // Nitro
  if (nit && nitroRef.val > 0) {
    thr = 1.9; nitroRef.val = Math.max(0, nitroRef.val - 28 * dt);
    if (Math.random() < .08 && sfxOn) audioMod.sfx('nit');
  } else nitroRef.val = Math.min(100, nitroRef.val + 4 * dt);

  // *** FIX: Higher acceleration and better speed feel ***
  const accelMult = dt * 60; // normalize to 60fps
  if (thr > 0) S.spd += C.acc * thr * accelMult * 1.2; // 20% more responsive
  if (brk > 0) S.spd -= .06 * accelMult;
  S.spd -= S.spd * .004 * accelMult; // slightly less drag
  if (Math.abs(S.spd) < .001) S.spd = 0;
  S.spd = Math.max(-.8, Math.min(C.ms, S.spd));

  // Steering
  const sf = Math.min(Math.abs(S.spd) / 1.2, 1); // respond earlier
  const ta = trn * .03 * sf * accelMult; // slightly more turn

  if (hb && Math.abs(S.spd) > .25) {
    S.av += ta * 2.5 * C.dft;
    S.spd *= (1 - .008 * accelMult);
    S.isDrift = true;
    S.dScore += Math.abs(S.av) * Math.abs(S.spd) * 500 * dt;
  } else {
    S.av = S.av * .82 + ta * .82;
    S.isDrift = Math.abs(S.av) > .012 && Math.abs(S.spd) > .4;
  }

  if (!S.isDrift && S.dScore > 10) {
    S.driftToSave = S.dScore;
    S.dScore = 0;
  }

  S.a += S.av;
  S.av *= hb ? .96 : .9;

  // *** FIX: Higher grip lerp for responsive driving ***
  const fwd = new THREE.Vector3(Math.sin(S.a), 0, Math.cos(S.a));
  const tv = fwd.clone().multiplyScalar(S.spd);
  const gripFactor = hb ? C.grip * .6 : C.grip * 1.5; // was 0.5 / 1.2
  S.v.lerp(tv, Math.min(gripFactor, .35)); // cap at .35 for stability
  S.p.add(S.v.clone().multiplyScalar(accelMult));

  // Collisions
  for (const c of colls) {
    const dx = S.p.x - c.x, dz = S.p.z - c.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const md = c.r + 1.3;
    if (dist < md && dist > .01) {
      const nx = dx / dist, nz = dz / dist;
      S.p.x = c.x + nx * md; S.p.z = c.z + nz * md;
      const imp = Math.abs(S.spd);
      const dot = S.v.x * nx + S.v.z * nz;
      S.v.x -= 1.5 * dot * nx; S.v.z -= 1.5 * dot * nz;
      S.spd *= -.2;
      if (imp > .2) {
        if (sfxOn) audioMod.sfx('hit', imp);
        S.hp = Math.max(0, S.hp - imp * 3);
        if (GFX.part && particles) {
          for (let i = 0; i < 5; i++) particles.spawn(
            new THREE.Vector3(S.p.x + nx * 1.5, .5, S.p.z + nz * 1.5),
            new THREE.Vector3((Math.random()-.5)*3, 1+Math.random()*2, (Math.random()-.5)*3),
            1, 2+Math.random()*2, .06+Math.random()*.08, new THREE.Color(1,.8,.2)
          );
        }
      }
    }
  }
  S.p.y = .5;

  // Speed km/h for stats
  S.kmh = Math.abs(S.spd) * 120;

  // Gear + RPM
  const as = Math.abs(S.spd);
  const ng = as < .3 ? 1 : as < .7 ? 2 : as < 1.2 ? 3 : as < 1.8 ? 4 : as < 2.3 ? 5 : 6;
  if (ng !== S.gear) { if (ng > S.gear && sfxOn) audioMod.sfx('gear'); S.gear = ng; }
  const gMn = [0,0,.3,.7,1.2,1.8,2.3], gMx = [0,.3,.7,1.2,1.8,2.3,C.ms];
  S.rpm = S.gear > 0 ? (as - gMn[S.gear]) / (gMx[S.gear] - gMn[S.gear]) : 0;
  S.rpm = Math.max(.15, Math.min(1, S.rpm + (thr > 0 ? .1 : -.05)));

  // Health regen
  S.hp = Math.min(100, S.hp + 1.5 * dt);

  // Camera shake
  if (GFX.shk) {
    const sa = S.isDrift ? .12 : as * .015;
    S.shake.x += (Math.random() - .5) * sa - S.shake.x * .1;
    S.shake.y += (Math.random() - .5) * sa - S.shake.y * .1;
  } else { S.shake.x = S.shake.y = 0; }

  return { throttle: thr, isDrift: S.isDrift };
}
