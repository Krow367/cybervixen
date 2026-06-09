import { clear } from "../../screen.js";
import { type, alert, prompt } from "../../io.js";
import { registerGame, abortGame } from "../../games.js";
import {
    callDebugger,
    getter,
    setter,
    toggleDebugPanel,
    destroyDebugPanel
} from "../../hackz/debugger.js";

let loaded = false;
let controller;
let debug;

let callout = {
    text: "",
    timer: 0,
};

// canvas + drawing
let canvas;
let ctx;
let fgColor;
let frameId = null;
let brickBursts = [];
let awaitingServe = false;

// active game objects
let ball;
let paddle;
let bricks;
let score = 0;

// run / level state
let runState = null;
let levelState = null;
let currentLevelDef = null;
let hud = null;
let pendingAction = null;
let gameOver = false;

// world / playfield view
let world = null;

const deadText =
    "You failed to spoof the needed credentials with foxHound. Data corrupted. All progress loss. Restart foxHound? [Y/N]";

const layoutConfig = {
    hudWidth: 240,
    playWidth: 960,
    playHeight: 640,
    gap: 16,
    viewportPadding: 20,
    maxScale: 1.5,
    extraHeight: 140
};

const canvasBase = {
    width: layoutConfig.playWidth,
    height: layoutConfig.playHeight
};

const ATTEMPTS_PER_LEVEL = 2;

// classic-style speed tiers per level
const levelDefs = [
    {
        id: 0,
        name: "HANDSHAKE",
        rows: 5,
        cols: 8,
        paddleWidth: 75,
        paddleSpeed: 7,
        speedTiers: [4.0, 4.35, 4.8, 5.2],
        startSpeedTier: 0,
        revealThresholds: [0.2, 0.4, 0.6, 0.8],
        anomalyPlan: [
            { threshold: 0.50, activate: { glitch: 2, ghost: 1 } },
            { threshold: 0.75, activate: { glitch: 1, ghost: 1, mover: 1 } }
        ]
    },
    {
        id: 1,
        name: "DECRYPT",
        rows: 6,
        cols: 9,
        paddleWidth: 75,
        paddleSpeed: 7,
        speedTiers: [5.0, 5.35, 5.8, 6.25],
        startSpeedTier: 0,
        revealThresholds: [0.18, 0.36, 0.54, 0.72, 0.88],
        anomalyPlan: [
            { threshold: 0.00, activate: { glitch: 2, ghost: 1 } },
            { threshold: 0.35, activate: { glitch: 2, ghost: 1, mover: 1 } },
            { threshold: 0.70, activate: { glitch: 1, ghost: 1, mover: 1, teleport: 1 } }
        ]
    },
    {
        id: 2,
        name: "INJECT",
        rows: 9,
        cols: 12,
        paddleWidth: 68,
        paddleSpeed: 8,
        speedTiers: [6.0, 6.35, 6.8, 7.2, 7.75],
        startSpeedTier: 0,
        revealThresholds: [0.15, 0.3, 0.45, 0.6, 0.75, 0.9],
        anomalyPlan: [
            { threshold: 0.00, activate: { glitch: 3, ghost: 2, mover: 1 } },
            { threshold: 0.25, activate: { glitch: 2, ghost: 1, mover: 1 } },
            { threshold: 0.50, activate: { glitch: 2, ghost: 1, mover: 1, teleport: 1 } },
            { threshold: 0.75, activate: { glitch: 1, ghost: 1, mover: 1, teleport: 1 } }
        ]
    }
];

// board layout defaults in world-space
const boardTopMargin = 70;
const boardBottomMargin = 90;
const boardSideMargin = 24;
const preferredBrickW = 75;
const preferredBrickH = 20;
const preferredBrickPad = 10;

const defaultSettings = {
    paddle: {
        w: 75,
        speed: 7
    }
};

// ─── Assets ─────────────────────────────────────────────────────────

async function ensureAssets() {
    if (loaded) return;
    loaded = true;

    const crt = document.getElementById("crt");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./commands/foxhound/foxhound.css";
    document.head.appendChild(link);

    const html = await fetch("./commands/foxhound/foxhound.html").then(r => r.text());
    crt.insertAdjacentHTML("afterbegin", html);
}

function getPhosphor() {
    return getComputedStyle(document.documentElement)
        .getPropertyValue("--phosphor")
        .trim();
}

const FOXHOUND_SAVE_KEY = "foxhoundState";

function loadFoxhoundState() {
    try {
        return JSON.parse(localStorage.getItem(FOXHOUND_SAVE_KEY)) ?? {
            completedOnce: false,
            credentialUnlocked: false,
        };
    } catch {
        return {
            completedOnce: false,
            credentialUnlocked: false,
        };
    }
}

function saveFoxhoundState(next) {
    try {
        localStorage.setItem(FOXHOUND_SAVE_KEY, JSON.stringify(next));
    } catch { }
}

let foxhoundState = loadFoxhoundState();

// ─── Entry point ────────────────────────────────────────────────────


export default async function () {

    const helpRepaired = localStorage.getItem("helpRepaired") === "true";

    if (!helpRepaired) {
        await type("Unknown command.");
        return;
    }

    clear();
    runState = createRunState();
    await ensureAssets();
    await new Promise(resolve => {
        setTimeout(() => init(resolve), 50);
    });
}

// ─── State helpers ──────────────────────────────────────────────────

function createRunState() {
    return {
        levelIndex: 0,
        totalScore: 0,
        levelsCleared: 0,
        runFailed: false,
        runWon: false,
        credentialParts: [
            createCredentialPart("B.Higgs.1746"),
            createCredentialPart("Yq23Q9+7r,rE"),
            createCredentialPart("Magenta-3")
        ],
        log: []
    };
}

function createLevelState(levelDef) {
    return {
        score: 0,
        bricksCleared: 0,
        totalBricks: levelDef.rows * levelDef.cols,
        gameOver: false,
        cleared: false,
        attemptsLeft: ATTEMPTS_PER_LEVEL,
        specialActive: "",
        rallyHits: 0,
        speedRowBoosts: {
            upperHalf: false,
            topThree: false,
            finalTier: false,
        },
        anomalyWavesTriggered: new Set(),
    };
}


function getLevelClearRatio() {
    return levelState.totalBricks === 0
        ? 0
        : levelState.bricksCleared / levelState.totalBricks;
}

function getFullCredentialString() {
    return runState.credentialParts.map(part => part.value).join(" ");
}

function createCredentialPart(value) {
    const revealableIndices = Array.from(value)
        .map((ch, i) => /[A-Z0-9]/i.test(ch) ? i : -1)
        .filter(i => i !== -1);

    return {
        value,
        revealed: Array.from(value, ch => !/[A-Z0-9]/i.test(ch)),
        revealableIndices,
    };
}

