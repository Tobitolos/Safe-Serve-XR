import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/webxr/VRButton.js";

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
const hudOverlay = document.getElementById("hud");

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
const vrPanelPos = new THREE.Vector3();
const vrPanelDir = new THREE.Vector3();
let vrDialogue = null;
let vrChoiceMeshes = [];
let vrNextMesh = null;
let vrQuestionMesh = null;
let vrResultMesh = null;
let vrCurrentScenario = -1;
let vrChoiceLocked = false;

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

function allTalksDone() {
    return scenarioDone[0] && scenarioDone[1] && scenarioDone[2];
}

function allTrainingDone() {
    return spillDone && serveDone && allTalksDone();
}

function countTalksDone() {
    let n = 0;
    for (let i = 0; i < 3; i++) {
        if (scenarioDone[i]) {
            n++;
        }
    }
    return n;
}

function nextScenarioToShow() {
    if (!scenarioDone[0]) {
        return 0;
    }
    if (!spillDone) {
        return 0;
    }
    if (!scenarioDone[1]) {
        return 1;
    }
    if (!scenarioDone[2]) {
        return 2;
    }
    return -1;
}

function wrapCanvasText(ctx, text, x, startY, maxWidth, lineHeight) {
    const parts = String(text || "").split("\n");
    let y = startY;
    for (let p = 0; p < parts.length; p++) {
        const words = parts[p].split(" ");
        let line = "";
        for (let i = 0; i < words.length; i++) {
            const testLine = line ? line + " " + words[i] : words[i];
            if (ctx.measureText(testLine).width > maxWidth && line) {
                ctx.fillText(line, x, y);
                y += lineHeight;
                line = words[i];
            } else {
                line = testLine;
            }
        }
        if (line) {
            ctx.fillText(line, x, y);
            y += lineHeight;
        }
        if (p < parts.length - 1) {
            y += lineHeight * 0.4;
        }
    }
}

function makeVrTextCard(width, height, fontSize) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.userData.canvas = canvas;
    mesh.userData.ctx = ctx;
    mesh.userData.texture = texture;
    mesh.userData.fontSize = fontSize;
    return mesh;
}

function setVrTextCard(mesh, text, bgColor, textColor) {
    if (!mesh || !mesh.userData || !mesh.userData.ctx) {
        return;
    }
    const ctx = mesh.userData.ctx;
    const canvas = mesh.userData.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = textColor;
    ctx.font = "bold " + mesh.userData.fontSize + "px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    wrapCanvasText(ctx, text, 26, 24, canvas.width - 52, mesh.userData.fontSize * 1.25);
    mesh.userData.texture.needsUpdate = true;
}

function createVrDialogue() {
    vrDialogue = new THREE.Group();
    vrDialogue.visible = false;
    vrDialogue.scale.setScalar(0.45);

    const panelBg = new THREE.Mesh(
        new THREE.PlaneGeometry(2.3, 3.05),
        new THREE.MeshBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.78 })
    );
    panelBg.position.z = -0.02;
    vrDialogue.add(panelBg);

    vrQuestionMesh = makeVrTextCard(2.1, 0.85, 42);
    vrQuestionMesh.position.y = 0.95;
    vrDialogue.add(vrQuestionMesh);

    vrChoiceMeshes = [];
    for (let i = 0; i < 3; i++) {
        const btn = makeVrTextCard(2.1, 0.46, 34);
        btn.position.y = 0.34 - i * 0.54;
        btn.userData.vrKind = "choice";
        btn.userData.choiceIndex = i;
        vrChoiceMeshes.push(btn);
        vrDialogue.add(btn);
    }

    vrResultMesh = makeVrTextCard(2.1, 0.42, 32);
    vrResultMesh.position.y = -1.30;
    vrDialogue.add(vrResultMesh);

    vrNextMesh = makeVrTextCard(2.1, 0.34, 34);
    vrNextMesh.position.y = -1.73;
    vrNextMesh.userData.vrKind = "next";
    vrNextMesh.userData.enabled = false;
    vrNextMesh.visible = false;
    vrDialogue.add(vrNextMesh);

    scene.add(vrDialogue);
}

