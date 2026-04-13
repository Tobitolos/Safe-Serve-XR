import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js";

// Guest dialogues, table 1 wrong order, table 2 allergy, table 3 wait and cold food
const SCENARIOS = [
    {
        prompt:
            "Table 1, “Sorry, I spilled my drink on the floor over here. Could you help clean it up before someone slips? Also, I don't think this is the food I ordered. What should you say?”",
        choices: [
            {
                label: "“Not my problem, ask someone else.”",
                ok: false,
                note: "Too dismissive. Stay polite and take ownership, even if you get help after.",
            },
            {
                label:
                    "“I'm sorry about the spill and the mix-up. I'll get the floor dealt with so it's safe, and I'll check with the kitchen about your dish.”",
                ok: true,
                note: "Good, you address the safety issue first, then the wrong order, calmly.",
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
    {
        prompt:
            "Table 3, “We've been waiting a long time and the soup is cold. What do you say?”",
        choices: [
            {
                label: "“Well, we're really busy tonight.”",
                ok: false,
                note: "Sounds like an excuse. Acknowledge the wait and heat or replace the food.",
            },
            {
                label:
                    "“I'm sorry for the wait and that it's cold. I'll get this reheated or replaced for you.”",
                ok: true,
                note: "Good, you apologize and offer a clear fix.",
            },
            {
                label: "“It's supposed to be lukewarm.”",
                ok: false,
                note: "Arguing makes it worse. Listen and fix the issue politely.",
            },
        ],
    },
];

const GUEST_TALK_COUNT = 3;

const MOP_SHAFT_LEN = 1.75;
const MOP_HANDLE_CENTER_Y = MOP_SHAFT_LEN / 2 + 0.04;

let scene, camera, renderer;
let mop;
let spill;
let plate;
let table3Plate;

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
const scenarioDone = [false, false, false];
let guestPanelOpened = false;
let mouseThing = null;

const guestByTable = [];
const clock = new THREE.Clock();
let guestJumpAnim = null;

init();
animate();

function startGuestJump(guestGroup) {
    if (!guestGroup) {
        return;
    }
    if (guestJumpAnim) {
        guestJumpAnim.guest.position.y = guestJumpAnim.baseY;
    }
    guestJumpAnim = {
        guest: guestGroup,
        baseY: guestGroup.position.y,
        elapsed: 0,
        duration: 0.6,
        height: 0.42,
    };
}

function updateGuestJump(dt) {
    if (!guestJumpAnim) {
        return;
    }
    guestJumpAnim.elapsed += dt;
    const t = Math.min(1, guestJumpAnim.elapsed / guestJumpAnim.duration);
    const h = guestJumpAnim.height;
    guestJumpAnim.guest.position.y = guestJumpAnim.baseY + 4 * h * t * (1 - t);
    if (t >= 1) {
        guestJumpAnim.guest.position.y = guestJumpAnim.baseY;
        guestJumpAnim = null;
    }
}

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
    return guest;
}

function mopIsAvailable() {
    return !!spill && scenarioDone[0];
}

function allTalksDone() {
    return scenarioDone[0] && scenarioDone[1] && scenarioDone[2];
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



    /* MOP: thick yellow shaft only (easy to ray-hit in VR); origin at shaft center */

    mop = new THREE.Group();

    const shaftLen = MOP_SHAFT_LEN;
    const shaftGeo = new THREE.CylinderGeometry(0.12, 0.14, shaftLen, 16);
    const shaftMat = new THREE.MeshStandardMaterial({
        color: 0xffee44,
        emissive: 0xcc9900,
        emissiveIntensity: 0.55,
        roughness: 0.4,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.userData.grabRoot = mop;

    mop.add(shaft);

    /* By the service counter, near table 1 / first guest (counter center z -3, table z -2) */
    mop.position.set(1.35, MOP_HANDLE_CENTER_Y, -2.28);

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

    /* TABLE 3 */

    buildTable(3.2, 0.6, wood);

    /* Plate on table 3 (set dressing, not grabbable) */
    table3Plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f0 })
    );
    table3Plate.position.set(3.65, 0.72, 0.72);
    table3Plate.rotation.y = 0.15;
    scene.add(table3Plate);

    /* Guests (table 2 pink guest jumps when you pick the best answer there) */

    guestByTable.length = 0;
    guestByTable.push(buildGuest(-0.95, -1.35, 0x3355aa, 0xe8b896));
    guestByTable.push(buildGuest(-4.05, 0.85, 0xaa3355, 0xd4a574));
    guestByTable.push(buildGuest(4.05, 0.85, 0x228866, 0xc9a686));

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
        "1) Grab the <strong>plate</strong>, put it on the <strong>green mat</strong> (center table).<br>" +
        "2) Use the <strong>Guest</strong> panel (top right) for <strong>table 1</strong> (blue shirt), then clean the <strong>spill</strong> with the <strong>mop</strong> by the counter.<br>" +
        "3) In the Guest panel, <strong>Next customer</strong> for tables 2 and 3 (pink jumps on the best allergy answer at table 2).<br>" +
        "VR: trigger to grab and release. Desktop: click, drag; spill: <strong>C</strong> when the mop is over the spill.";
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

            if (choice.ok && idx === 1 && guestByTable[1]) {
                startGuestJump(guestByTable[1]);
            }

            if (idx < SCENARIOS.length - 1) {
                const nextBtn = document.createElement("button");
                nextBtn.type = "button";
                nextBtn.textContent = "Next customer (table " + (idx + 2) + ")";
                nextBtn.addEventListener("click", function () {
                    if (idx === 0 && !spillDone) {
                        feedback.innerHTML =
                            "Clean the <strong>spill</strong> with the mop first, then tap <strong>Next customer</strong> again for table 2.";
                        return;
                    }
                    dialogueFooter.innerHTML = "";
                    loadScenario(idx + 1);
                });
                dialogueFooter.appendChild(nextBtn);
                if (idx === 0) {
                    feedback.innerHTML =
                        "Table 1 done. Clean the <strong>spill</strong> with the mop, then tap <strong>Next customer</strong> for table 2 (pink shirt).";
                } else {
                    feedback.innerHTML =
                        "Table 2 done. Click <strong>Next customer</strong> for table 3 (green shirt).";
                }
            } else {
                const p = document.createElement("p");
                p.style.margin = "0";
                p.textContent = "You helped all three tables.";
                dialogueFooter.appendChild(p);
                feedback.innerHTML =
                    "Training complete, serve, guest talks, and spill cleanup. Great work!";
            }
        });
        dialogueButtons.appendChild(btn);
    }
}

