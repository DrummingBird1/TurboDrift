// js/world.js — Track, city, environment generation
const T_N = 100, T_R = 320, T_W = 18;
export const trackPts = [];
export const colls = [];
export const animated = [];

function trackR(t) { return T_R + Math.sin(t*3)*90 + Math.cos(t*5)*50 + Math.sin(t*7)*25; }
function isNearTrack(x,z,m) { for (const t of trackPts) if (Math.hypot(t.x-x,t.z-z)<T_W+m) return true; return false; }
function collFree(x,z,r) { for (const c of colls) if (Math.hypot(c.x-x,c.z-z)<c.r+r) return false; return true; }

export function generate(THREE, scene, gfx) {
  trackPts.length = 0; colls.length = 0; animated.length = 0;

  // Track points
  for (let i=0;i<=T_N;i++) { const t=(i/T_N)*Math.PI*2; trackPts.push(new THREE.Vector3(Math.cos(t)*trackR(t),0,Math.sin(t)*trackR(t))); }

  mkLights(THREE, scene, gfx);
  mkSky(THREE, scene);
  mkGround(THREE, scene);
  mkRoad(THREE, scene);
  mkCity(THREE, scene);
  mkProps(THREE, scene);
}

function mkLights(THREE, scene, gfx) {
  scene.add(new THREE.AmbientLight(0x1a2244,.55));
  scene.add(new THREE.HemisphereLight(0x223355,0x110a08,.35));
  const moon=new THREE.DirectionalLight(0x4466aa,.7);
  moon.position.set(200,350,-250);moon.castShadow=true;
  moon.shadow.mapSize.set(gfx.shadowRes,gfx.shadowRes);
  const s=450;moon.shadow.camera.near=10;moon.shadow.camera.far=900;
  moon.shadow.camera.left=-s;moon.shadow.camera.right=s;moon.shadow.camera.top=s;moon.shadow.camera.bottom=-s;
  scene.add(moon);
  const rim=new THREE.DirectionalLight(0xff4400,.12);rim.position.set(-100,50,0);scene.add(rim);
}

function mkSky(THREE, scene) {
  const n=5000,sp=new Float32Array(n*3),sc=new Float32Array(n*3);
  for(let i=0;i<n;i++){const th=Math.random()*Math.PI*2,ph=Math.acos(Math.random()*2-1),r=800+Math.random()*300;sp[i*3]=r*Math.sin(ph)*Math.cos(th);sp[i*3+1]=Math.abs(r*Math.cos(ph));sp[i*3+2]=r*Math.sin(ph)*Math.sin(th);const c=.4+Math.random()*.6;sc[i*3]=c;sc[i*3+1]=c;sc[i*3+2]=c+Math.random()*.3;}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(sp,3));sg.setAttribute('color',new THREE.BufferAttribute(sc,3));
  scene.add(new THREE.Points(sg,new THREE.PointsMaterial({size:2,vertexColors:true,transparent:true,opacity:.85})));
  // Moon
  const mm=new THREE.Mesh(new THREE.SphereGeometry(35,32,32),new THREE.MeshBasicMaterial({color:0xeeeedd}));mm.position.set(450,280,-550);scene.add(mm);
  scene.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(60,32,32),new THREE.MeshBasicMaterial({color:0xaabbcc,transparent:true,opacity:.06})),{position:new THREE.Vector3(450,280,-550)}));
  // Clouds
  for(let i=0;i<12;i++){
    const cloud=new THREE.Mesh(new THREE.PlaneGeometry(60+Math.random()*80,15+Math.random()*20),new THREE.MeshBasicMaterial({color:0x334455,transparent:true,opacity:.04+Math.random()*.04,side:THREE.DoubleSide}));
    cloud.position.set((Math.random()-.5)*1200,150+Math.random()*100,(Math.random()-.5)*1200);cloud.rotation.x=-Math.PI/2;
    scene.add(cloud);animated.push({mesh:cloud,type:'cloud',speed:.2+Math.random()*.3,dir:Math.random()*Math.PI*2});
  }
}

function mkGround(THREE, scene) {
  const gg=new THREE.PlaneGeometry(2500,2500,80,80);const v=gg.attributes.position;
  for(let i=0;i<v.count;i++)v.setZ(i,Math.sin(v.getX(i)*.008)*Math.cos(v.getY(i)*.008)*3);
  gg.computeVertexNormals();
  const m=new THREE.Mesh(gg,new THREE.MeshStandardMaterial({color:0x141f14,roughness:.95}));m.rotation.x=-Math.PI/2;m.position.y=-.5;m.receiveShadow=true;scene.add(m);
}