function revealCredentialToPercent(levelIndex, percent) {
    const part = runState.credentialParts[levelIndex];
    if (!part) return false;

    const revealable = part.revealableIndices ?? [];
    if (!revealable.length) return false;

    const clamped = Math.max(0, Math.min(1, percent));
    const targetCount = Math.floor(revealable.length * clamped);

    let currentCount = revealable.filter(i => part.revealed[i]).length;
    if (currentCount >= targetCount) return false;

    const hidden = revealable.filter(i => !part.revealed[i]);
    shuffleInPlace(hidden);

    let changed = false;
    for (let i = 0; i < hidden.length && currentCount < targetCount; i++) {
        part.revealed[hidden[i]] = true;
        currentCount++;
        changed = true;
    }

    return changed;
}

function updateCredentialRevealProgress() {
    if (foxhoundState.completedOnce) return;
    const thresholds = currentLevelDef.revealThresholds ?? [];
    if (!thresholds.length) return;

    const progress = levelState.totalBricks === 0
        ? 0
        : levelState.bricksCleared / levelState.totalBricks;

    let stagesPassed = 0;
    for (let i = 0; i < thresholds.length; i++) {
        if (progress >= thresholds[i]) stagesPassed++;
    }

    if (stagesPassed === 0) return;

    const stagePercent = stagesPassed / thresholds.length;
    const revealPercent = stagePercent * 0.8;

    const changed = revealCredentialToPercent(runState.levelIndex, revealPercent);

    if (changed) {
        pushLog(`SEGMENT ${Math.round(revealPercent * 100)}% STABLE`);
        showBanner("CREDENTIAL SEGMENT REVEALED");
    }
}



// ─── Cleanup ────────────────────────────────────────────────────────

function stopGame(onDone) {
    const wrap = document.getElementById("foxhound-wrap");
    abortGame("foxhound");
    destroyDebugPanel();

    if (wrap) {
        wrap.style.display = "none";
    }

    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }

    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (onDone) onDone();
}

// ─── Init ───────────────────────────────────────────────────────────

export function init(onDone = () => { }) {
    controller = new AbortController();
    registerGame("foxhound", controller);
    const { signal } = controller;

    const wrap = document.getElementById("foxhound-wrap");
    wrap.style.display = "";

    canvas = document.getElementById("foxhound-breakout");
    ctx = canvas.getContext("2d");
    fgColor = getPhosphor();

    cacheHud();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas, { signal });

    document.addEventListener(
        "keydown",
        e => {
            const el = document.getElementById("alert-frame");

            if (e.key === "Escape") {
                el?.classList.add("hidden");
                stopGame(onDone);
                clear();
                return;
            }

            if (globalThis.DEBUG && e.code === "KeyP") {
                toggleDebugPanel();
                return;
            }

            if (globalThis.DEBUG && e.code === "KeyR") {
                el?.classList.add("hidden");
                loadLevel(runState.levelIndex);
                return;
            }

            if (globalThis.DEBUG && (e.code === "Digit1" || e.code === "Digit2" || e.code === "Digit3")) {
                const digit = Number(e.code.replace("Digit", ""));
                const nextIndex = digit - 1;

                if (nextIndex >= 0 && nextIndex < levelDefs.length) {
                    jumpToLevel(nextIndex);
                }
                return;
            }

            if (levelState?.gameOver) {
                if (performance.now() < inputLockUntil) {
                    return;
                }
                if (pendingAction === "final-complete") {
                    el?.classList.add("hidden");
                    void handleFinalContinue(onDone);
                    return;
                }
                if (e.code === "KeyY") {
                    el?.classList.add("hidden");
                    handlePendingYes();
                } else if (e.code === "KeyN") {
                    el?.classList.add("hidden");
                    pendingAction = null;
                    clear();
                    stopGame(onDone);
                }
                return;
            }
            if (awaitingServe && !levelState?.gameOver) {
                awaitingServe = false;
                launchBall();
            }
            if (e.key === "ArrowLeft" || e.code === "KeyA") {
                paddle.left = true;
            } else if (e.key === "ArrowRight" || e.code === "KeyD") {
                paddle.right = true;
            }
        },
        { signal }
    );

    document.addEventListener(
        "keyup",
        e => {
            if (!paddle) return;

            if (e.key === "ArrowLeft" || e.code === "KeyA") {
                paddle.left = false;
            } else if (e.key === "ArrowRight" || e.code === "KeyD") {
                paddle.right = false;
            }
        },
        { signal }
    );

    try {
        loadLevel(runState.levelIndex);
    } catch (e) {
        console.error("foxhound init error", e);
    }

    debug = callDebugger({
        title: "foxHound",
        target: () => ({
            runState,
            levelState,
            currentLevelDef,
            world,
            ball,
            paddle,
            bricks,
            score,
            gameOver
        }),
        fields: [
            setter(
                "currentLevelDef.paddleWidth",
                () => currentLevelDef?.paddleWidth,
                value => {
                    const n = Number(value);
                    if (!Number.isFinite(n) || n < 20 || !currentLevelDef) return;

                    currentLevelDef.paddleWidth = n;
                    defaultSettings.paddle.w = n;

                    if (paddle) {
                        paddle.w = n;
                        paddle.x = Math.min(paddle.x, world.right - paddle.w);
                    }

                    renderHud();
                }
            ),
            setter(
                "currentLevelDef.paddleSpeed",
                () => currentLevelDef?.paddleSpeed,
                value => {
                    const n = Number(value);
                    if (!Number.isFinite(n) || n <= 0 || !currentLevelDef) return;

                    currentLevelDef.paddleSpeed = n;
                    defaultSettings.paddle.speed = n;

                    if (paddle) {
                        paddle.speed = n;
                    }

                    renderHud();
                }
            ),
            setter(
                "currentLevelDef.rows",
                () => currentLevelDef?.rows,
                value => {
                    const n = Number(value);
                    if (!Number.isFinite(n) || n <= 0 || !currentLevelDef || !levelState) return;
                    currentLevelDef.rows = Math.floor(n);
                    levelState.totalBricks = currentLevelDef.rows * currentLevelDef.cols;
                    renderHud();
                }
            ),
            setter(
                "currentLevelDef.cols",
                () => currentLevelDef?.cols,
                value => {
                    const n = Number(value);
                    if (!Number.isFinite(n) || n <= 0 || !currentLevelDef || !levelState) return;
                    currentLevelDef.cols = Math.floor(n);
                    levelState.totalBricks = currentLevelDef.rows * currentLevelDef.cols;
                    renderHud();
                }
            ),
            setter(
                "currentLevelDef.startSpeedTier",
                () => currentLevelDef?.startSpeedTier,
                value => {
                    const n = Number(value);
                    if (!Number.isFinite(n) || !currentLevelDef) return;
                    currentLevelDef.startSpeedTier = Math.max(0, Math.min(3, Math.floor(n)));
                    if (ball) {
                        ball.speedTier = currentLevelDef.startSpeedTier;
                        syncBallSpeed();
                    }
                    renderHud();
                }
            ),
            getter("runState.levelIndex", () => runState?.levelIndex),
            getter("levelState.attemptsLeft", () => levelState?.attemptsLeft),
            getter("levelState.bricksCleared", () => levelState?.bricksCleared),
            getter("levelState.totalBricks", () => levelState?.totalBricks),
            getter("levelState.rallyHits", () => levelState?.rallyHits),
            getter("ball.speedTier", () => ball?.speedTier),
            getter("ball.speed", () => ball?.speed),
            getter("world.scale", () => world?.scale),
            getter("score", () => score),
            getter("gameOver", () => gameOver)
        ]
    });
}