function maybeOpenGuestTalk() {
    if (!serveDone || allTalksDone() || guestPanelOpened) {
        return;
    }
    guestPanelOpened = true;
    dialoguePanel.classList.remove("hidden");
    loadScenario(0);
    feedback.innerHTML =
        "Answer <strong>Guest, table 1</strong>, then clean the <strong>spill</strong> with the mop. After that, use <strong>Next customer</strong> for tables 2 and 3.";
}

function grabList() {
    const list = [];
    if (mopIsAvailable()) {
        list.push(mop);
    }
    if (plate.userData.canGrab) {
        list.push(plate);
    }
    return list;
}

function drawChecklist() {
    let s;
    if (spillDone) {
        s = "Done";
    } else if (!serveDone) {
        s = "Locked (serve first)";
    } else if (!scenarioDone[0]) {
        s = "Locked (guest, table 1 first)";
    } else {
        s = "To do";
    }
    const v = serveDone ? "Done" : "To do";
    let gLine;
    if (allTalksDone()) {
        gLine = "Done (3/3)";
    } else if (!serveDone) {
        gLine = "Locked (serve first)";
    } else {
        gLine = "To do (" + countTalksDone() + "/3)";
    }
    const t1 = scenarioDone[0] ? "Done" : "To do";
    const t2 = scenarioDone[1] ? "Done" : "To do";
    const t3 = scenarioDone[2] ? "Done" : "To do";
    tasksEl.innerHTML =
        "<strong>Training checklist</strong><br>Serve (center table): " +
        v +
        "<br>Clean spill: " +
        s +
        "<br>Guest talks: " +
        gLine +
        "<br><small>Table 1: " +
        t1 +
        " · Table 2: " +
        t2 +
        " · Table 3: " +
        t3 +
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
    const hits = raycaster.intersectObjects(grabList(), true);
    hits.sort((a, b) => a.distance - b.distance);
    if (hits.length === 0) {
        return;
    }

    const obj = hits[0].object.userData.grabRoot ?? hits[0].object;
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
            } else if (!allTalksDone()) {
                feedback.innerHTML =
                    "Spill cleared. In the <strong>Guest</strong> panel, tap <strong>Next customer</strong> for table 2 when you are ready.";
            } else {
                feedback.innerHTML = "Spill cleared.";
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
        if (allTrainingDone()) {
            feedback.innerHTML =
                "Training complete, serve, guest talks, and spill cleanup. Great work!";
        } else if (!allTalksDone()) {
            feedback.innerHTML =
                "Spill cleared. In the <strong>Guest</strong> panel, use <strong>Next customer</strong> for table 2.";
        } else {
            feedback.innerHTML = "Good job! Spill cleaned safely.";
        }
    }
}


/* CLEAN SPILL FUNCTION */

function cleanSpill() {

    if (!spill) {
        return;
    }

    if (!scenarioDone[0]) {
        feedback.innerHTML =
            "Finish <strong>Guest, table 1</strong> in the panel first, then you can clean the spill.";
        return;
    }

    if (mopNearSpill(1)) {

        scene.remove(spill);
        spill = null;
        spillDone = true;
        drawChecklist();

        if (allTrainingDone()) {
            feedback.innerHTML =
                "Training complete, serve, guest talks, and spill cleanup. Great work!";
        } else if (!allTalksDone()) {
            feedback.innerHTML =
                "Spill cleared. In the <strong>Guest</strong> panel, use <strong>Next customer</strong> for table 2.";
        } else {
            feedback.innerHTML = "Good job! Spill cleaned safely.";
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
            "Training complete, serve, guest talks, and spill cleanup. Great work!";
    } else {
        feedback.innerHTML =
            "Food is on the table. Answer <strong>Guest, table 1</strong> in the panel (top right), then clean the <strong>spill</strong> with the mop.";
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
    const hits = raycaster.intersectObjects(grabList(), true);
    if (hits.length > 0) {
        mouseThing = hits[0].object.userData.grabRoot ?? hits[0].object;
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
            mouseThing.position.set(dragPoint.x, MOP_HANDLE_CENTER_Y, dragPoint.z);
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

    updateGuestJump(clock.getDelta());

    renderer.render(scene, camera);

}