function mkRoad(THREE, scene) {
  const sh=new THREE.Shape();
  for(let i=0;i<=T_N;i++){const t=(i/T_N)*Math.PI*2,r=trackR(t)+T_W;if(!i)sh.moveTo(Math.cos(t)*r,Math.sin(t)*r);else sh.lineTo(Math.cos(t)*r,Math.sin(t)*r);}
  for(let i=T_N;i>=0;i--){const t=(i/T_N)*Math.PI*2,r=trackR(t)-T_W;sh.lineTo(Math.cos(t)*r,Math.sin(t)*r);}
  const rm=new THREE.Mesh(new THREE.ShapeGeometry(sh),new THREE.MeshStandardMaterial({color:0x2a2a2a,roughness:.65,metalness:.15}));
  rm.rotation.x=-Math.PI/2;rm.position.y=.03;rm.receiveShadow=true;scene.add(rm);

  // Center dashes
  for(let i=0;i<T_N;i+=3){const t=(i/T_N)*Math.PI*2,t2=((i+1)/T_N)*Math.PI*2;
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(t)*trackR(t),.06,Math.sin(t)*trackR(t)),new THREE.Vector3(Math.cos(t2)*trackR(t2),.06,Math.sin(t2)*trackR(t2))]),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.25})));}

  // Barriers + lights
  let lc=0;
  for(let i=0;i<T_N;i+=2){const t=(i/T_N)*Math.PI*2,r=trackR(t);
    [1,-1].forEach((side,si)=>{const br=r+side*(T_W+1.5),bx=Math.cos(t)*br,bz=Math.sin(t)*br;
      const bm=new THREE.Mesh(new THREE.BoxGeometry(.6,1.2,3.5),new THREE.MeshStandardMaterial({color:i%4===0?0xff2200:0xcccccc,roughness:.4,metalness:.3,emissive:i%4===0?0x330000:0}));
      bm.position.set(bx,.6,bz);bm.rotation.y=t;bm.castShadow=true;scene.add(bm);colls.push({x:bx,z:bz,r:2.2});
      if(i%12===0&&si===0&&lc<28){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.15,8),new THREE.MeshStandardMaterial({color:0x555555,metalness:.8}));pole.position.set(bx,4,bz);scene.add(pole);
        const col=i%24===0?0xff6600:0x88ccff;const pl=new THREE.PointLight(col,2,45);pl.position.set(bx,8,bz);scene.add(pl);
        scene.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(.25),new THREE.MeshBasicMaterial({color:col})),{position:new THREE.Vector3(bx,8,bz)}));lc++;}
    });}

  // Start line
  const fc=document.createElement('canvas');fc.width=128;fc.height=32;const fx=fc.getContext('2d');
  for(let cx=0;cx<16;cx++)for(let cy=0;cy<4;cy++){fx.fillStyle=(cx+cy)%2===0?'#fff':'#111';fx.fillRect(cx*8,cy*8,8,8);}
  const ft=new THREE.CanvasTexture(fc);ft.wrapS=ft.wrapT=THREE.RepeatWrapping;ft.repeat.set(6,1);
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(T_W*2,3),new THREE.MeshStandardMaterial({map:ft,roughness:.3}));
  fl.rotation.x=-Math.PI/2;fl.position.set(trackPts[0].x,.05,trackPts[0].z);scene.add(fl);

  // Start arch
  const aw=T_W*2+6,am=new THREE.MeshStandardMaterial({color:0x444444,metalness:.7,roughness:.3});
  [[-aw/2],[aw/2]].forEach(([ox])=>{const lp=new THREE.Mesh(new THREE.BoxGeometry(.8,10,.8),am);lp.position.set(trackPts[0].x+ox,5,trackPts[0].z);lp.castShadow=true;scene.add(lp);colls.push({x:trackPts[0].x+ox,z:trackPts[0].z,r:1.5});});
  scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(aw,1.2,1.2),am),{position:new THREE.Vector3(trackPts[0].x,10,trackPts[0].z)}));
}

