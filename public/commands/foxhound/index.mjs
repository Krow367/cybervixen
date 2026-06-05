import { clear } from "../../screen.js";
import { type, alert } from "../../io.js";
import { registerGame, abortGame } from "../../games.js";
import { callDebugger, field, getter, setter, toggleDebugPanel, destroyDebugPanel } from "../../hackz/debugger.js";

let loaded = false;
let controller;
let debug;

// canvas + drawing
let canvas;
let ctx;
let fgColor;
let frameId = null;

// game state objects
let ball;
let paddle;
let bricks;
let score;
let gameOver = false;
let deadText = "You failed to spoof the needed credentials with foxHound. Data corrupted. All progress loss. Restart foxHound? [Y/N]";

// brick layout config
const brickW = 75;
const brickH = 20;
const brickPad = 10;
const brickOffsetTop = 30;
const brickOffsetLeft = 30;
const brickRows = 5;
const brickCols = 8;

// for later: bricks, credential, etc.
// let destroyedCount = 0;
// let visibleCred;
// let specialCount = 3;
// let metaData = [];

const defaultSettings = {
    ball: {
        speed: 4,
        maxSpeed: 14,
        dx: null,
        dy: null,
    },
    paddle: {
        w: 75,
        speed: 7,
    },
};

async function ensureAssets() {
    if (loaded) return;
    loaded = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./commands/foxhound/foxhound.css";
    document.head.appendChild(link);

    const html = await fetch("./commands/foxhound/foxhound.html").then(r => r.text());
    document.body.insertAdjacentHTML("beforeend", html);
}

function getPhosphor() {
    return getComputedStyle(document.documentElement)
        .getPropertyValue("--phosphor")
        .trim();
}

function ensureFoxhoundLevel() {
    if (localStorage.getItem("foxhoundlvl") === null) {
        localStorage.setItem("foxhoundlvl", "0");
    }
}

export default async function () {
    await ensureAssets();
    ensureFoxhoundLevel();

    const foxHoundLvl = Number(localStorage.getItem("foxhoundlvl") ?? "0");
    const helpRepaired = localStorage.getItem("helpRepaired") === "true";

    // Can't let the player continue if they haven't repaired help yet.
    if (!helpRepaired) {
        await type("Unknown command.");
        return;
    }

    clear();

    await new Promise(resolve => {
        setTimeout(() => init(resolve), 50);
    });
}

//—————Nuke it all──────────────────────────────────

function stopGame(onDone) {
    const wrap = document.getElementById("foxhound-wrap")
    abortGame("foxhound");       // abort listeners
    destroyDebugPanel(); // kill active debugger
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

// ─── Game init ─────────────────────────────────────────────────────

export function init(onDone = () => { }) {

    controller = new AbortController();
    registerGame("foxhound", controller);
    const { signal } = controller;
    const wrap = document.getElementById("foxhound-wrap");
    wrap.style.display = "";

    canvas = document.getElementById("foxhound-breakout");
    ctx = canvas.getContext("2d");
    fgColor = getPhosphor();

    // canvas setup

    canvas.width = 730;
    canvas.height = 480;



    // controls: Escape, left/right, A/D
    document.addEventListener("keydown", (e) => {
        const el = document.getElementById("alert-frame");
        if (e.key === "Escape") {
            el.classList.add("hidden"); //rage quit check
            stopGame(onDone);
            clear();
        } else if (globalThis.DEBUG && e.code === "KeyR") {
            el.classList.add("hidden");
            resetState();
        } else if ((e.key === "ArrowLeft" || e.code === "KeyA") && !gameOver) {
            paddle.left = true;
        } else if ((e.key === "ArrowRight" || e.code === "KeyD") && !gameOver) {
            paddle.right = true;
        } else if (globalThis.DEBUG && e.code === "KeyP") {
            toggleDebugPanel();
        } else if (gameOver === true) {
            if (e.code === "KeyY") {
                el.classList.add("hidden");
                resetState();  // resetState sets gameOver = false and restarts loop
            } else if (e.code === "KeyN") {
                el.classList.add("hidden");
                clear();
                stopGame(onDone);
            }
        } else {
            return;
        }
    }, { signal });

    document.addEventListener("keyup", (e) => {
        if (e.key === "ArrowLeft" || e.code === "KeyA") {
            paddle.left = false;
        } else if (e.key === "ArrowRight" || e.code === "KeyD") {
            paddle.right = false;
        }
    }, { signal });

    try {
        resizeCanvas();
        resetState();
    } catch (e) {
        console.error("foxhound init error", e);
    }


    debug = callDebugger({
        title: "foxHound",
        target: () => ({ defaultSettings, ball, paddle, bricks, score, gameOver }),
        fields: [
            setter(
                "ball.speed",
                () => defaultSettings.ball.speed,
                value => {
                    const n = Number(value);
                    if (!Number.isFinite(n) || n < 0) return;

                    defaultSettings.ball.speed = n;

                    if (ball) {
                        ball.speed = n;
                        const len = Math.hypot(ball.dx, ball.dy) || 1;
                        ball.dx = (ball.dx / len) * n;
                        ball.dy = (ball.dy / len) * n;
                    }
                }
            ),
            field("defaultSettings.ball.maxSpeed", { label: "ball.maxspeed" }),
            field("defaultSettings.paddle.w", { label: "paddle.w" }),
            field("defaultSettings.paddle.speed", { label: "paddle.speed" }),
            getter("score", () => score),
            getter("gameOver", () => gameOver),
        ],
    });
}

// ─── Game state reset ──────────────────────────────────────────────

function resizeCanvas() {
    const width = Math.floor(window.innerWidth * 0.6);
    const height = Math.floor(window.innerHeight * 0.8);

    console.log("scale")
    const element = document.getElementById('foxhound-breakout');
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
}

function resetState() {
    if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
    }
    console.log("resetState: speed", ball?.speed, "gameOver", gameOver);
    gameOver = false;
    score = 0;

    ball = {
        x: canvas.width / 2,
        y: canvas.height - 40,
        dx: 0,
        dy: 0,
        r: 6,
        speed: defaultSettings.ball.speed,
        maxSpeed: defaultSettings.ball.maxSpeed,
    };

    const spread = Math.PI / 2;
    const baseAngle = -Math.PI / 2;
    const angleOffset = (Math.random() * spread) - spread / 2;
    const angle = baseAngle + angleOffset;

    ball.dx = defaultSettings.ball.dx ?? (Math.cos(angle) * ball.speed);
    ball.dy = defaultSettings.ball.dy ?? (Math.sin(angle) * ball.speed);

    paddle = {
        x: (canvas.width - defaultSettings.paddle.w) / 2,
        y: canvas.height - 20,
        w: defaultSettings.paddle.w,
        h: 10,
        speed: defaultSettings.paddle.speed,
        left: false,
        right: false,
        vx: 0,
        prevX: 0,
    };

    bricks = [];
    for (let c = 0; c < brickCols; c++) {
        bricks[c] = [];
        for (let r = 0; r < brickRows; r++) {
            const brickX = c * (brickW + brickPad) + brickOffsetLeft;
            const brickY = r * (brickH + brickPad) + brickOffsetTop;
            bricks[c][r] = {
                x: brickX,
                y: brickY,
                alive: true,
                special: false,
            };
        }
    }

    loop();
}
// ─── Drawing helpers ───────────────────────────────────────────────