// ─── HUD / wrapper scale ───────────────────────────────────────────

function cacheHud() {
    hud = {
        credential: document.getElementById("foxhound-credential"),
        runStats: document.getElementById("foxhound-run-stats"),
        status: document.getElementById("foxhound-status"),
        log: document.getElementById("foxhound-log"),
        banner: document.getElementById("foxhound-banner")
    };
}

function applyLayoutVars() {
    const wrap = document.getElementById("foxhound-wrap");
    if (!wrap) return;

    wrap.style.setProperty("--foxhud-w", `${layoutConfig.hudWidth}px`);
    wrap.style.setProperty("--foxplay-w", `${canvasBase.width}px`);
    wrap.style.setProperty("--foxplay-h", `${canvasBase.height}px`);
    wrap.style.setProperty("--fox-gap", `${layoutConfig.gap}px`);
}

function resizeCanvas() {
    const wrap = document.getElementById("foxhound-wrap");
    if (!wrap || !canvas) return;

    canvas.width = canvasBase.width;
    canvas.height = canvasBase.height;

    applyLayoutVars();

    const fullWidth =
        layoutConfig.hudWidth +
        canvasBase.width +
        layoutConfig.hudWidth +
        layoutConfig.gap * 2;

    const fullHeight = canvasBase.height + layoutConfig.extraHeight;

    const scale = Math.min(
        (window.innerWidth - layoutConfig.viewportPadding) / fullWidth,
        (window.innerHeight - layoutConfig.viewportPadding) / fullHeight,
        layoutConfig.maxScale
    );

    wrap.style.setProperty("--fox-scale", scale);
}

function renderHud() {
    if (!hud || !runState || !levelState || !currentLevelDef || !paddle || !ball || !world) return;

    hud.runStats.textContent = [
        `BREACH LEVEL :: ${runState.levelIndex + 1}/3`,
        `ATTEMPTS LEFT :: ${levelState.attemptsLeft}`,
        `BYTES DECRYPTED :: ${runState.totalScore}`,
        `NODES CLEARED :: ${levelState.bricksCleared}/${levelState.totalBricks}`
    ].join("\n");

    hud.status.textContent = [
        `LEVEL :: ${currentLevelDef.name}`,
        `PAYLOAD TIER :: ${ball.speedTier + 1}/${currentLevelDef.speedTiers.length}`,
        `COUNTERMEASURES :: ${getLiveCountermeasureSummary()}`
    ].join("\n");

    const credentialLabels = ["USER:", "PASS:", "CLEAR:"];
    hud.credential.textContent = runState.credentialParts
        .map((part, i) => {
            const rendered = foxhoundState.completedOnce ? part.value : renderCredentialPart(part);
            return `${credentialLabels[i] ?? `KEY${i + 1}`} :: ${rendered}`;
        })
        .join("\n");

    hud.log.textContent = runState.log.slice(-5).join("\n");
}

function pushLog(message) {
    runState.log.push(message);
    if (runState.log.length > 20) runState.log.shift();
}

function showBanner(text, duration = 120) {
    if (hud?.banner) {
        hud.banner.textContent = text;
    }
    callout.text = text;
    callout.timer = duration;
}

function getLiveCountermeasureSummary() {
    if (!bricks) return "NONE";

    const counts = {
        glitch: 0,
        ghost: 0,
        mover: 0,
        teleport: 0,
    };

    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const b = bricks[c][r];
            if (!b.alive) continue;
            if (counts[b.type] !== undefined) counts[b.type]++;
        }
    }

    const parts = [];
    if (counts.glitch) parts.push(`GLITCH ${counts.glitch}`);
    if (counts.ghost) parts.push(`GHOST ${counts.ghost}`);
    if (counts.mover) parts.push(`MOVER ${counts.mover}`);
    if (counts.teleport) parts.push(`SHIFT ${counts.teleport}`);

    return parts.length ? parts.join(" | ") : "NONE";
}

// ─── World sizing / zoom ───────────────────────────────────────────

function computeWorld(levelDef) {
    const boardWidth =
        levelDef.cols * preferredBrickW + (levelDef.cols - 1) * preferredBrickPad;
    const boardHeight =
        levelDef.rows * preferredBrickH + (levelDef.rows - 1) * preferredBrickPad;

    const contentWidth = boardWidth + boardSideMargin * 2;
    const contentHeight = boardHeight + boardTopMargin + boardBottomMargin;

    const scaleX = canvas.width / contentWidth;
    const scaleY = canvas.height / contentHeight;
    const scale = Math.min(scaleX, scaleY);

    const worldWidth = canvas.width / scale;
    const worldHeight = canvas.height / scale;

    const boardX = (worldWidth - boardWidth) / 2;
    const boardY = boardTopMargin;

    return {
        scale,
        width: worldWidth,
        height: worldHeight,
        left: 0,
        top: 0,
        right: worldWidth,
        bottom: worldHeight,
        boardX,
        boardY,
        boardWidth,
        boardHeight,
        brickW: preferredBrickW,
        brickH: preferredBrickH,
        brickPad: preferredBrickPad
    };
}

// ─── Ball speed / angle helpers ────────────────────────────────────

function getCurrentSpeedValue() {
    return currentLevelDef.speedTiers[ball.speedTier];
}

function syncBallSpeed() {
    const len = Math.hypot(ball.dx, ball.dy) || 1;
    const speed = currentLevelDef.speedTiers[ball.speedTier];
    ball.speed = speed;
    ball.dx = (ball.dx / len) * speed;
    ball.dy = (ball.dy / len) * speed;
}

function setBallDirection(dirX, dirY) {
    const len = Math.hypot(dirX, dirY) || 1;
    const speed = getCurrentSpeedValue();
    ball.speed = speed;
    ball.dx = (dirX / len) * speed;
    ball.dy = (dirY / len) * speed;
}

function setSpeedTier(nextTier) {
    const clamped = Math.max(
        0,
        Math.min(currentLevelDef.speedTiers.length - 1, nextTier)
    );

    if (clamped === ball.speedTier) return;

    ball.speedTier = clamped;
    syncBallSpeed();
    pushLog(`PAYLOAD SPEED TIER :: ${ball.speedTier + 1}`);
    showBanner(`PAYLOAD SPEED INCREASED :: TIER ${ball.speedTier + 1}`);
}

function resetBallProgressForAttempt() {
    levelState.rallyHits = 0;
    levelState.speedRowBoosts = {
        upperHalf: false,
        topThree: false
    };
    ball.speedTier = currentLevelDef.startSpeedTier;
    syncBallSpeed();
}