function mkCity(THREE, scene) {
  const bMat=()=>new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.58+Math.random()*.1,.08,.04+Math.random()*.06),roughness:.75,metalness:.3});
  for(let i=0;i<150;i++){const ang=Math.random()*Math.PI*2,dist=420+Math.random()*400,x=Math.cos(ang)*dist,z=Math.sin(ang)*dist;
    if(isNearTrack(x,z,20)||!collFree(x,z,15))continue;
    const h=12+Math.random()*65,w=6+Math.random()*16,d=6+Math.random()*16;
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bMat());b.position.set(x,h/2,z);b.castShadow=true;b.receiveShadow=true;scene.add(b);
    colls.push({x,z,r:Math.max(w,d)/2+1});
    const wr=Math.min(Math.floor(h/4),6);
    for(let wy=0;wy<wr;wy++)for(let wx=0;wx<3;wx++)if(Math.random()>.4){
      const wm=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.6),new THREE.MeshBasicMaterial({color:Math.random()>.4?0xffdd88:0x88bbff,transparent:true,opacity:.3+Math.random()*.5}));
      wm.position.set(x+(wx-1)*3,wy*4+4,z+d/2+.01);scene.add(wm);}
  }
  // Towers
  [[200,150,0xff4400],[-220,-200,0x00aaff],[0,350,0xff00aa]].forEach(([tx,tz,col])=>{
    if(isNearTrack(tx,tz,25))return;const mat=new THREE.MeshStandardMaterial({color:0x666666,metalness:.8,roughness:.3}),h=75;
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(1.5,3,h,8),mat),{position:new THREE.Vector3(tx,h/2,tz),castShadow:true}));colls.push({x:tx,z:tz,r:5});
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(5,4,3,8),mat),{position:new THREE.Vector3(tx,h-1,tz)}));
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,15),mat),{position:new THREE.Vector3(tx,h+7.5,tz)}));
    const pl=new THREE.PointLight(col,4,90);pl.position.set(tx,h+15,tz);scene.add(pl);
    const gl=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial({color:col}));gl.position.set(tx,h+15,tz);scene.add(gl);
    animated.push({mesh:gl,type:'blink',phase:Math.random()*Math.PI*2});
  });
  // Cranes
  [[320,220],[-300,-270]].forEach(([cx,cz])=>{
    if(isNearTrack(cx,cz,25))return;const mat=new THREE.MeshStandardMaterial({color:0xddaa00,roughness:.4,metalness:.6});
    scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(4,55,4),mat),{position:new THREE.Vector3(cx,27.5,cz),castShadow:true}));colls.push({x:cx,z:cz,r:4});
    scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(45,1.2,1.2),mat),{position:new THREE.Vector3(cx+12,55,cz)}));
    const wg=new THREE.Mesh(new THREE.SphereGeometry(.35),new THREE.MeshBasicMaterial({color:0xff0000}));wg.position.set(cx,57,cz);scene.add(wg);
    animated.push({mesh:wg,type:'blink',phase:Math.random()*Math.PI*2});
  });
  // Gas stations
  [trackPts[25],trackPts[60]].forEach((tp,i)=>{const ox=(i===0?1:-1)*50,x=tp.x+ox,z=tp.z+ox;
    if(isNearTrack(x,z,20))return;const mat=new THREE.MeshStandardMaterial({color:0xdddddd,roughness:.5,metalness:.3});
    scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(12,.4,8),mat),{position:new THREE.Vector3(x,5,z),castShadow:true}));
    [[-5,-3],[-5,3],[5,-3],[5,3]].forEach(([px,pz])=>{scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,5),mat),{position:new THREE.Vector3(x+px,2.5,z+pz)}));colls.push({x:x+px,z:z+pz,r:1});});
    [-2.5,2.5].forEach(px=>{scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1,2.5,.7),new THREE.MeshStandardMaterial({color:0xcc0000,metalness:.5})),{position:new THREE.Vector3(x+px,1.25,z)}));colls.push({x:x+px,z,r:1.2});});
    const nl=new THREE.PointLight(0xffffff,1.5,18);nl.position.set(x,4.5,z);scene.add(nl);
    scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(10,4,5),new THREE.MeshStandardMaterial({color:0x443322,roughness:.7})),{position:new THREE.Vector3(x,2,z-7),castShadow:true}));colls.push({x,z:z-7,r:7});
  });
  // Billboards
  const colors=[0xff2200,0x00aaff,0xffaa00,0x00ff88,0xff00aa];
  for(let i=0;i<10;i++){const idx=Math.floor(Math.random()*T_N),t=(idx/T_N)*Math.PI*2,r=trackR(t),side=Math.random()>.5?1:-1,off=T_W+14+Math.random()*12;
    const bx=Math.cos(t)*(r+off*side),bz=Math.sin(t)*(r+off*side);if(isNearTrack(bx,bz,5))continue;
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,7),new THREE.MeshStandardMaterial({color:0x555555,metalness:.7})),{position:new THREE.Vector3(bx,3.5,bz)}));
    const col=colors[i%colors.length];const board=new THREE.Mesh(new THREE.BoxGeometry(5,2.5,.2),new THREE.MeshStandardMaterial({color:col,emissive:new THREE.Color(col).multiplyScalar(.1),roughness:.4}));
    board.position.set(bx,8.5,bz);board.rotation.y=t;scene.add(board);colls.push({x:bx,z:bz,r:2});}
}

