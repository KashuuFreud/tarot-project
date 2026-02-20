const container = document.getElementById("cardContainer");

const totalCards = 22;
const radius = 500;

let angleOffset = 0;
let targetOffset = 0;

let isDrawing = false;
let cooldown = false;

const cards = [];
let drawnCards = [];

// 创建完整整圆
for (let i = 0; i < totalCards; i++) {
    const card = document.createElement("div");
    card.classList.add("card");

    const img = document.createElement("img");
    img.src = "images/back.png";

    card.appendChild(img);
    container.appendChild(card);
    cards.push(card);
}

// 整圆分布计算
function updatePositions() {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight + 200; // 圆心在屏幕下方
    const angleStep = 360 / totalCards;

    cards.forEach((card, i) => {
        const angleDeg = i * angleStep + angleOffset;
        const rad = angleDeg * Math.PI / 180;

        const x = centerX + radius * Math.sin(rad);
        const y = centerY - radius * Math.cos(rad);

        card.style.left = `${x - 60}px`;
        card.style.top = `${y - 200}px`;
        card.style.transform = `rotate(${angleDeg}deg)`;
    });
}

updatePositions();

// 平滑旋转动画 (核心：利用插值实现物理感)
function animate() {
    if (!isDrawing) {
        // 0.12 是平滑系数，数值越小越有惯性
        angleOffset += (targetOffset - angleOffset) * 0.12;
        updatePositions();
    }
    requestAnimationFrame(animate);
}

animate();

// 背景遮罩
const overlay = document.createElement("div");
overlay.className = "dark-overlay";
document.body.appendChild(overlay);

// 洗牌动画 (优化：大幅度平滑拨动)
function shuffleWheel() {
    // 增加 1800 度（5圈），让 animate 自动平滑滚动
    targetOffset += 1800;
}

// 停止动画 (新增：瞬间同步偏移量)
function stopWheel() {
    targetOffset = angleOffset;
}

// 随机三张逻辑
function generateReading() {
    const deck = [...Array(22).keys()];
    deck.sort(() => Math.random() - 0.5);

    return deck.slice(0, 3).map(index => ({
        index,
        reversed: Math.random() > 0.5
    }));
}

// 抽牌动画 (飞入仪式)
function drawThreeCards() {
    if (isDrawing) return;

    isDrawing = true;
    overlay.classList.add("active");

    const reading = generateReading();

    reading.forEach((cardData, i) => {
        const card = document.createElement("div");
        card.className = "draw-card";

        const img = document.createElement("img");
        img.src = `images/${cardData.index}.png`;

        card.appendChild(img);
        document.body.appendChild(card);

        card.style.left = "50%";
        card.style.top = "50%";

        setTimeout(() => {
            card.style.opacity = "1";
            card.style.transform =
                `translate(-50%, -50%) translateX(${(i - 1) * 260}px)` +
                (cardData.reversed ? " rotate(180deg)" : "") +
                " scale(1)";

            setTimeout(() => card.classList.add("glow"), 800);
        }, 200);

        drawnCards.push(card);
    });
}

// 重置系统
function resetSystem() {
    drawnCards.forEach(card => card.remove());
    drawnCards = [];
    overlay.classList.remove("active");
    isDrawing = false;
}

// MediaPipe 手势检测核心
const videoElement = document.getElementById("inputVideo");

const hands = new Hands({
    locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start();

let lastHandX = null;
let smoothedX = null;
let pinchStart = null;
let fistStart = null;

function onResults(results) {
    const numHands = results.multiHandLandmarks.length;

    if (numHands === 0) {
        lastHandX = null;
        pinchStart = null;
        fistStart = null;
        return;
    }

    // --- 双手手势判定 (停止或重置) ---
    if (numHands === 2) {
        const h1 = results.multiHandLandmarks[0][9]; // 第一只手掌心
        const h2 = results.multiHandLandmarks[1][9]; // 第二只手掌心
        
        // 计算两手掌心距离
        const dist = Math.sqrt(Math.pow(h1.x - h2.x, 2) + Math.pow(h1.y - h2.y, 2));

        // 1. 双手合十 (距离很近) -> 停止转动
        if (dist < 0.12 && !isDrawing) {
            stopWheel();
        }

        // 2. 双手大范围张开 -> 重置系统 (原逻辑保持)
        if (dist > 0.4 && isDrawing) {
            resetSystem();
        }
        return; // 双手模式下不触发单手逻辑
    }

    // --- 单手手势判定 ---
    const landmarks = results.multiHandLandmarks[0];

    // 1. 左右滑动控制 (基于掌心 X 坐标)
    const rawX = landmarks[9].x;
    if (smoothedX === null) smoothedX = rawX;
    smoothedX = smoothedX * 0.8 + rawX * 0.2;

    if (!isDrawing && lastHandX !== null) {
        const delta = smoothedX - lastHandX;
        if (Math.abs(delta) > 0.003) {
            targetOffset += delta * 600;
        }
    }
    lastHandX = smoothedX;

    if (cooldown) return;

    // 2. 握拳判定 (洗牌)
    const palmY = landmarks[9].y;
    const fingers = [8, 12, 16, 20];
    const isFist = fingers.every(i => landmarks[i].y > palmY);

    if (isFist && !isDrawing) {
        if (!fistStart) fistStart = Date.now();
        if (Date.now() - fistStart > 400) {
            shuffleWheel();
            cooldown = true;
            setTimeout(() => cooldown = false, 1500);
            fistStart = null;
        }
    } else {
        fistStart = null;
    }

    // 3. 捏合判定 (抽牌)
    const dx = landmarks[4].x - landmarks[8].x;
    const dy = landmarks[4].y - landmarks[8].y;
    const pinchDistance = Math.sqrt(dx * dx + dy * dy);

    if (pinchDistance < 0.06) {
        if (!pinchStart) pinchStart = Date.now();
        if (Date.now() - pinchStart > 600) {
            cooldown = true;
            drawThreeCards();
            setTimeout(() => cooldown = false, 2000);
        }
    } else {
        pinchStart = null;
    }
}