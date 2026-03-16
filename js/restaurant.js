import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js";

let scene, camera, renderer;
let mop;
let spill;

const feedback = document.getElementById("feedback");

init();
animate();

function init() {

    /*  SCENE SETUP  */

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfd1e5);

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 1.6, 4);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    /* LIGHT */

    const light = new THREE.HemisphereLight(0xffffff, 0x444444);
    scene.add(light);



    /* FLOOR */

    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;

    scene.add(floor);



    /* RESTAURANT COUNTER */

    const counterGeometry = new THREE.BoxGeometry(3, 1, 1);
    const counterMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });

    const counter = new THREE.Mesh(counterGeometry, counterMaterial);
    counter.position.set(0, 0.5, -3);

    scene.add(counter);



    /* SPILL HAZARD */

    const spillGeometry = new THREE.CircleGeometry(0.5, 32);
    const spillMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });

    spill = new THREE.Mesh(spillGeometry, spillMaterial);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(1, 0.01, -1);

    scene.add(spill);



    /* MOP TOOL */

    const mopGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5);
    const mopMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });

    mop = new THREE.Mesh(mopGeometry, mopMaterial);
    mop.position.set(-1, 0.75, -1);

    scene.add(mop);



    /* TABLE */

    const tableGeometry = new THREE.BoxGeometry(2, 0.2, 1);
    const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });

    const table = new THREE.Mesh(tableGeometry, tableMaterial);
    table.position.set(0, 0.6, -2);

    scene.add(table);

    /* TABLE LEGS */

    const legGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.1);

    const legPositions = [
        [-0.9, 0.2, -2.4],
        [0.9, 0.2, -2.4],
        [-0.9, 0.2, -1.6],
        [0.9, 0.2, -1.6],
    ];

    legPositions.forEach(([x, y, z]) => {
        const leg = new THREE.Mesh(legGeometry, tableMaterial);
        leg.position.set(x, y, z);
        scene.add(leg);
    });



    /* TRAINING FEEDBACK */

    feedback.innerHTML = "Task: Clean the spill using the mop (Press C)";
}


/* ANIMATION LOOP */

function animate() {

    renderer.setAnimationLoop(render);

}

function render() {

    renderer.render(scene, camera);

}