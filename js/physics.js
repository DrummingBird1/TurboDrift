// js/physics.js — Vehicle physics & collision
export function updatePhysics(dt, S, carCfg, keys, colls, nitroRef, audioMod, sfxOn, particles, THREE, GFX, boostPads) {
  dt = Math.min(dt, .033);
  const C = carCfg;
  let thr = 0, brk = 0, trn = 0, hb = false, nit = false;

  // Keyboard
  if (keys.KeyW || keys.ArrowUp) thr = 1;
  if (keys.KeyS || keys.ArrowDown) brk = 1;
  if (keys.KeyA || keys.ArrowLeft) trn = 1;
  if (keys.KeyD || keys.ArrowRight) trn = -1;
  if (keys.Space) hb = true;
  if (keys.ShiftLeft || keys.ShiftRight) nit = true;

  // Gamepad (set via game.js)
  if (S.gp) {
    if (S.gp.thr > thr) thr = S.gp.thr;
    if (S.gp.brk > brk) brk = S.gp.brk;
    if (Math.abs(S.gp.trn) > Math.abs(trn)) trn = S.gp.trn;
    if (S.gp.hb) hb = true;
    if (S.gp.nit) nit = true;
  }
  // Touch (set via game.js)
  if (S.touch) {
    if (S.touch.thr > thr) thr = S.touch.thr;
    if (S.touch.brk > brk) brk = S.touch.brk;
    if (Math.abs(S.touch.trn) > Math.abs(trn)) trn = S.touch.trn;
    if (S.touch.hb) hb = true;
    if (S.touch.nit) nit = true;
  }

  // Boost timer
  if (S.boostT > 0) { S.boostT -= dt; thr = Math.max(thr, 1.6); }

  // Nitro
  if (nit && nitroRef.val > 0) {
    thr = Math.max(thr, 1.9); nitroRef.val = Math.max(0, nitroRef.val - 28 * dt);
    if (Math.random() < .08 && sfxOn) audioMod.sfx('nit');
    S.nitroActive = true;
  } else { nitroRef.val = Math.min(100, nitroRef.val + 4 * dt); S.nitroActive = false; }

  const accelMult = dt * 60;
  if (thr > 0) S.spd += C.acc * thr * accelMult * 1.2;
  if (brk > 0) S.spd -= .06 * accelMult;
  S.spd -= S.spd * .004 * accelMult;
  if (Math.abs(S.spd) < .001) S.spd = 0;
  S.spd = Math.max(-.8, Math.min(C.ms * (S.boostT > 0 ? 1.3 : 1), S.spd));

  // Steering
  const sf = Math.min(Math.abs(S.spd) / 1.2, 1);
  const ta = trn * .03 * sf * accelMult;

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
    S.driftToSave = (S.driftToSave || 0) + S.dScore;
    S.dScore = 0;
  }

  S.a += S.av;
  S.av *= hb ? .96 : .9;

  const fwd = new THREE.Vector3(Math.sin(S.a), 0, Math.cos(S.a));
  const tv = fwd.clone().multiplyScalar(S.spd);
  const gripFactor = hb ? C.grip * .6 : C.grip * 1.5;
  S.v.lerp(tv, Math.min(gripFactor, .35));
  S.p.add(S.v.clone().multiplyScalar(accelMult));

  // Distance traveled
  S.distFrame = Math.abs(S.spd) * accelMult;
  S.totalDist = (S.totalDist || 0) + S.distFrame;

  // Boost pads
  if (boostPads && boostPads.length) {
    for (const bp of boostPads) {
      if (bp.cd && bp.cd > 0) { bp.cd -= dt; continue; }
      const dx = S.p.x - bp.x, dz = S.p.z - bp.z;
      if (dx * dx + dz * dz < 9) {
        S.boostT = 2.5; bp.cd = 3;
        if (sfxOn) audioMod.sfx('boost');
        S.nitro = Math.min(100, S.nitro + 30);
        nitroRef.val = S.nitro;
        if (GFX.part && particles) {
          for (let i = 0; i < 15; i++) particles.spawn(
            new THREE.Vector3(S.p.x + (Math.random() - .5) * 2, .4, S.p.z + (Math.random() - .5) * 2),
            new THREE.Vector3((Math.random() - .5) * 4, 2 + Math.random() * 3, (Math.random() - .5) * 4),
            1, 1.5 + Math.random() * 1, .15 + Math.random() * .15, new THREE.Color(0, 1, .5)
          );
        }
      }
    }
  }

  // Collisions
  let hitThisFrame = false;
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
        S.hpCooldown = 1.5;
        S.crashFrame = true;
        hitThisFrame = true;
        if (GFX.part && particles) {
          for (let i = 0; i < 5; i++) particles.spawn(
            new THREE.Vector3(S.p.x + nx * 1.5, .5, S.p.z + nz * 1.5),
            new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3),
            1, 2 + Math.random() * 2, .06 + Math.random() * .08, new THREE.Color(1, .8, .2)
          );
          // Electric sparks
          particles.spawn(
            new THREE.Vector3(S.p.x + nx * 1.5, .6, S.p.z + nz * 1.5),
            new THREE.Vector3((Math.random() - .5) * 5, 2 + Math.random() * 3, (Math.random() - .5) * 5),
            1, 4, .04, new THREE.Color(.6, .9, 1)
          );
        }
      }
    }
  }
  S.p.y = .5;
  if (!hitThisFrame) S.crashFrame = false;

  // Speed km/h for stats
  S.kmh = Math.abs(S.spd) * 120;

  // Gear + RPM
  const as = Math.abs(S.spd);
  const ng = as < .3 ? 1 : as < .7 ? 2 : as < 1.2 ? 3 : as < 1.8 ? 4 : as < 2.3 ? 5 : 6;
  if (ng !== S.gear) { if (ng > S.gear && sfxOn) audioMod.sfx('gear'); S.gear = ng; }
  const gMn = [0, 0, .3, .7, 1.2, 1.8, 2.3], gMx = [0, .3, .7, 1.2, 1.8, 2.3, C.ms];
  S.rpm = S.gear > 0 ? (as - gMn[S.gear]) / (gMx[S.gear] - gMn[S.gear]) : 0;
  S.rpm = Math.max(.15, Math.min(1, S.rpm + (thr > 0 ? .1 : -.05)));

  // Health regen with cooldown
  if (S.hpCooldown > 0) S.hpCooldown -= dt;
  else S.hp = Math.min(100, S.hp + 1.5 * dt);

  // Camera shake
  if (GFX.shk) {
    const sa = (S.isDrift ? .12 : as * .015) + (hitThisFrame ? .35 : 0);
    S.shake.x += (Math.random() - .5) * sa - S.shake.x * .1;
    S.shake.y += (Math.random() - .5) * sa - S.shake.y * .1;
  } else { S.shake.x = S.shake.y = 0; }

  return { throttle: thr, isDrift: S.isDrift, nitroActive: S.nitroActive };
}