function mkProps(THREE, scene) {
  for(let i=0;i<250;i++){const ang=Math.random()*Math.PI*2,dist=40+Math.random()*500,x=Math.cos(ang)*dist,z=Math.sin(ang)*dist;
    if(isNearTrack(x,z,12)||!collFree(x,z,4))continue;const h=3+Math.random()*6;
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.2,.35,h*.4),new THREE.MeshStandardMaterial({color:0x3a2510,roughness:.9})),{position:new THREE.Vector3(x,h*.2,z),castShadow:true}));
    const leaves=new THREE.Mesh(new THREE.SphereGeometry(1.2+Math.random()*1.2,5,4),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.25+Math.random()*.1,.35,.12+Math.random()*.08),roughness:.9}));
    leaves.position.set(x,h*.55,z);leaves.scale.y=1.3;leaves.castShadow=true;scene.add(leaves);colls.push({x,z,r:1.5});}
  // Street lamps
  let ll=0;for(let i=0;i<T_N;i+=6){const t=(i/T_N)*Math.PI*2,r=trackR(t)+T_W+5,lx=Math.cos(t)*r,lz=Math.sin(t)*r;
    scene.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,5),new THREE.MeshStandardMaterial({color:0x444444,metalness:.8})),{position:new THREE.Vector3(lx,2.5,lz)}));
    if(ll<18){const l=new THREE.PointLight(0xffddaa,1,20);l.position.set(lx,5.2,lz);scene.add(l);ll++;}
    scene.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(.15),new THREE.MeshBasicMaterial({color:0xffddaa})),{position:new THREE.Vector3(lx,5.2,lz)}));}
  // Cones near start
  for(let i=-5;i<=5;i++){const cx=trackPts[0].x+i*2.5,cz=trackPts[0].z+14;
    scene.add(Object.assign(new THREE.Mesh(new THREE.ConeGeometry(.2,.5,6),new THREE.MeshStandardMaterial({color:0xff6600})),{position:new THREE.Vector3(cx,.25,cz)}));colls.push({x:cx,z:cz,r:.5});}
}

export function updateAnimated(time) {
  for(const o of animated){
    if(o.type==='cloud'){o.mesh.position.x+=Math.cos(o.dir)*o.speed*.05;o.mesh.position.z+=Math.sin(o.dir)*o.speed*.05;if(Math.abs(o.mesh.position.x)>800)o.mesh.position.x*=-1;}
    else if(o.type==='blink')o.mesh.material.opacity=.5+Math.sin(time*2+o.phase)*.5;
  }
}

export function getStartPos() {
  return { x: trackPts[0].x, z: trackPts[0].z + 8, angle: Math.atan2(trackPts[1].x - trackPts[0].x, trackPts[1].z - trackPts[0].z) };
}

export function checkLap(pos, spd, crossed, lapSt) {
  const d2s = Math.hypot(pos.x - trackPts[0].x, pos.z - trackPts[0].z);
  let newCrossed = crossed, newLapSt = lapSt, lapDone = false, lapTime = 0;
  if (d2s < 20 && !crossed && spd > .3) { newLapSt = performance.now(); newCrossed = true; }
  else if (d2s < 15 && crossed && (performance.now() - lapSt) > 5000) { lapTime = performance.now() - lapSt; newLapSt = performance.now(); lapDone = true; }
  if (d2s > 30) newCrossed = false;
  return { crossed: newCrossed, lapSt: newLapSt, lapDone, lapTime };
}