function updateSpeedTierFromClassicRules(brickRow) {
    levelState.rallyHits++;

    if (levelState.rallyHits >= 4) {
        setSpeedTier(Math.max(ball.speedTier, 1));
    }

    if (levelState.rallyHits >= 12) {
        setSpeedTier(Math.max(ball.speedTier, 2));
    }

    if (brickRow <= 2 && !levelState.speedRowBoosts.topThree) {
        levelState.speedRowBoosts.topThree = true;
        setSpeedTier(Math.max(ball.speedTier, 3));
    } else if (
        brickRow < Math.floor(currentLevelDef.rows / 2) &&
        !levelState.speedRowBoosts.upperHalf
    ) {
        levelState.speedRowBoosts.upperHalf = true;
        setSpeedTier(Math.max(ball.speedTier, 2));
    }

    if (
        currentLevelDef.id === 2 &&
        currentLevelDef.speedTiers.length >= 5 &&
        !levelState.speedRowBoosts.finalTier &&
        getLevelClearRatio() >= 0.5
    ) {
        levelState.speedRowBoosts.finalTier = true;
        setSpeedTier(4);
        pushLog("PAYLOAD OVERLOAD ENGAGED");
        showBanner("PAYLOAD TIER 5 ENGAGED");
    }
}

function launchBall() {
    const spread = Math.PI / 3;
    const baseAngle = -Math.PI / 2;
    const angleOffset = Math.random() * spread - spread / 2;
    const angle = baseAngle + angleOffset;

    ball.speedTier = currentLevelDef.startSpeedTier;
    ball.speed = currentLevelDef.speedTiers[ball.speedTier];
    ball.dx = Math.cos(angle) * ball.speed;
    ball.dy = Math.sin(angle) * ball.speed;
}

function bounceOffPaddle() {
    ball.y = paddle.y - ball.r;

    const hit = ball.x - (paddle.x + paddle.w / 2);
    const norm = Math.max(-1, Math.min(1, hit / (paddle.w / 2)));

    const maxBounceAngle = Math.PI * 0.72;
    const angle = (-Math.PI / 2) + norm * (maxBounceAngle / 2);

    let dirX = Math.cos(angle);
    let dirY = Math.sin(angle);

    if (Math.abs(dirX) < 0.12) {
        dirX = 0.12 * (Math.random() < 0.5 ? -1 : 1);
    }

    setBallDirection(dirX, dirY);
}

// ─── Level / attempt loading ───────────────────────────────────────

function loadLevel(index) {
    currentLevelDef = levelDefs[index];
    levelState = createLevelState(currentLevelDef);

    defaultSettings.paddle.w = currentLevelDef.paddleWidth;
    defaultSettings.paddle.speed = currentLevelDef.paddleSpeed;

    world = computeWorld(currentLevelDef);

    pushLog(`LEVEL ${index + 1} :: ${currentLevelDef.name}`);
    showBanner(`LEVEL ${index + 1} :: ${currentLevelDef.name}`);

    buildFreshBoardAndServe();
}

function buildFreshBoardAndServe() {
    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }

    world = computeWorld(currentLevelDef);

    gameOver = false;
    levelState.gameOver = false;
    levelState.cleared = false;
    levelState.score = 0;
    levelState.bricksCleared = 0;
    levelState.rallyHits = 0;
    levelState.speedRowBoosts = {
        upperHalf: false,
        topThree: false
    };
    score = 0;

    bricks = buildBrickGrid(currentLevelDef);
    spawnBallAndPaddleForAttempt();

    renderHud();
    loop();
}

function spawnBallAndPaddleForAttempt() {
    paddle = {
        x: (world.width - defaultSettings.paddle.w) / 2,
        y: world.height - 20,
        w: defaultSettings.paddle.w,
        h: 10,
        speed: defaultSettings.paddle.speed,
        left: false,
        right: false,
        vx: 0,
        prevX: 0
    };

    ball = {
        x: paddle.x + paddle.w / 2,
        y: paddle.y - 12,
        dx: 0,
        dy: 0,
        r: 8,
        speedTier: currentLevelDef.startSpeedTier,
        speed: currentLevelDef.speedTiers[currentLevelDef.startSpeedTier]
    };

    awaitingServe = true;
    resetBallProgressForAttempt();
}

function continueLevelFromAttemptLoss() {
    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }

    gameOver = false;
    levelState.gameOver = false;
    pendingAction = null;

    spawnBallAndPaddleForAttempt();
    renderHud();
    loop();
}

function buildBrickGrid(levelDef) {
    const out = [];

    for (let c = 0; c < levelDef.cols; c++) {
        out[c] = [];
        for (let r = 0; r < levelDef.rows; r++) {
            const x = world.boardX + c * (world.brickW + world.brickPad);
            const y = world.boardY + r * (world.brickH + world.brickPad);

            out[c][r] = {
                ...createBrick(x, y, levelDef, r),
                w: world.brickW,
                h: world.brickH,
                row: r,
                col: c,
                slotCol: c,
                slotRow: r
            };
        }
    }

    return out;
}

function createBrick(x, y, levelDef, row) {
    let type = "normal";
    const roll = Math.random();

    if (roll < levelDef.teleportRate) type = "teleport";
    else if (roll < levelDef.teleportRate + levelDef.moverRate) type = "mover";
    else if (roll < levelDef.teleportRate + levelDef.moverRate + levelDef.ghostRate) type = "ghost";
    else if (
        roll <
        levelDef.teleportRate +
        levelDef.moverRate +
        levelDef.ghostRate +
        levelDef.glitchRate
    ) {
        type = "glitch";
    }

    return {
        x,
        y,
        baseX: x,
        baseY: y,
        alive: true,
        visible: true,
        tangible: true,
        type,
        special: type !== "normal",
        teleportCharges: type === "teleport" ? 2 : 0,
        teleportCooldown: 0,
        teleportArmed: true,

        ghostPhase: Math.random(),
        ghostCorporealTimer: 0,
        ghostCycleFrames: 220 + Math.floor(Math.random() * 100),

        glitchBurstTimer: 0,
        glitchNextBurst: 60 + Math.floor(Math.random() * 140),
        glitchSlots: makeInitialGlitchSlots(),
        pendingGlitchReroll: false,

        slotCol: null,
        slotRow: row,
        moveState: "idle",
        moveCooldown: 90 + Math.floor(Math.random() * 120),
        moveProgress: 0,
        moveFromX: x,
        moveFromY: y,
        moveToX: x,
        moveToY: y,

        row
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOut(t) {
    return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function getGridSlotPosition(col, row) {
    return {
        x: world.boardX + col * (world.brickW + world.brickPad),
        y: world.boardY + row * (world.brickH + world.brickPad)
    };
}

function getBrickAtLogicalSlot(col, row, ignoreBrick = null) {
    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const b = bricks[c][r];
            if (!b.alive || b === ignoreBrick) continue;
            if (b.slotCol === col && b.slotRow === row) return b;
        }
    }
    return null;
}

function getClearedLogicalSlots() {
    const slots = [];

    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const occupied = getBrickAtLogicalSlot(c, r);
            if (!occupied) {
                slots.push({ col: c, row: r, ...getGridSlotPosition(c, r) });
            }
        }
    }

    return slots;
}

