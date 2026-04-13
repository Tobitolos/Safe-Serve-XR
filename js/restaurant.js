import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js";

// Guest dialogues, table 1 (wrong order), table 2 (allergy)
const SCENARIOS = [
    {
        prompt:
            "Table 1, “Excuse me, I don't think this is what I ordered. What should you say?”",
        choices: [
            {
                label: "“Not my problem, ask someone else.”",
                ok: false,
                note: "Too dismissive. Stay polite and take ownership, even if you get help after.",
            },
            {
                label:
                    "“I'm sorry about the mix-up. I'll check with the kitchen and get you the right dish.”",
                ok: true,
                note: "Good, you apologize, verify with the kitchen, and fix the problem.",
            },
            {
                label: "“Are you sure you ordered the right thing?”",
                ok: false,
                note: "Sounds accusatory. Start with empathy, then confirm the order calmly.",
            },
        ],
    },
    {
        prompt:
            "Table 2, “I have a serious nut allergy. Can you make sure my plate is safe?”",
        choices: [
            {
                label: "“I'm not sure, just don't eat the garnish.”",
                ok: false,
                note: "Unsafe guess. Never downplay allergies; involve the kitchen or manager.",
            },
            {
                label:
                    "“I'll tell the kitchen right away so they can avoid cross-contact and confirm ingredients.”",
                ok: true,
                note: "Good, you take it seriously and loop in the kitchen / manager.",
            },
            {
                label: "“We probably don't use nuts in that dish.”",
                ok: false,
                note: "“Probably” isn't enough for allergies, always verify with the kitchen.",
            },
        ],
    },
];

const GUEST_TALK_COUNT = 2;

let scene, camera, renderer;
let mop;
let spill;
let plate;

const feedback = document.getElementById("feedback");
const tasksEl = document.getElementById("tasks");
const dialoguePanel = document.getElementById("dialogue");
const dialogueTitle = document.getElementById("dialogue-title");
const dialoguePrompt = document.getElementById("dialogue-prompt");
const dialogueButtons = document.getElementById("dialogue-buttons");
const dialogueResult = document.getElementById("dialogue-result");
const dialogueFooter = document.getElementById("dialogue-footer");

const raycaster = new THREE.Raycaster();
const rotationMatrix = new THREE.Matrix4();
const worldMop = new THREE.Vector3();
const worldSpill = new THREE.Vector3();
const worldPlate = new THREE.Vector3();
const mouse = new THREE.Vector2();
const dragPoint = new THREE.Vector3();

const planeCounter = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
const planeTable = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.72);

let grabbingController = null;
let heldObject = null;

let spillDone = false;
let serveDone = false;
const scenarioDone = [false, false];
let guestPanelOpened = false;

let mouseThing = null;

init();
animate();

function buildTable(tx, tz, woodMat) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 1), woodMat);
    top.position.set(tx, 0.6, tz);
    scene.add(top);
    const legGeo = new THREE.BoxGeometry(0.1, 0.8, 0.1);
    const legOff = [
        [-0.9, -0.4],
        [0.9, -0.4],
        [-0.9, 0.4],
        [0.9, 0.4],
    ];
    for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(legGeo, woodMat);
        leg.position.set(tx + legOff[i][0], 0.2, tz + legOff[i][1]);
        scene.add(leg);
    }
}

function buildGuest(gx, gz, shirtColor, skinColor) {
    const guest = new THREE.Group();
    guest.position.set(gx, 0, gz);
    const capLen = 0.75;
    const capR = 0.2;
    const halfH = capLen / 2 + capR;
    const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(capR, capLen, 6, 12),
        new THREE.MeshStandardMaterial({ color: shirtColor })
    );
    body.position.y = halfH;
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 12),
        new THREE.MeshStandardMaterial({ color: skinColor })
    );
    head.position.set(0, halfH * 2 + 0.2, 0);
    guest.add(body);
    guest.add(head);
    scene.add(guest);
}

function handsOnDone() {
    return spillDone && serveDone;
}

function allTalksDone() {
    return scenarioDone[0] && scenarioDone[1];
}

function allTrainingDone() {
    return spillDone && serveDone && allTalksDone();
}

