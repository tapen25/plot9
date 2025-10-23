// main.js（改良版）
// DOM取得
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const cadenceDiv = document.getElementById('cadence');
const musicStatusDiv = document.getElementById('musicStatus');

// 定数（調整点）
const PEAK_THRESHOLD = 1.6;   // 少し厳しめに（歩のピーク判定）
const STEP_INTERVAL_MS = 450; // チャタリング防止（短めor長めに調整可）
const HISTORY_SECONDS = 4;    // 過去何秒分のステップでcadenceを算出するか（長めにすると安定）
const MIN_STEPS_FOR_CADENCE = 3; // ケイデンス算出に必要な最小ステップ数

// ヒステリシス付きの閾値（enter / exit）
const THRESH = {
  STILL:  { enter: 30,  exit: 25 },
  WALK:   { enter: 60,  exit: 55 },
  BRISK:  { enter: 110, exit: 100 }, // 「早歩き」(brisk) をより厳しく
  RUN:    { enter: 140, exit: 135 }   // 速歩/走りはさらに高く
};

// 状態変数
let lastPeakTime = 0;
let stepHistory = [];
let currentState = '静止';

// Chart.js 初期設定（index.html に canvas がある前提）
let accData = [];
let timeLabels = [];
const MAX_POINTS = 100;

const ctx = document.getElementById('accChart').getContext('2d');
const accChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: timeLabels,
    datasets: [
      {
        label: '加速度の大きさ (m/s²)',
        data: accData,
        borderColor: '#007bff',
        fill: false,
        tension: 0.2,
      },
      {
        label: '閾値 (PEAK_THRESHOLD)',
        data: [],
        borderColor: 'red',
        borderDash: [5, 5],
        fill: false,
      },
    ],
  },
  options: {
    scales: {
      x: { display: false },
      y: { suggestedMin: 0, suggestedMax: 4 },
    },
    animation: false,
  },
});

startButton.addEventListener('click', init);

async function init() {
  startButton.disabled = true;
  startButton.textContent = '準備中...';

  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') {
        alert('モーションセンサーの利用が許可されませんでした。');
        startButton.textContent = '許可されませんでした';
        return;
      }
    } catch (e) {
      alert('センサーアクセス中にエラーが発生しました');
      console.error(e);
      return;
    }
  }

  window.addEventListener('devicemotion', handleMotion);
  startButton.textContent = '計測中…';
  statusDiv.textContent = '状態: 静止';
}

function handleMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc || acc.x === null) return;

  const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  const now = Date.now();

  // ピーク検出（閾値を越えた瞬間をステップとして記録）
  if (magnitude > PEAK_THRESHOLD && now - lastPeakTime > STEP_INTERVAL_MS) {
    lastPeakTime = now;
    stepHistory.push(now);
  }

  // 古い履歴削除
  while (stepHistory.length > 0 && now - stepHistory[0] > HISTORY_SECONDS * 1000) {
    stepHistory.shift();
  }

  // ケイデンス計算（より正確に：最初と最後の時刻で期間を算出）
  let cadence = 0;
  if (stepHistory.length >= MIN_STEPS_FOR_CADENCE) {
    const spanMs = stepHistory[stepHistory.length - 1] - stepHistory[0];
    // spanが短すぎると誤差が大きいので保護
    if (spanMs > 300) {
      const steps = stepHistory.length - 1; // ステップ間の間隔を使う
      cadence = steps * (60000 / spanMs);
    }
  }
  cadenceDiv.textContent = `ケイデンス: ${cadence > 0 ? Math.round(cadence) : '---'}`;

  // 状態判定（ヒステリシス適用）
  const newState = determineStateWithHysteresis(cadence, currentState);

  if (newState !== currentState) {
    console.log(`State: ${currentState} → ${newState} (cadence=${Math.round(cadence)})`);
    currentState = newState;
    statusDiv.textContent = `状態: ${newState}`;
    statusDiv.style.color =
      newState === '静止' ? 'gray' :
      newState === '歩行' ? 'green' :
      newState === '早歩き' ? 'orange' :
      'red';
  }

  // --- 曲状態の表示（例：簡易マッピング） ---
  let musicLabel = '---';
  if (cadence === 0 || cadence < THRESH.STILL.exit) {
    musicLabel = '曲①（静止）';
  } else if (cadence < THRESH.WALK.enter) {
    musicLabel = '遷移中①（静止→歩行）';
  } else if (cadence < THRESH.BRISK.enter) {
    musicLabel = '曲②（歩行）';
  } else if (cadence < THRESH.RUN.enter) {
    musicLabel = '遷移中②（歩行→速歩）';
  } else {
    musicLabel = '曲③（速歩）';
  }

  musicStatusDiv.textContent = `曲状態: ${musicLabel}`;
  musicStatusDiv.style.color =
    musicLabel.includes('遷移中') ? 'orange' :
    musicLabel.includes('曲①') ? 'gray' :
    musicLabel.includes('曲②') ? 'green' :
    'red';

  // グラフ更新
  const timestamp = new Date().toLocaleTimeString().split(' ')[0];
  accData.push(magnitude);
  timeLabels.push(timestamp);
  accChart.data.datasets[1].data.push(PEAK_THRESHOLD);

  if (accData.length > MAX_POINTS) {
    accData.shift();
    timeLabels.shift();
    accChart.data.datasets[1].data.shift();
  }

  accChart.update();
}

// ヒステリシス付き状態判定関数
function determineStateWithHysteresis(cadence, prevState) {
  // prevState: '静止' / '歩行' / '早歩き' / '速歩'
  // cadenceが0（未計測）なら静止扱いにする
  if (!cadence || cadence === 0) return '静止';

  switch (prevState) {
    case '静止':
      if (cadence >= THRESH.WALK.enter) return '歩行';
      if (cadence >= THRESH.BRISK.enter) return '早歩き';
      if (cadence >= THRESH.RUN.enter) return '速歩';
      return '静止';

    case '歩行':
      if (cadence >= THRESH.BRISK.enter) return '早歩き';
      if (cadence < THRESH.WALK.exit) return '静止';
      return '歩行';

    case '早歩き':
      if (cadence >= THRESH.RUN.enter) return '速歩';
      if (cadence < THRESH.BRISK.exit) return '歩行';
      return '早歩き';

    case '速歩':
      if (cadence < THRESH.RUN.exit) {
        // 速歩から一段下げると早歩きに
        return '早歩き';
      }
      return '速歩';

    default:
      // フォールバック
      if (cadence < THRESH.WALK.enter) return '静止';
      if (cadence < THRESH.BRISK.enter) return '歩行';
      if (cadence < THRESH.RUN.enter) return '早歩き';
      return '速歩';
  }
}