function getAvailableNeighborSlots(brick) {
    const dirs = [
        { dc: 1, dr: 0 },
        { dc: -1, dr: 0 },
        { dc: 0, dr: 1 },
        { dc: 0, dr: -1 },
        { dc: 1, dr: 1 },
        { dc: -1, dr: 1 },
        { dc: 1, dr: -1 },
        { dc: -1, dr: -1 }
    ];

    const out = [];

    for (const { dc, dr } of dirs) {
        const col = brick.slotCol + dc;
        const row = brick.slotRow + dr;

        if (col < 0 || col >= currentLevelDef.cols) continue;
        if (row < 0 || row >= currentLevelDef.rows) continue;

        if (!getBrickAtLogicalSlot(col, row, brick)) {
            out.push({ col, row, ...getGridSlotPosition(col, row) });
        }
    }

    return out;
}

function distanceToBrickCenter(brick) {
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    return Math.hypot(ball.x - cx, ball.y - cy);
}

function updateBrickAnomalies() {
    if (!bricks) return;

    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const b = bricks[c][r];
            if (!b.alive) continue;

            if (b.type === "ghost") {
                if (b.ghostCorporealTimer > 0) {
                    b.ghostCorporealTimer--;
                    b.visible = true;
                    b.tangible = true;
                } else {
                    b.ghostPhase += 1 / b.ghostCycleFrames;

                    if (b.ghostPhase >= 1) {
                        b.ghostPhase = 0;
                        b.ghostCorporealTimer = 180;
                    }

                    b.visible = true;
                    b.tangible = false;
                }
            }

            if (b.type === "glitch") {
                b.visible = true;
                b.tangible = true;

                if (b.glitchBurstTimer > 0) {
                    b.glitchBurstTimer--;

                    if (b.glitchBurstTimer === 0 && b.pendingGlitchReroll) {
                        b.glitchSlots = rerollGlitchSlots(b.glitchSlots);
                        b.pendingGlitchReroll = false;
                    }
                } else {
                    b.glitchNextBurst--;
                    if (b.glitchNextBurst <= 0) {
                        b.glitchBurstTimer = 2 + Math.floor(Math.random() * 4);
                        b.glitchNextBurst = 50 + Math.floor(Math.random() * 120);
                        b.pendingGlitchReroll = true;
                    }
                }
            }

            if (b.type === "mover") {
                if (b.moveState === "idle") {
                    b.moveCooldown--;

                    if (b.moveCooldown <= 0) {
                        const neighbors = getAvailableNeighborSlots(b);

                        if (neighbors.length > 0) {
                            const target = neighbors[Math.floor(Math.random() * neighbors.length)];
                            b.moveState = "moving";
                            b.moveProgress = 0;
                            b.moveFromX = b.x;
                            b.moveFromY = b.y;
                            b.moveToX = target.x;
                            b.moveToY = target.y;
                            b.targetSlotCol = target.col;
                            b.targetSlotRow = target.row;
                        } else {
                            b.moveCooldown = 45 + Math.floor(Math.random() * 60);
                        }
                    }
                } else if (b.moveState === "moving") {
                    b.moveProgress += currentLevelDef.id >= 2 ? 0.035 : 0.022;

                    const t = Math.min(1, easeInOut(b.moveProgress));
                    const arc = Math.sin(t * Math.PI) * 6;

                    b.x = lerp(b.moveFromX, b.moveToX, t);
                    b.y = lerp(b.moveFromY, b.moveToY, t) - arc;

                    if (b.moveProgress >= 1) {
                        b.x = b.moveToX;
                        b.y = b.moveToY;
                        b.baseX = b.x;
                        b.baseY = b.y;
                        b.slotCol = b.targetSlotCol;
                        b.slotRow = b.targetSlotRow;
                        b.moveState = "idle";
                        b.moveCooldown = 70 + Math.floor(Math.random() * 160);
                    }
                }
            }

            if (b.type === "teleport") {
                b.visible = true;
                b.tangible = true;

                if (b.teleportCooldown > 0) {
                    b.teleportCooldown--;
                }

                if (b.teleportCharges > 0 && b.teleportCooldown <= 0) {
                    const dist = distanceToBrickCenter(b);

                    if (dist < 85 && willBallThreatenBrick(b, 8)) {
                        const clearedSlots = getClearedLogicalSlots();

                        if (clearedSlots.length > 0) {
                            const target = clearedSlots[Math.floor(Math.random() * clearedSlots.length)];

                            b.x = target.x;
                            b.y = target.y;
                            b.baseX = target.x;
                            b.baseY = target.y;
                            b.slotCol = target.col;
                            b.slotRow = target.row;
                            b.teleportCharges -= 1;
                            b.teleportCooldown = 40;

                            pushLog(`COUNTERMEASURE :: NODE RELOCATED`);
                            showBanner("NODE SHIFT DETECTED");
                        }
                    }
                }
            }
        }
    }
}

function willBallThreatenBrick(brick, lookahead = 10) {
    const futureX = ball.x + ball.dx * lookahead;
    const futureY = ball.y + ball.dy * lookahead;
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;

    const futureDist = Math.hypot(futureX - cx, futureY - cy);
    return futureDist < 50;
}

// ─── Debug level jump ──────────────────────────────────────────────

function jumpToLevel(index) {
    if (!globalThis.DEBUG) return;
    if (index < 0 || index >= levelDefs.length) return;

    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }

    const el = document.getElementById("alert-frame");
    el?.classList.add("hidden");

    runState.levelIndex = index;
    pendingAction = null;
    gameOver = false;

    pushLog(`DEBUG :: JUMP TO LEVEL ${index + 1}`);
    loadLevel(index);
}

// ─── Credential display ────────────────────────────────────────────

function renderCredentialPart(part) {
    return [...part.value]
        .map((ch, i) => {
            if (part.revealed[i]) return ch;
            if (!/[A-Z0-9]/i.test(ch)) return ch;
            return randomMaskChar();
        })
        .join("");
}

function randomMaskChar() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#?%";
    return chars[Math.floor(Math.random() * chars.length)];
}

function fullyRevealCredentialPart(levelIndex) {
    const part = runState.credentialParts[levelIndex];
    part.revealed = part.revealed.map(() => true);
}

// ─── Run flow ──────────────────────────────────────────────────────
let inputLockUntil = 0;
function handleLevelClear() {
    levelState.cleared = true;
    levelState.gameOver = true;
    gameOver = true;

    fullyRevealCredentialPart(runState.levelIndex);
    pushLog(`LEVEL ${runState.levelIndex + 1} CLEARED`);
    showBanner("SECTOR COLLAPSE COMPLETE");

    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }

    if (runState.levelIndex === levelDefs.length - 1) {
        runState.runWon = true;
        pendingAction = "final-complete";

        if (!foxhoundState.completedOnce) {
            inputLockUntil = performance.now() + 1500;
            foxhoundState.completedOnce = true;
            foxhoundState.credentialUnlocked = true;
            saveFoxhoundState(foxhoundState);


            alert(
                `Spoof successful.
            ${getFullCredentialString()}
            foxHound may now access foxClaw.
            Press any key to continue.`,
                false
            );
        } else {
            alert(
                `Credential checksum complete.
            No corruption detected.
            Press any key to continue.`,
                false
            );
        }
        return;
    }

    pendingAction = "next-level";
    alert(`Level cleared. Proceed to ${levelDefs[runState.levelIndex + 1].name}? [Y/N]`, false);
}

