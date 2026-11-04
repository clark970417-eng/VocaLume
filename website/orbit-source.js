import * as THREE from 'three';
export function startOrbit(canvas,reduced){
 let renderer;try{renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'})}catch{return}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.3));renderer.setSize(255,255,false);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,20);camera.position.z=6;
 scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,4,5);scene.add(light);
 function bubble(color,x,y,z,rotation){const shape=new THREE.Shape();shape.moveTo(-.65,-.4);shape.lineTo(-.28,-.4);shape.lineTo(-.4,-.65);shape.lineTo(.02,-.4);shape.lineTo(.65,-.4);shape.quadraticCurveTo(.8,-.4,.8,-.2);shape.lineTo(.8,.35);shape.quadraticCurveTo(.8,.5,.6,.5);shape.lineTo(-.65,.5);shape.quadraticCurveTo(-.8,.5,-.8,.3);shape.lineTo(-.8,-.2);shape.quadraticCurveTo(-.8,-.4,-.65,-.4);const geo=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.07,bevelThickness:.07,curveSegments:10});const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.04,transparent:true,opacity:.82}));mesh.position.set(x,y,z);mesh.rotation.set(.2,rotation,-.15);scene.add(mesh);return mesh}
 const a=bubble('#c5d9eb',-.4,.4,-.2,-.4),b=bubble('#e9c3d5',.45,-.25,.1,.4);let last=0,visible=true;
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting}).observe(canvas);
 const render=t=>{if(!reduced)requestAnimationFrame(render);if(document.hidden||!visible||t-last<50)return;last=t;if(!reduced){a.rotation.y=-.4+Math.sin(t/2500)*.1;b.position.y=-.25+Math.sin(t/1800)*.05}renderer.render(scene,camera)};
 renderer.render(scene,camera);if(!reduced)requestAnimationFrame(render);
 canvas.addEventListener('webglcontextlost',()=>{visible=false},{once:true});
}