function updateVrDialoguePose() {
    if (!vrDialogue || !vrDialogue.visible || !renderer.xr.isPresenting) {
        return;
    }
    camera.getWorldPosition(vrPanelPos);
    camera.getWorldDirection(vrPanelDir);
    vrDialogue.position.copy(vrPanelPos).add(vrPanelDir.multiplyScalar(1.8));
    vrDialogue.position.y -= 0.15;
    vrDialogue.quaternion.copy(camera.quaternion);
}

function showVrScenario(index) {
    if (!vrDialogue || index < 0 || index >= SCENARIOS.length) {
        return;
    }
    const sc = SCENARIOS[index];
    vrCurrentScenario = index;
    vrChoiceLocked = false;
    vrDialogue.visible = true;
    setVrTextCard(vrQuestionMesh, "Guest, table " + (index + 1) + "\n" + sc.prompt, "#1d2333", "#ffffff");
    for (let i = 0; i < vrChoiceMeshes.length; i++) {
        const label = sc.choices[i] ? (i + 1) + ") " + sc.choices[i].label : "";
        setVrTextCard(vrChoiceMeshes[i], label, "#f2f5ff", "#111111");
        vrChoiceMeshes[i].visible = !!sc.choices[i];
    }
    setVrTextCard(vrResultMesh, "Pick one answer with your controller trigger.", "#111111", "#e8e8e8");
    vrNextMesh.visible = false;
    updateVrDialoguePose();
}

function updateVrNextButton() {
    if (!vrNextMesh || !vrDialogue || !vrDialogue.visible || vrCurrentScenario < 0) {
        return;
    }
    if (vrCurrentScenario === 0 && scenarioDone[0] && !spillDone) {
        vrNextMesh.visible = true;
        vrNextMesh.userData.enabled = false;
        setVrTextCard(vrNextMesh, "Clean spill first to unlock table 2", "#5b1f1f", "#ffffff");
        return;
    }
    if (vrCurrentScenario < SCENARIOS.length - 1 && scenarioDone[vrCurrentScenario]) {
        vrNextMesh.visible = true;
        vrNextMesh.userData.enabled = true;
        setVrTextCard(
            vrNextMesh,
            "Next customer (table " + (vrCurrentScenario + 2) + ")",
            "#204070",
            "#ffffff"
        );
        return;
    }
    vrNextMesh.visible = false;
}

function onVrChoicePicked(choiceIndex) {
    if (!vrDialogue || !vrDialogue.visible || vrChoiceLocked || vrCurrentScenario < 0) {
        return;
    }
    const sc = SCENARIOS[vrCurrentScenario];
    if (!sc.choices[choiceIndex] || scenarioDone[vrCurrentScenario]) {
        return;
    }
    vrChoiceLocked = true;
    const choice = sc.choices[choiceIndex];
    scenarioDone[vrCurrentScenario] = true;
    drawChecklist();

    if (choice.ok && vrCurrentScenario === 1 && guestByTable[1]) {
        startGuestJump(guestByTable[1]);
    }

    for (let i = 0; i < vrChoiceMeshes.length; i++) {
        const base = i === choiceIndex ? "#c9f0cb" : "#dddddd";
        const label = sc.choices[i] ? (i + 1) + ") " + sc.choices[i].label : "";
        setVrTextCard(vrChoiceMeshes[i], label, base, "#111111");
    }

    setVrTextCard(vrResultMesh, choice.note, "#112211", "#d7ffd7");

    if (vrCurrentScenario < SCENARIOS.length - 1) {
        if (vrCurrentScenario === 0) {
            feedback.innerHTML =
                "Table 1 done in VR. Clean the <strong>spill</strong> with the mop, then use <strong>Next customer</strong> in VR.";
        } else {
            feedback.innerHTML =
                "Table 2 done in VR. Use <strong>Next customer</strong> in VR for table 3.";
        }
    } else {
        feedback.innerHTML =
            "You helped all three tables in VR. Finish remaining tasks if needed.";
    }

    updateVrNextButton();
}

