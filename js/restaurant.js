import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js";

let scene, camera, renderer;
let mop;
let spill;

const feedback = document.getElementById("feedback");

const raycaster = new THREE.Raycaster();
const rotationMatrix = new THREE.Matrix4();
const worldMop = new THREE.Vector3();
const worldSpill = new THREE.Vector3();

let grabbingController = null;

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
    camera.lookAt(0, 0, -2);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    window.addEventListener("resize", onWindowResize);

    /* LIGHT */

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
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

    const spillMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000
    });

    spill = new THREE.Mesh(spillGeometry, spillMaterial);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0.8, 0.01, -1);

    scene.add(spill);



    /* MOP TOOL */

    const mopGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5);
    const mopMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });

    mop = new THREE.Mesh(mopGeometry, mopMaterial);

    // moved closer so cleaning works
    mop.position.set(0.5, 0.75, -1);

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

    /* VR CONTROLLERS — point at mop, hold trigger to grab */

    for (let i = 0; i < 2; i++) {
        const controller = renderer.xr.getController(i);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -4),
        ]);
        controller.add(new THREE.Line(lineGeo));
        controller.addEventListener("selectstart", onSelectStart);
        controller.addEventListener("selectend", onSelectEnd);
        scene.add(controller);
    }

    /* TRAINING FEEDBACK  */

    feedback.innerHTML =
        "Task: Point at the mop, hold trigger to grab, wipe the spill, release. Desktop: <strong>C</strong> when the mop is over the spill.";
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function controllerRay(controller) {
    rotationMatrix.extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotationMatrix);
}

function onSelectStart(event) {
    const controller = event.target;
    if (grabbingController) {
        return;
    }

    controllerRay(controller);
    const hits = raycaster.intersectObject(mop, false);
    if (hits.length > 0) {
        controller.attach(mop);
        grabbingController = controller;
        feedback.innerHTML = "Mop in hand — wipe over the spill, then release the trigger.";
    }
}

function onSelectEnd(event) {
    const controller = event.target;
    if (controller !== grabbingController) {
        return;
    }
    scene.attach(mop);
    grabbingController = null;
    if (!spill) {
        return;
    }
    feedback.innerHTML =
        "Grab the mop again if needed, or press <strong>C</strong> on desktop when the mop is over the spill.";
}

function mopNearSpill(threshold) {
    if (!spill) {
        return false;
    }
    mop.getWorldPosition(worldMop);
    spill.getWorldPosition(worldSpill);
    return worldMop.distanceTo(worldSpill) < threshold;
}

function tryCompleteSpill() {
    if (!spill) {
        return;
    }
    if (mopNearSpill(0.95)) {
        scene.remove(spill);
        spill = null;
        feedback.innerHTML = "Good job! Spill cleaned safely.";
    }
}


/* CLEAN SPILL FUNCTION */

function cleanSpill() {

    if (!spill) {
        return;
    }

    if (mopNearSpill(1)) {

        scene.remove(spill);
        spill = null;

        feedback.innerHTML = "Good job! Spill cleaned safely.";

    } else {

        feedback.innerHTML = "Move the mop closer to the spill.";

    }

}


/* KEYBOARD CONTROL */

window.addEventListener("keydown", function(event) {

    if (event.key === "c") {

        cleanSpill();

    }

});


/* ANIMATION LOOP */

function animate() {

    renderer.setAnimationLoop(render);

}

function render() {

    if (spill && grabbingController && mopNearSpill(0.95)) {
        tryCompleteSpill();
    }

    renderer.render(scene, camera);

}