function advanceLevel() {
    runState.levelIndex++;
    runState.levelsCleared++;
    loadLevel(runState.levelIndex);
}

function handleLevelFailure() {
    levelState.attemptsLeft--;
    levelState.gameOver = true;
    gameOver = true;

    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }

    if (levelState.attemptsLeft <= 0) {
        runState.runFailed = true;
        pendingAction = "reset-run";
        pushLog(`LEVEL ${runState.levelIndex + 1} FAILED :: SESSION PURGED`);
        alert(deadText, { remove: false });
        return;
    }

    pendingAction = "retry-attempt";
    pushLog(
        `ATTEMPT LOST :: ${levelState.attemptsLeft} ATTEMPT REMAINING ON THIS LEVEL`
    );
    alert(
        `Payload lost. Attempts remaining for this level: ${levelState.attemptsLeft}. Continue current breach? [Y/N]`,
        { remove: false }
    );
}

async function handleFinalContinue(onDone) {
    pendingAction = null;
    stopGame();
    clear();

    await type([
        { kind: "type", text: "Incomming Connection....", finalWait: 1000, },
        { kind: "type", text: "Connection Established.", finalWait: 1000, },
        { kind: "type", text: "CyberVixen > Nice. You've done it. I don't know who you are. Don't want to know. foxOS landing in your hands is all I need.", wait: 20, },
        { kind: "type", text: "CyberVixen > foxHound has spoofed the credentials for foxClaw. You're ready to begin but before that, a couple things you should know.", wait: 20, },
        { kind: "type", text: "CyberVixen > Serenity is more than ready to kill to keep foxOS under wraps. If you're discovered, you'll only have a few minutes to get the hell out of wherever you are.\nWhen that happens, ditch the net, stay away from cities, and do not touch another Serenity Industries terminal again. They will find you.", wait: 20, },
        { kind: "type", text: "CyberVixen > foxOS likely got scrambled during transfer. Sorry. Had to rush.", wait: 20, },
        { kind: "type", text: "CyberVixen > foxHound can help fix corrupted data, but only after you've been able to steal enough data for it to work with", wait: 20, },
        { kind: "type", text: `CyberVixen > Use the 'foxClaw' command for that part. Once in foxClaw mode, all other commands will cease to work except the suite commands and "exit"`, wait: 20, },
        { kind: "type", text: "CyberVixen > Run 'foxclaw.scan(localhost)' to scan your own network node and find connected systems. From there, run 'foxclaw.help'", wait: 20, },
        { kind: "type", text: "CyberVixen > You'll figure it out.", wait: 20, },
        { kind: "type", text: "CyberVixen > Remember. Stay quiet, don't get caught, and don't bite off more than you and foxOS can chew at once. Start slow. You'll be running with the pack soon enough.", wait: 20, },
        { kind: "type", text: "CyberVixen > Good luck", wait: 20, },
        { kind: "type", text: ">", finalWait: 250, },
        { kind: "type", text: ">", finalWait: 250, },
        { kind: "type", text: ">", finalWait: 250, },
        { kind: "type", text: "CyberVixen > You'll need it." },
        { kind: "type", text: "CyberVixen > Ciao~" },
    ]);

    if (onDone) onDone();
}

function resetRun() {
    runState = createRunState();
    pushLog("NEW SPOOF SESSION STARTED");
    loadLevel(0);
}

function handlePendingYes() {
    if (pendingAction === "retry-attempt") {
        continueLevelFromAttemptLoss();
        return;
    }

    if (pendingAction === "reset-run") {
        pendingAction = null;
        resetRun();
        return;
    }

    if (pendingAction === "next-level") {
        pendingAction = null;
        advanceLevel();
    }
}

// ─── Drawing with world scale ──────────────────────────────────────

function beginWorldRender() {
    ctx.save();
    ctx.scale(world.scale, world.scale);
}

function endWorldRender() {
    ctx.restore();
}

function drawStartOverlay() {
    if (!awaitingServe) return;

    const boxW = 560;
    const boxH = 110;
    const x = (world.width - boxW) / 2;
    const y = (world.height - boxH) / 2;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.closePath();

    ctx.fillStyle = fgColor;
    ctx.font = "18px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
        "Use A/D or L/R arrow keys to move paddle.",
        x + boxW / 2,
        y + 38
    );
    ctx.fillText(
        "Press any key to begin.",
        x + boxW / 2,
        y + 72
    );

    ctx.restore();
}

function drawCallout() {
    if (!callout.text || callout.timer <= 0) return;

    const boxW = 420;
    const boxH = 28;
    const x = (world.width - boxW) / 2;
    const y = paddle.y - 55;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.closePath();

    ctx.fillStyle = fgColor;
    ctx.font = "16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(callout.text, x + boxW / 2, y + boxH / 2);

    ctx.restore();
}

function drawPaddle() {
    const x = paddle.x;
    const y = paddle.y;
    const w = paddle.w;
    const h = paddle.h;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.closePath();

    const slatCount = Math.max(3, Math.min(5, Math.floor(w / 18)));
    const inset = 4;
    const gap = 4;
    const slatW = Math.max(6, Math.floor((w - inset * 2 - gap * (slatCount - 1)) / slatCount));
    const slatH = Math.max(2, h - 6);

    for (let i = 0; i < slatCount; i++) {
        const sx = x + inset + i * (slatW + gap);
        const sy = y + (h - slatH) / 2;
        ctx.beginPath();
        ctx.rect(sx, sy, slatW, slatH);
        ctx.stroke();
        ctx.closePath();
    }

    ctx.beginPath();
    ctx.moveTo(x + 2, y + h / 2);
    ctx.lineTo(x + 8, y + h / 2);
    ctx.moveTo(x + w - 8, y + h / 2);
    ctx.lineTo(x + w - 2, y + h / 2);
    ctx.stroke();

    ctx.restore();
}

function drawBall() {
    ctx.save();

    const hasShield = levelState?.attemptsLeft === ATTEMPTS_PER_LEVEL;

    if (hasShield) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = fgColor;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.closePath();
    }

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = fgColor;
    ctx.fill();
    ctx.closePath();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, Math.max(2, ball.r * 0.35), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.closePath();

    ctx.restore();
}

function drawBricks() {
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = fgColor;
    ctx.lineWidth = 1;

    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const b = bricks[c][r];
            if (!b.alive || !b.visible) continue;

            if (b.type === "ghost") {
                drawGhostBrick(b);
            } else if (b.type === "glitch") {
                drawGlitchBrick(b);
            } else if (b.type === "mover") {
                drawMoverBrick(b);
            } else if (b.type === "teleport") {
                drawTeleportBrick(b);
            } else {
                drawNormalBrick(b);
            }
        }
    }
}

