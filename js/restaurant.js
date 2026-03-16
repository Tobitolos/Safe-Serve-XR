import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js";

let scene, camera, renderer;

init();
animate();

function init() {

scene = new THREE.Scene();
scene.background = new THREE.Color(0xbfd1e5);

camera = new THREE.PerspectiveCamera(
75,
window.innerWidth / window.innerHeight,
0.1,
1000
);

camera.position.set(0,1.6,4);

renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;

document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const light = new THREE.HemisphereLight(0xffffff,0x444444);
scene.add(light);

}

function animate(){
renderer.setAnimationLoop(render);
}

function render(){
renderer.render(scene,camera);
}