function onVrNextPicked() {
    if (!vrNextMesh || !vrNextMesh.visible || !vrNextMesh.userData.enabled) {
        feedback.innerHTML = "Finish required task first before moving to the next customer.";
        return;
    }
    const next = vrCurrentScenario + 1;
    if (next >= SCENARIOS.length) {
        vrDialogue.visible = false;
        return;
    }
    showVrScenario(next);
}

function handleVrUiSelect(controller) {
    if (!renderer.xr.isPresenting || !vrDialogue || !vrDialogue.visible) {
        return false;
    }
    controllerRay(controller);
    const pickables = [];
    for (let i = 0; i < vrChoiceMeshes.length; i++) {
        if (vrChoiceMeshes[i].visible) {
            pickables.push(vrChoiceMeshes[i]);
        }
    }
    if (vrNextMesh && vrNextMesh.visible) {
        pickables.push(vrNextMesh);
    }
    if (pickables.length === 0) {
        return false;
    }
    const hits = raycaster.intersectObjects(pickables, false);
    if (hits.length === 0) {
        return false;
    }
    const target = hits[0].object;
    if (target.userData.vrKind === "choice") {
        onVrChoicePicked(target.userData.choiceIndex);
        return true;
    }
    if (target.userData.vrKind === "next") {
        onVrNextPicked();
        return true;
    }
    return false;
}

function init() {
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
    document.body.appendChild(
        VRButton.createButton(renderer, {
            optionalFeatures: ["dom-overlay"],
            domOverlay: hudOverlay ? { root: hudOverlay } : undefined,
        })
    );
    renderer.xr.addEventListener("sessionstart", function () {
        document.body.classList.add("xr-mode");
        if (guestPanelOpened && !allTalksDone()) {
            dialoguePanel.classList.add("hidden");
            showVrScenario(nextScenarioToShow());
        }
    });
    renderer.xr.addEventListener("sessionend", function () {
        document.body.classList.remove("xr-mode");
        if (vrDialogue) {
            vrDialogue.visible = false;
        }
        if (guestPanelOpened && !allTalksDone()) {
            dialoguePanel.classList.remove("hidden");
            loadScenario(nextScenarioToShow());
        }
    });

    window.addEventListener("resize", onWindowResize);

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
    scene.add(light);

    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x999999 });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;

    scene.add(floor);

    const counterGeometry = new THREE.BoxGeometry(3, 1, 1);
    const counterMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });

    const counter = new THREE.Mesh(counterGeometry, counterMaterial);
    counter.position.set(0, 0.5, -3);

    scene.add(counter);

    const spillGeometry = new THREE.CircleGeometry(0.5, 32);

    const spillMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000
    });

    spill = new THREE.Mesh(spillGeometry, spillMaterial);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0.8, 0.01, -1);

    scene.add(spill);

    const mopGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.75, 16);
    mop = new THREE.Mesh(
        mopGeo,
        new THREE.MeshStandardMaterial({ color: 0xffee44, roughness: 0.5 })
    );
    mop.position.set(1.35, 1.75 / 2 + 0.04, -2.28);
    scene.add(mop);

    const plateGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32);
    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5f0 });

    plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.position.set(-0.75, 1.02, -2.85);
    plate.userData.canGrab = true;
    scene.add(plate);

    const wood = new THREE.MeshStandardMaterial({ color: 0x8B4513 });

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
    placemat.position.set(-0.45, 0.701, -1.72);
    scene.add(placemat);

    const table1Cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.056, 0.11, 20),
        new THREE.MeshStandardMaterial({ color: 0xc41e1e })
    );
    table1Cup.position.set(0.68, 0.718, -1.46);
    table1Cup.rotation.x = Math.PI / 2.12;
    table1Cup.rotation.y = -0.38;
    table1Cup.rotation.z = 0.06;
    scene.add(table1Cup);

    buildTable(-3.2, 0.6, wood);
    buildTable(3.2, 0.6, wood);

    table3Plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.04, 32),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f0 })
    );
    table3Plate.position.set(3.65, 0.72, 0.72);
    table3Plate.rotation.y = 0.15;
    scene.add(table3Plate);

    guestByTable.push(buildGuest(-0.95, -1.35, 0x3355aa, 0xe8b896));
    guestByTable.push(buildGuest(-4.05, 0.85, 0xaa3355, 0xd4a574));
    guestByTable.push(buildGuest(4.05, 0.85, 0x228866, 0xc9a686));
    createVrDialogue();

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

    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerUp);
    canvas.addEventListener("pointercancel", onCanvasPointerUp);

    drawChecklist();
    feedback.innerHTML =
        "<strong>SafeServe XR</strong><br>" +
        "1) Grab the <strong>plate</strong>, put it on the <strong>green mat</strong> by table 1 (blue guest).<br>" +
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
    if (renderer.xr.isPresenting) {
        dialoguePanel.classList.add("hidden");
        showVrScenario(0);
        feedback.innerHTML =
            "Answer customer questions in VR by pointing at choices and pressing trigger.";
        return;
    }
    dialoguePanel.classList.remove("hidden");
    loadScenario(0);
    feedback.innerHTML =
        "Answer <strong>Guest, table 1</strong>, then clean the <strong>spill</strong> with the mop. After that, use <strong>Next customer</strong> for tables 2 and 3.";
}