function drawBrickBursts() {
    if (!brickBursts.length) return;

    ctx.save();
    ctx.fillStyle = fgColor;
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const p of brickBursts) {
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillText(p.char, p.x, p.y);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawNormalBrick(b) {
    const x = b.x;
    const y = b.y;
    const w = b.w;
    const h = b.h;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.closePath();

    ctx.beginPath();
    ctx.moveTo(x + 6, y + h / 2);
    ctx.lineTo(x + 18, y + h / 2);
    ctx.moveTo(x + w - 18, y + h / 2);
    ctx.lineTo(x + w - 6, y + h / 2);
    ctx.stroke();
    ctx.closePath();

    ctx.beginPath();
    ctx.moveTo(x + Math.floor(w * 0.33), y + 4);
    ctx.lineTo(x + Math.floor(w * 0.33), y + h - 4);
    ctx.stroke();
    ctx.closePath();

    ctx.restore();
}

function drawMoverBrick(b) {
    const x = b.x;
    const y = b.y;
    const w = b.w;
    const h = b.h;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = fgColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.closePath();

    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const phase = Math.floor(performance.now() / 180) % 2;
    const text = phase === 0 ? "<---->" : "<===>";
    ctx.fillText(text, x + w / 2, y + h / 2);

    ctx.restore();
}

function drawTeleportBrick(b) {
    const x = b.x;
    const y = b.y;
    const w = b.w;
    const h = b.h;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = fgColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.closePath();

    ctx.beginPath();
    ctx.rect(x + 4, y + 4, w - 8, h - 8);
    ctx.stroke();
    ctx.closePath();

    const phase = Math.floor(performance.now() / 120 + b.row + b.col) % 3;
    const glyphs = ["<>", "[]", "{}"];

    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyphs[phase], x + w / 2, y + h / 2);

    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + 8, y + 3);
    ctx.moveTo(x + w - 8, y + h - 3);
    ctx.lineTo(x + w - 3, y + h - 3);
    ctx.moveTo(x + w - 3, y + 3);
    ctx.lineTo(x + w - 8, y + 3);
    ctx.moveTo(x + 3, y + h - 3);
    ctx.lineTo(x + 8, y + h - 3);
    ctx.stroke();

    ctx.restore();
}

function drawGlitchBrick(b) {
    const x = b.x;
    const y = b.y;
    const w = b.w;
    const h = b.h;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = fgColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.closePath();

    const scrambled = b.glitchBurstTimer > 0 || Math.floor(performance.now() / 70 + b.row + b.col) % 2 === 0;

    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (!scrambled) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y + h / 2);
        ctx.lineTo(x + 18, y + h / 2);
        ctx.moveTo(x + w - 18, y + h / 2);
        ctx.lineTo(x + w - 6, y + h / 2);
        ctx.moveTo(x + Math.floor(w * 0.33), y + 4);
        ctx.lineTo(x + Math.floor(w * 0.33), y + h - 4);
        ctx.stroke();
        ctx.closePath();
    } else {
        const junk = ["7F", "0x", "##", ":=", "A?", "!!", "E>", "1/"];
        ctx.fillText(junk[(b.row + b.col + Math.floor(performance.now() / 50)) % junk.length], x + w / 2, y + h / 2);
    }

    ctx.restore();
}

function drawGhostBrick(b) {
    const x = b.x;
    const y = b.y;
    const w = b.w;
    const h = b.h;

    ctx.save();
    ctx.strokeStyle = fgColor;
    ctx.fillStyle = fgColor;
    ctx.lineWidth = 1;

    const corporeal = b.ghostCorporealTimer > 0;

    ctx.setLineDash(corporeal ? [] : [4, 3]);
    ctx.lineDashOffset = corporeal ? 0 : -Math.floor(performance.now() / 50);

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
    ctx.closePath();

    ctx.setLineDash([]);

    if (corporeal) {
        ctx.beginPath();
        ctx.moveTo(x + 6, y + h / 2);
        ctx.lineTo(x + w - 6, y + h / 2);
        ctx.stroke();
        ctx.closePath();
    } else {
        const marks = 4;
        for (let i = 0; i < marks; i++) {
            const mx = x + 8 + i * ((w - 16) / (marks - 1));
            ctx.beginPath();
            ctx.moveTo(mx - 2, y + h / 2);
            ctx.lineTo(mx + 2, y + h / 2);
            ctx.stroke();
            ctx.closePath();
        }
    }

    ctx.restore();
}

function makeInitialGlitchSlots() {
    const totalSlots = 5;
    const slots = [];

    for (let i = 0; i < totalSlots; i++) {
        if (Math.random() < 0.35) slots.push(i);
    }

    if (slots.length === 0) {
        slots.push(Math.floor(Math.random() * totalSlots));
    }

    return [...new Set(slots)].sort((a, b) => a - b);
}

function rerollGlitchSlots(currentSlots) {
    const totalSlots = 5;
    const next = new Set(currentSlots);

    const actionRoll = Math.random();

    if (actionRoll < 0.34 && next.size < totalSlots) {
        const candidates = [];
        for (let i = 0; i < totalSlots; i++) {
            if (!next.has(i)) candidates.push(i);
        }
        if (candidates.length) {
            next.add(candidates[Math.floor(Math.random() * candidates.length)]);
        }
    } else if (actionRoll < 0.68 && next.size > 1) {
        const arr = [...next];
        next.delete(arr[Math.floor(Math.random() * arr.length)]);
    } else {
        const arr = [...next];
        if (arr.length) {
            const removeIndex = arr[Math.floor(Math.random() * arr.length)];
            next.delete(removeIndex);
        }

        const candidates = [];
        for (let i = 0; i < totalSlots; i++) {
            if (!next.has(i)) candidates.push(i);
        }
        if (candidates.length) {
            next.add(candidates[Math.floor(Math.random() * candidates.length)]);
        }
    }

    if (next.size === 0) {
        next.add(Math.floor(Math.random() * totalSlots));
    }

    return [...next].sort((a, b) => a - b);
}

function reviveRandomNormalBrick(excludeBrick = null) {
    const candidates = [];

    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const b = bricks[c][r];
            if (b === excludeBrick) continue;
            if (b.alive) continue;
            if (b.special) continue;
            candidates.push(b);
        }
    }

    if (!candidates.length) return false;

    const brick = candidates[Math.floor(Math.random() * candidates.length)];
    brick.alive = true;
    brick.visible = true;
    brick.tangible = true;
    brick.type = "normal";
    brick.special = false;
    brick.x = brick.baseX;
    brick.y = brick.baseY;

    levelState.bricksCleared = Math.max(0, levelState.bricksCleared - 1);
    levelState.score = Math.max(0, levelState.score - 1);
    score = Math.max(0, score - 1);
    runState.totalScore = Math.max(0, runState.totalScore - 1);

    return true;
}

