// ==========================================
// 1. 設定と変数の初期化
// ==========================================
const BUFFER_SIZE = 20; // 過去20フレーム分(約0.3秒)のデータを保持
const motionBuffer = []; // 加速度の大きさを溜める配列
let isPlaying = false;

// インタラクション用変数
let currentShake = 0; // 現在の揺れ（標準偏差）
let pannerAngle = 0;  // 音が回る角度
let smoothedShake = 0; // 滑らかにした揺れの値

// Tone.jsの準備
// ユーザー（聴き手）は原点(0,0,0)に固定
const listener = new Tone.Listener(); 
// 音源（3Dパンナー）
const panner = new Tone.Panner3D({
    positionX: 0,
    positionY: 0,
    positionZ: -1, // 最初は正面
    panningModel: "HRTF" // ヘッドホンで立体的聞こえる設定
}).toDestination();

// 音源（シンプルなループ）
// ここはMembraneSynthや既存のコードに合わせてください
const synth = new Tone.MembraneSynth().connect(panner);
const loop = new Tone.Loop(time => {
    synth.triggerAttackRelease("C2", "8n", time);
}, "4n");


// ==========================================
// 2. 標準偏差の計算ロジック (ここが核心)
// ==========================================
function getStandardDeviation(array) {
    const n = array.length;
    if (n === 0) return 0;

    // 平均値の計算
    const mean = array.reduce((a, b) => a + b) / n;

    // 分散（平均との差の2乗の平均）の計算
    const variance = array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n;

    // 標準偏差（分散の平方根）
    return Math.sqrt(variance);
}


// ==========================================
// 3. センサー入力処理
// ==========================================
function handleMotion(event) {
    const g = event.accelerationIncludingGravity;
    if (!g) return;

    // 重力込みのベクトルの長さ（静止時は約9.8）
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

    // バッファから標準偏差（揺れの大きさ）を計算
    currentShake = getStandardDeviation(motionBuffer);

    // 【重要】スムージング処理
    // 急に値が変わると音が飛ぶので、少しずつ目標値に近づける
    // 0.1 は追従速度（小さいほど滑らかだが遅れる）
    smoothedShake += (currentShake - smoothedShake) * 0.1;

    // === 音の制御ロジック (Trigger -> Reaction) ===
    
    // 閾値設定（0.5以上なら「歩いている」とみなすなど調整してください）
    const WALK_THRESHOLD = 0.5;

    if (smoothedShake > WALK_THRESHOLD) {
        // 歩いている時：音が頭の周りを回る
        // 揺れが大きいほど回転速度が上がる（係数0.1は調整可）
        pannerAngle += 0.05 + (smoothedShake * 0.02);
        
        // 座標計算 (半径2メートルで回転)
        const radius = 2;
        const x = Math.sin(pannerAngle) * radius;
        const z = Math.cos(pannerAngle) * radius;
        
        // Pannerに適用
        panner.positionX.rampTo(x, 0.1);
        panner.positionZ.rampTo(z, 0.1);
        
    } else {
        // 止まっている時：音は正面に戻る
        panner.positionX.rampTo(0, 0.5); // 0.5秒かけてゆっくり戻る
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
    
    // センサー許可リクエスト
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') {
            alert("センサー許可が必要です");
            return;
        }
    }
    
    window.addEventListener('devicemotion', handleMotion);
    isPlaying = true;
    update(); // アニメーションループ開始
}

document.getElementById('playBtn').addEventListener('click', () => {
    startAudioSystem();
    document.getElementById('playBtn').style.display = 'none';
});