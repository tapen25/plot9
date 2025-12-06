// ==========================================
// 1. 設定と変数の初期化
// ==========================================
const BUFFER_SIZE = 20; 
const motionBuffer = []; 
let isPlaying = false;

let currentShake = 0; 
let pannerAngle = 0;  
let smoothedShake = 0; 

// HTMLの表示要素（デバッグ用）
const shakeDisplay = document.getElementById('shakeValue');

// Tone.js オブジェクト
const listener = new Tone.Listener(); 
const panner = new Tone.Panner3D({
    positionX: 0,
    positionY: 0,
    positionZ: -1, 
    panningModel: "HRTF" 
}).toDestination();

// 音源（シンプルなキックとハイハット風）
// ※音がシンプルすぎると感じる場合はここを調整
const membrane = new Tone.MembraneSynth().connect(panner);
const metal = new Tone.MetalSynth({
    frequency: 200,
    envelope: {
        attack: 0.001,
        decay: 0.1,
        release: 0.01
    },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5
}).connect(panner);
metal.volume.value = -10; // 音量調整

// ループ作成 (4分音符ごとのキック、裏拍のハイハット)
const loop = new Tone.Loop(time => {
    membrane.triggerAttackRelease("C2", "8n", time);
    // 裏拍で金属音
    metal.triggerAttackRelease("32n", time + Tone.Time("8n").toSeconds());
}, "4n");


// ==========================================
// 2. 標準偏差の計算ロジック
// ==========================================
function getStandardDeviation(array) {
    const n = array.length;
    if (n === 0) return 0;
    const mean = array.reduce((a, b) => a + b) / n;
    const variance = array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n;
    return Math.sqrt(variance);
}


// ==========================================
// 3. センサー入力処理
// ==========================================
function handleMotion(event) {
    const g = event.accelerationIncludingGravity;
    if (!g) return;

    // x, y, z の合成ベクトル（重力含む）
    const mag = Math.sqrt((g.x || 0) ** 2 + (g.y || 0) ** 2 + (g.z || 0) ** 2);
    
    motionBuffer.push(mag);
    if (motionBuffer.length > BUFFER_SIZE) motionBuffer.shift();
}


// ==========================================
// 4. メインループ (毎フレーム実行)
// ==========================================
function update() {
    requestAnimationFrame(update);
    if (!isPlaying) return;

    // 揺れの計算
    currentShake = getStandardDeviation(motionBuffer);

    // スムージング（値を滑らかにする）
    smoothedShake += (currentShake - smoothedShake) * 0.1;
    
    // 画面に数値を表示（スマホでの確認用）
    if(shakeDisplay) shakeDisplay.innerText = smoothedShake.toFixed(2);

    // === 音の制御ロジック ===
    // 閾値：これを調整して「歩いた時だけ回る」ようにする
    const WALK_THRESHOLD = 0.8; 

    if (smoothedShake > WALK_THRESHOLD) {
        // 歩行中：回転させる
        // 揺れが強いほど速く回る
        pannerAngle += 0.05 + (smoothedShake * 0.01);
        
        const radius = 2; // 半径
        const x = Math.sin(pannerAngle) * radius;
        const z = Math.cos(pannerAngle) * radius;
        
        panner.positionX.rampTo(x, 0.1);
        panner.positionZ.rampTo(z, 0.1);
        
    } else {
        // 静止中：正面に戻す
        panner.positionX.rampTo(0, 0.5);
        panner.positionZ.rampTo(-1, 0.5);
    }
}


// ==========================================
// 5. 開始処理
// ==========================================
async function startAudioSystem() {
    await Tone.start();
    Tone.Transport.start();
    loop.start(0);
    
    // iOS 13+ などでのセンサー許可リクエスト
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') {
                alert("センサーの利用が許可されませんでした。");
                return;
            }
        } catch (e) {
            console.error(e);
        }
    }
    
    window.addEventListener('devicemotion', handleMotion);
    isPlaying = true;
    update();
}

document.getElementById('playBtn').addEventListener('click', () => {
    startAudioSystem();
    document.getElementById('playBtn').innerText = "Running...";
});