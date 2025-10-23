// DOM取得
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const cadenceDiv = document.getElementById('cadence');
const musicStatusDiv = document.getElementById('musicStatus');

// 定数
const PEAK_THRESHOLD = 1.5;   // 「1歩」として検知する閾値
const STEP_INTERVAL_MS = 500; // チャタリング防止
const HISTORY_SECONDS = 3;    // ケイデンス算出のための履歴秒数

// ケイデンスのしきい値
const STILL_THRESHOLD = 30;   // 静止とみなす閾値
const WALK_THRESHOLD = 100;   // 歩行〜早歩きの境界
const RUN_THRESHOLD = 130;    // 早歩き〜速歩の境界

// 状態変数
let lastPeakTime = 0;
let stepHistory = [];
let currentState = '静止';

// Chart.js 初期設定
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
      y: { suggestedMin: 0, suggestedMax: 3 },
    },
    animation: false,
  },
});

startButton.addEventListener('click', init);

async function init() {
  startButton.disabled = true;
  startButton.textContent = '準備中...';

  // iOS用のセンサーアクセス許可
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
  statusDiv.textContent = '静止中';
}

function handleMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc || acc.x === null) return;

  const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  const now = Date.now();

  // ピーク検出
  if (magnitude > PEAK_THRESHOLD && now - lastPeakTime > STEP_INTERVAL_MS) {
    lastPeakTime = now;
    stepHistory.push(now);
  }

  // 古い履歴削除
  while (stepHistory.length > 0 && now - stepHistory[0] > HISTORY_SECONDS * 1000) {
    stepHistory.shift();
  }

  // ケイデンス計算
  const cadence = stepHistory.length * (60000 / (HISTORY_SECONDS * 1000));
  cadenceDiv.textContent = `ケイデンス: ${Math.round(cadence)}`;

  // 状態判定
  let newState;
  if (cadence < STILL_THRESHOLD) newState = '静止';
  else if (cadence < WALK_THRESHOLD) newState = '歩行';
  else if (cadence < RUN_THRESHOLD) newState = '早歩き';
  else newState = '速歩';

  if (newState !== currentState) {
    console.log(`State: ${currentState} → ${newState}`);
    currentState = newState;
    statusDiv.textContent = `状態: ${newState}`;
    statusDiv.style.color =
      newState === '静止' ? 'gray' :
      newState === '歩行' ? 'green' :
      newState === '早歩き' ? 'orange' :
      'red';
  }

  // --- 曲状態の表示 ---
  let musicLabel = '---';

  if (cadence < 30) {
    musicLabel = '曲①（静止）';
  } else if (cadence < 60) {
    musicLabel = '遷移中①（静止→歩行）';
  } else if (cadence < 100) {
    musicLabel = '曲②（歩行）';
  } else if (cadence < 130) {
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