function grabList() {
    const list = [];
    if (spill && scenarioDone[0]) {
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
        "<strong>Training checklist</strong><br>Serve (table 1): " +
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
    if (handleVrUiSelect(controller)) {
        return;
    }
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

function spillClearedFeedback() {
    if (allTrainingDone()) {
        feedback.innerHTML =
            "Training complete, serve, guest talks, and spill cleanup. Great work!";
    } else if (!allTalksDone()) {
        feedback.innerHTML =
            "Spill cleared. In the <strong>Guest</strong> panel, use <strong>Next customer</strong> for table 2.";
    } else {
        feedback.innerHTML = "Good job! Spill cleaned safely.";
    }
    updateVrNextButton();
}

function tryCompleteSpill() {
    if (!spill || !mopNearSpill(0.95)) {
        return;
    }
    scene.remove(spill);
    spill = null;
    spillDone = true;
    drawChecklist();
    spillClearedFeedback();
}

function cleanSpill() {
    if (!spill) {
        return;
    }
    if (!scenarioDone[0]) {
        feedback.innerHTML =
            "Finish <strong>Guest, table 1</strong> in the panel first, then you can clean the spill.";
        return;
    }
    if (!mopNearSpill(1)) {
        feedback.innerHTML = "Move the mop closer to the spill.";
        return;
    }
    scene.remove(spill);
    spill = null;
    spillDone = true;
    drawChecklist();
    spillClearedFeedback();
}

function plateOnServeZone() {
    plate.getWorldPosition(worldPlate);
    return (
        worldPlate.x > -0.82 &&
        worldPlate.x < -0.08 &&
        worldPlate.z > -2.05 &&
        worldPlate.z < -1.44 &&
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
            "Put the plate on the <strong>green mat</strong> by table 1.";
        return;
    }

    plate.userData.canGrab = false;
    serveDone = true;
    plate.position.set(-0.45, 0.72, -1.72);
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
            mouseThing.position.set(dragPoint.x, 1.75 / 2 + 0.04, dragPoint.z);
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


window.addEventListener("keydown", function (event) {
    if (event.key === "c") {
        cleanSpill();
    }
});

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

    updateVrDialoguePose();
    updateGuestJump(clock.getDelta());

    renderer.render(scene, camera);

}