function countTalksDone() {
    let n = 0;
    for (let i = 0; i < GUEST_TALK_COUNT; i++) {
        if (scenarioDone[i]) {
            n++;
        }
    }
    return n;
}

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
    camera.lookAt(0, 0, -0.5);

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



    /* PLATE (pick up from counter, place on green mat, table 1 only) */

    const plateGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32);
    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f0 });

    plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(-0.75, 1.02, -2.85);
    plate.userData.canGrab = true;
    scene.add(plate);



    const wood = new THREE.MeshStandardMaterial({ color: 0x8B4513 });

    /* TABLE 1 + placemat */

    buildTable(0, -2, wood);

    const matGeometry = new THREE.PlaneGeometry(0.6, 0.5);
    const matMaterial = new THREE.MeshBasicMaterial({
        color: 0x44aa66,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
    });
    const placemat = new THREE.Mesh(matGeometry, matMaterial);
    placemat.rotation.x = -Math.PI / 2;
    placemat.position.set(0.35, 0.701, -2.05);
    scene.add(placemat);

    /* TABLE 2 */

    buildTable(-3.2, 0.6, wood);

    /* Guests */

    buildGuest(-0.95, -1.35, 0x3355aa, 0xe8b896);
    buildGuest(-4.05, 0.85, 0xaa3355, 0xd4a574);

    /* VR CONTROLLERS, grab mop or plate */

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

    /* MOUSE DRAG (desktop only, when not in VR) */

    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointercancel", onCanvasPointerUp);

    drawChecklist();
    feedback.innerHTML =
        "<strong>SafeServe XR</strong><br>" +
        "1) Grab the <strong>mop</strong>, wipe the spill, release.<br>" +
        "2) Grab the <strong>plate</strong>, put it on the <strong>green mat</strong> (center table).<br>" +
        "3) Help <strong>two guests</strong> (blue = table 1, pink = table 2) in the panel, top right.<br>" +
        "VR: trigger to grab and release. Desktop: click, drag; spill: <strong>C</strong>.";
}

function loadScenario(index) {
    if (index < 0 || index >= SCENARIOS.length) {
        return;
    }
    const sc = SCENARIOS[index];

    dialogueTitle.textContent = "Guest, table " + (index + 1);
    dialoguePrompt.textContent = sc.prompt;
    dialogueButtons.innerHTML = "";
    dialogueFooter.innerHTML = "";
    dialogueResult.textContent = "";
    dialogueResult.style.color = "#000";

    for (let i = 0; i < sc.choices.length; i++) {
        const choice = sc.choices[i];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = choice.label;
        const idx = index;
        btn.addEventListener("click", function () {
            if (scenarioDone[idx]) {
                return;
            }
            scenarioDone[idx] = true;
            drawChecklist();

            dialogueResult.textContent = choice.note;
            dialogueResult.style.color = choice.ok ? "#1a6b1a" : "#8b4513";

            const kids = dialogueButtons.children;
            for (let j = 0; j < kids.length; j++) {
                kids[j].disabled = true;
            }

            if (idx === 0) {
                const nextBtn = document.createElement("button");
                nextBtn.type = "button";
                nextBtn.textContent = "Next customer (table 2)";
                nextBtn.addEventListener("click", function () {
                    dialogueFooter.innerHTML = "";
                    loadScenario(1);
                });
                dialogueFooter.appendChild(nextBtn);
                feedback.innerHTML =
                    "Table 1 done. Click <strong>Next customer</strong> for the guest at table 2 (pink shirt).";
            } else {
                const p = document.createElement("p");
                p.style.margin = "0";
                p.textContent = "You helped both tables.";
                dialogueFooter.appendChild(p);
                feedback.innerHTML =
                    "Training complete, spill, serve, and both guest talks. Great work!";
            }
        });
        dialogueButtons.appendChild(btn);
    }
}

function maybeOpenGuestTalk() {
    if (!handsOnDone() || allTalksDone() || guestPanelOpened) {
        return;
    }
    guestPanelOpened = true;
    dialoguePanel.classList.remove("hidden");
    loadScenario(0);
    feedback.innerHTML =
        "Mop and plate tasks done. Answer <strong>Guest, table 1</strong>, then use <strong>Next customer</strong> for table 2.";
}

function grabList() {
    const list = [mop];
    if (plate.userData.canGrab) {
        list.push(plate);
    }
    return list;
}

function drawChecklist() {
    const s = spillDone ? "Done" : "To do";
    const v = serveDone ? "Done" : "To do";
    let gLine;
    if (allTalksDone()) {
        gLine = "Done (2/2)";
    } else if (!handsOnDone()) {
        gLine = "Locked (finish spill + serve)";
    } else {
        gLine = "To do (" + countTalksDone() + "/2)";
    }
    const t1 = scenarioDone[0] ? "Done" : "To do";
    const t2 = scenarioDone[1] ? "Done" : "To do";
    tasksEl.innerHTML =
        "<strong>Training checklist</strong><br>Clean spill: " +
        s +
        "<br>Serve (center table): " +
        v +
        "<br>Guest talks: " +
        gLine +
        "<br><small>Table 1: " +
        t1 +
        " · Table 2: " +
        t2 +
        "</small>";
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
    if (grabbingController || mouseThing) {
        return;
    }

    controllerRay(controller);
    const hits = raycaster.intersectObjects(grabList(), false);
    hits.sort((a, b) => a.distance - b.distance);
    if (hits.length === 0) {
        return;
    }

    const obj = hits[0].object;
    controller.attach(obj);
    heldObject = obj;
    grabbingController = controller;

    if (obj === mop) {
        feedback.innerHTML = "Mop in hand, wipe over the spill, then release the trigger.";
    } else {
        feedback.innerHTML = "Plate in hand, place it on the green mat, then release.";
    }
}