function drawPaddle() {
    ctx.beginPath();
    ctx.rect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.fillStyle = fgColor;
    ctx.fill();
    ctx.closePath();
}

function drawBall() {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = fgColor;
    ctx.fill();
    ctx.closePath();
}

function drawBricks() {
    ctx.fillStyle = fgColor;
    ctx.strokeStyle = fgColor;

    for (let c = 0; c < brickCols; c++) {
        for (let r = 0; r < brickRows; r++) {
            const b = bricks[c][r];
            if (!b.alive) continue;

            ctx.beginPath();
            ctx.rect(b.x, b.y, brickW, brickH);
            ctx.fill();
            ctx.closePath();
        }
    }
}

// ─── Update helpers ────────────────────────────────────────────────

function updatePaddle() {
    paddle.prevX = paddle.x
    if (paddle.right) {
        paddle.x = Math.min(paddle.x + paddle.speed, canvas.width - paddle.w);
    } else if (paddle.left) {
        paddle.x = Math.max(paddle.x - paddle.speed, 0);
    }
    paddle.vx = paddle.x - paddle.prevX
}

function updateBall() {
    ball.x += ball.dx;
    ball.y += ball.dy;

    // walls
    if (ball.x + ball.r > canvas.width || ball.x - ball.r < 0) {
        ball.dx = -ball.dx;
    }
    if (ball.y - ball.r < 0) {
        ball.dy = -ball.dy;
    }

    // bottom: paddle and reset
    if (ball.y + ball.r > paddle.y && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
        ballYeeter(1.05);
    }

    function ballYeeter(multiplier) {
        // 1. Where did the ball hit, relative to paddle center?
        const hit = ball.x - (paddle.x + paddle.w / 2);
        const norm = hit / (paddle.w / 2);   // -1 (left) .. 0 (center) .. 1 (right)

        // 2. Horizontal from norm, vertical up
        let dirX = norm;    // more to the side → more horizontal
        let dirY = -1;      // always up

        // 3. Add some paddle motion influence
        dirX += paddle.vx * 0.2;

        // 4. Normalize direction
        const len = Math.hypot(dirX, dirY) || 1;
        dirX /= len;
        dirY /= len;

        // 5. Compute current speed and boost it a bit
        const speed0 = Math.hypot(ball.dx, ball.dy) || 1;
        let speed = speed0 * multiplier;

        if (ball.maxSpeed) {
            speed = Math.min(speed, ball.maxSpeed);
        }

        // YEET
        ball.dx = dirX * speed;
        ball.dy = dirY * speed;
    }

    //———————————————GAME OVER NERD—————————————————————————————————————————————


    if (ball.y + ball.r > canvas.height) {
        gameOver = true;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        alert(deadText);
        if (frameId !== null) {
            cancelAnimationFrame(frameId);
            frameId = null;
        }
    }
}


function updateBricks() {
    for (let c = 0; c < brickCols; c++) {
        for (let r = 0; r < brickRows; r++) {
            const b = bricks[c][r];
            if (!b.alive) continue;
            if (ball.x + ball.r > b.x && ball.x + ball.r < b.x + brickW && ball.y > b.y && ball.y < b.y + brickH) {
                b.alive = false;
                ball.dy = -ball.dy
                score++;
                if (score === brickCols * brickRows) {
                    //win condition. Clean up. Trigger the reward. Exit game.
                }
            }
        }
    }
}

// ─── Main loop ─────────────────────────────────────────────────────

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameOver) {
        drawBricks();
        drawPaddle();
        drawBall();

        updatePaddle();
        updateBall();
        updateBricks();

        frameId = requestAnimationFrame(loop);
    } else {
        frameId = null;
    }
}

