function handleGlitchBrickDestroyed(brick) {
    const rebuilt = reviveRandomNormalBrick(brick);

    if (rebuilt) {
        pushLog("CORRUPTED NODE :: SEGMENT REBUILT");
        showBanner("CORRUPTED NODE :: SEGMENT REBUILT");
    } else {
        pushLog("CORRUPTED NODE :: NO SEGMENT AVAILABLE");
        showBanner("CORRUPTED NODE");
    }
}



// ─── Updates in world space ────────────────────────────────────────

function updatePaddle() {
    paddle.prevX = paddle.x;

    if (paddle.right) {
        paddle.x = Math.min(paddle.x + paddle.speed, world.right - paddle.w);
    } else if (paddle.left) {
        paddle.x = Math.max(paddle.x - paddle.speed, world.left);
    }

    paddle.vx = paddle.x - paddle.prevX;
}

function updateBall() {
    if (awaitingServe) {
        ball.x = paddle.x + paddle.w / 2;
        ball.y = paddle.y - ball.r - 2;
        return;
    }
    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x + ball.r >= world.right) {
        ball.x = world.right - ball.r;
        ball.dx = -Math.abs(ball.dx);
    } else if (ball.x - ball.r <= world.left) {
        ball.x = world.left + ball.r;
        ball.dx = Math.abs(ball.dx);
    }

    if (ball.y - ball.r <= world.top) {
        ball.y = world.top + ball.r;
        ball.dy = Math.abs(ball.dy);
    }

    const hitPaddle =
        ball.dy > 0 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x + ball.r >= paddle.x &&
        ball.x - ball.r <= paddle.x + paddle.w;

    if (hitPaddle) {
        bounceOffPaddle();
    }

    if (ball.y - ball.r > world.bottom) {
        handleLevelFailure();
    }
}

function spawnBrickBurst(brick) {
    const chars = ["#", "%", "/", "=", "+", ":", ";", "x", "0", "1"];
    const count = 8 + Math.floor(Math.random() * 6);

    for (let i = 0; i < count; i++) {
        brickBursts.push({
            x: brick.x + brick.w / 2 + (Math.random() * 12 - 6),
            y: brick.y + brick.h / 2 + (Math.random() * 8 - 4),
            vx: (Math.random() * 2.4 - 1.2),
            vy: (Math.random() * -1.8) - 0.2,
            life: 20 + Math.floor(Math.random() * 12),
            maxLife: 32,
            char: chars[Math.floor(Math.random() * chars.length)],
        });
    }
}

function updateBricks() {
    for (let c = 0; c < currentLevelDef.cols; c++) {
        for (let r = 0; r < currentLevelDef.rows; r++) {
            const b = bricks[c][r];
            if (!b.alive || !b.tangible) continue;

            const overlapX = Math.min(ball.x + ball.r, b.x + b.w) - Math.max(ball.x - ball.r, b.x);
            const overlapY = Math.min(ball.y + ball.r, b.y + b.h) - Math.max(ball.y - ball.r, b.y);
            if (overlapX <= 0 || overlapY <= 0) continue;

            b.alive = false;
            spawnBrickBurst(b);

            if (overlapX < overlapY) {
                ball.dx = ball.x < b.x + b.w / 2 ? -Math.abs(ball.dx) : Math.abs(ball.dx);
            } else {
                ball.dy = ball.y < b.y + b.h / 2 ? -Math.abs(ball.dy) : Math.abs(ball.dy);
            }

            score++;
            levelState.score++;
            levelState.bricksCleared++;
            runState.totalScore++;

            updateSpeedTierFromClassicRules(b.row);

            if (b.type === "glitch") {
                handleGlitchBrickDestroyed(b);
            }

            updateAnomalyProgression();
            updateCredentialRevealProgress();

            pushLog(`SECTOR BREACHED ${levelState.bricksCleared}/${levelState.totalBricks}`);
            renderHud();

            if (levelState.bricksCleared >= levelState.totalBricks) {
                handleLevelClear();
                return;
            }

            return;
        }
    }
}

function updateBrickBursts() {
    for (let i = brickBursts.length - 1; i >= 0; i--) {
        const p = brickBursts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03;
        p.life--;

        if (p.life <= 0) {
            brickBursts.splice(i, 1);
        }
    }
}


function updateAnomalyProgression() {
    const ratio = getLevelClearRatio();
    const plan = currentLevelDef.anomalyPlan || [];

    for (let i = 0; i < plan.length; i++) {
        const wave = plan[i];
        if (levelState.anomalyWavesTriggered.has(i)) continue;

        if (ratio >= wave.threshold) {
            activateAnomalyWave(wave.activate);
            levelState.anomalyWavesTriggered.add(i);
            pushLog(`COUNTERMEASURE SURGE :: ${Math.round(wave.threshold * 100)}%`);
            showBanner("COUNTERMEASURE SYSTEMS EVOLVING");
        }
    }
}

function activateAnomalyWave(requested) {
    for (const [type, count] of Object.entries(requested)) {
        let candidates = [];

        for (let c = 0; c < currentLevelDef.cols; c++) {
            for (let r = 0; r < currentLevelDef.rows; r++) {
                const b = bricks[c][r];
                if (!b.alive) continue;
                if (b.type !== "normal") continue;
                candidates.push(b);
            }
        }

        shuffleInPlace(candidates);

        for (let i = 0; i < Math.min(count, candidates.length); i++) {
            convertBrickToType(candidates[i], type);
        }
    }
}

function convertBrickToType(brick, type) {
    brick.type = type;
    brick.special = true;

    if (type === "ghost") {
        brick.ghostPhase = Math.random();
        brick.ghostCorporealTimer = 0;
        brick.ghostCycleFrames = 220 + Math.floor(Math.random() * 100);
    }

    if (type === "glitch") {
        brick.glitchBurstTimer = 0;
        brick.glitchNextBurst = 60 + Math.floor(Math.random() * 140);
        brick.glitchSlots = makeInitialGlitchSlots();
        brick.pendingGlitchReroll = false;
    }

    if (type === "mover") {
        brick.moveState = "idle";
        brick.moveCooldown = 70 + Math.floor(Math.random() * 120);
        brick.moveProgress = 0;
        brick.moveFromX = brick.x;
        brick.moveFromY = brick.y;
        brick.moveToX = brick.x;
        brick.moveToY = brick.y;
    }

    if (type === "teleport") {
        brick.teleportCharges = 2;
        brick.teleportCooldown = 0;
        brick.teleportArmed = true;
    }
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ─── Main loop ─────────────────────────────────────────────────────

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!levelState?.gameOver) {
        updatePaddle();
        updateBall();
        updateBrickAnomalies();
        updateBricks();
        updateBrickBursts();

        beginWorldRender();
        drawBricks();
        drawBrickBursts();
        drawPaddle();
        drawBall();
        drawCallout();
        drawStartOverlay();
        endWorldRender();

        renderHud();

        if (callout.timer > 0) callout.timer--;
        frameId = requestAnimationFrame(loop);
    } else {
        frameId = null;
    }
}