function onSelectEnd(event) {
    const controller = event.target;
    if (controller !== grabbingController || !heldObject) {
        return;
    }

    const obj = heldObject;
    scene.attach(obj);
    grabbingController = null;
    heldObject = null;

    if (obj === mop) {
        if (!spill) {
            if (allTrainingDone()) {
                feedback.innerHTML = "Training complete, great work!";
            } else if (handsOnDone() && !allTalksDone()) {
                maybeOpenGuestTalk();
                feedback.innerHTML =
                    "Spill cleared. Use the <strong>Guest</strong> panel (top right).";
            } else if (serveDone) {
                feedback.innerHTML =
                    "Spill cleared! Finish the <strong>Guest</strong> panel if you have not yet.";
            } else {
                feedback.innerHTML =
                    "Spill cleared! Next: grab the <strong>plate</strong> onto the <strong>green mat</strong>.";
            }
            return;
        }
        feedback.innerHTML =
            "Mop down, grab again if needed, or press <strong>C</strong> on desktop over the spill.";
        return;
    }

    if (obj === plate) {
        checkPlateServe();
    }
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
        spillDone = true;
        drawChecklist();
        maybeOpenGuestTalk();
        if (allTrainingDone()) {
            feedback.innerHTML =
                "Training complete, spill, serve, and both guest talks. Great work!";
        } else if (serveDone && !allTalksDone()) {
            feedback.innerHTML =
                "Spill and serve done. Use the <strong>Guest</strong> panel, table 1, then table 2.";
        } else {
            feedback.innerHTML =
                "Good job! Spill cleaned safely. Next: serve the plate on the green mat.";
        }
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
        spillDone = true;
        drawChecklist();
        maybeOpenGuestTalk();

        if (allTrainingDone()) {
            feedback.innerHTML =
                "Training complete, spill, serve, and both guest talks. Great work!";
        } else if (serveDone && !allTalksDone()) {
            feedback.innerHTML =
                "Spill and serve done. Use the <strong>Guest</strong> panel, table 1, then table 2.";
        } else {
            feedback.innerHTML =
                "Good job! Spill cleaned safely. Next: serve the plate on the green mat.";
        }

    } else {

        feedback.innerHTML = "Move the mop closer to the spill.";

    }

}

function plateOnServeZone() {
    plate.getWorldPosition(worldPlate);
    return (
        worldPlate.x > 0.04 &&
        worldPlate.x < 0.66 &&
        worldPlate.z > -2.32 &&
        worldPlate.z < -1.78 &&
        worldPlate.y > 0.65 &&
        worldPlate.y < 1.15
    );
}

function checkPlateServe() {
    if (serveDone || !plate.userData.canGrab) {
        return;
    }

    if (!plateOnServeZone()) {
        feedback.innerHTML =
            "Put the plate on the <strong>green mat</strong> on the center table.";
        return;
    }

    plate.userData.canGrab = false;
    serveDone = true;
    plate.position.set(0.35, 0.72, -2.05);
    plate.rotation.set(0, 0, 0);
    drawChecklist();
    maybeOpenGuestTalk();

    if (allTrainingDone()) {
        feedback.innerHTML =
            "Training complete, spill, serve, and both guest talks. Great work!";
    } else if (spillDone && !allTalksDone()) {
        feedback.innerHTML =
            "Spill and serve done. Use the <strong>Guest</strong> panel, table 1, then table 2.";
    } else {
        feedback.innerHTML =
            "Nice, food is on the table. When you can, clean the spill with the mop.";
    }
}

function onCanvasPointerDown(event) {
    if (renderer.xr.isPresenting || mouseThing) {
        return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(grabList(), false);
    if (hits.length > 0) {
        mouseThing = hits[0].object;
        renderer.domElement.setPointerCapture(event.pointerId);
    }
}

function onCanvasPointerMove(event) {
    if (!mouseThing || renderer.xr.isPresenting) {
        return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const plane = mouseThing === plate ? planeCounter : planeTable;
    if (raycaster.ray.intersectPlane(plane, dragPoint)) {
        if (mouseThing === plate) {
            const y = dragPoint.z < -2.35 ? 1.02 : 0.72;
            mouseThing.position.set(dragPoint.x, y, dragPoint.z);
        } else {
            mouseThing.position.set(dragPoint.x, 0.85, dragPoint.z);
        }
    }
}

function onCanvasPointerUp(event) {
    const wasDragging = mouseThing;
    if (mouseThing === plate) {
        checkPlateServe();
    }
    mouseThing = null;
    if (wasDragging && event && event.pointerId != null) {
        try {
            renderer.domElement.releasePointerCapture(event.pointerId);
        } catch (e) {
            // ignore
        }
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

    if (spill && grabbingController && heldObject === mop && mopNearSpill(0.95)) {
        tryCompleteSpill();
    }
    if (spill && mouseThing === mop && mopNearSpill(0.95)) {
        tryCompleteSpill();
    }

    renderer.render(scene, camera);

}
