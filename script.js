// ==========================================
// 1. グローバル変数定義
// ==========================================
const BUFFER_SIZE = 20;
const motionBuffer = [];
let isPlaying = false;
let panner, synth, loop; // 音響関連
let pannerAngle = 0;     // 回転角度
let smoothedShake = 0;   // 平滑化された揺れ値

// ==========================================
// 2. 数学計算 (標準偏差)
// ==========================================
function getStandardDeviation(array) {
    const n = array.length;
    if (n === 0) return 0;
    const mean = array.reduce((a, b) => a + b) / n;
    const variance = array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n;
    return Math.sqrt(variance);
}

// ==========================================
// 3. センサーハンドラ (ご提示のコード)
// ==========================================
function handleMotion(event) {
    // accelerationIncludingGravity を使用
    const g = event.accelerationIncludingGravity;
    if (!g) return;

    // x, y, z の合成ベクトル（重力含む）
    const mag = Math.sqrt((g.x || 0) ** 2 + (g.y || 0) ** 2 + (g.z || 0) ** 2);
    
    motionBuffer.push(mag);
    if (motionBuffer.length > BUFFER_SIZE) motionBuffer.shift();
}

// ==========================================
// 4. 音響セットアップ
// ==========================================
function setupAudio() {
    // 聴き手（リスナー）の作成
    const listener = new Tone.Listener();
    
    // 音源（3Dパンナー）の作成
    panner = new Tone.Panner3D({
        positionX: 0,
        positionY: 0,
        positionZ: -1, // 正面
        panningModel: "HRTF"
    }).toDestination();

    // シンセサイザー作成 (Pannerに接続)
    synth = new Tone.MembraneSynth().connect(panner);
}

function startLoop() {
    // ループ再生の定義
    loop = new Tone.Loop(time => {
        synth.triggerAttackRelease("C2", "8n", time);
    }, "4n");
    
    Tone.Transport.start();
    loop.start(0);
}

// ==========================================
// 5. メインループ (毎フレーム更新)
// ==========================================
function update() {
    requestAnimationFrame(update);
    if (!isPlaying) return;

    // 現在の標準偏差（揺れの激しさ）を計算
    const currentShake = getStandardDeviation(motionBuffer);

    // スムージング処理
    smoothedShake += (currentShake - smoothedShake) * 0.1;

    // --- デバッグ表示更新 ---
    const display = document.getElementById('val-display');
    if(display) display.innerText = smoothedShake.toFixed(3);
    // ----------------------

    // 閾値設定 (調整してください)
    // 重力加速度込みの場合、静止時でもノイズで多少値が出るので
    // 少し高めに設定するか、変動分(標準偏差)を見るこのロジックなら
    // 0.5 ~ 1.0 くらいが目安になります。
    const WALK_THRESHOLD = 0.5; 

    if (smoothedShake > WALK_THRESHOLD) {
        // 歩行中：回転させる
        pannerAngle += 0.05 + (smoothedShake * 0.02);
        
        const radius = 2; 
        const x = Math.sin(pannerAngle) * radius;
        const z = Math.cos(pannerAngle) * radius;
        
        if(panner) {
            panner.positionX.rampTo(x, 0.1);
            panner.positionZ.rampTo(z, 0.1);
        }
    } else {
        // 静止中：正面に戻す
        if(panner) {
            panner.positionX.rampTo(0, 0.5);
            panner.positionZ.rampTo(-1, 0.5);
        }
    }
}

// ==========================================
// 6. 初期化とイベントリスナ (ご提示のコードベース)
// ==========================================
document.getElementById('playBtn').addEventListener('click', async () => {
    
    // iOS 13+ の許可リクエスト処理
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== 'granted') {
                alert("センサー許可が必要です");
                return;
            }
        } catch (e) {
            console.error(e);
            alert("権限リクエストでエラーが発生しました");
            return;
        }
    }

    // センサーイベント登録
    window.addEventListener('devicemotion', handleMotion);
    
    // Tone.jsの開始
    await Tone.start();
    
    setupAudio(); // 音源準備
    startLoop();  // 再生開始
    
    isPlaying = true;
    
    // ボタンを消してステータス更新
    document.getElementById('playBtn').style.display = 'none';
    document.getElementById('status').innerText = "動作中(歩いてみてください)";
    
    update(); // アニメーションループ開始
});