// 惑星配置ひかく - 検索ワーカー
// data/longitudes.bin（Uint16, 8惑星 x 日数, 0.1度刻み量子化, リトルエンディアン）を読み込み、
// 基準日から惑星配置が近い上位10日をメインスレッドをブロックせずに探索する。

let meta = null;
let data = null; // Uint16Array
let startJDN = 0;

// 先発グレゴリオ暦のユリウス通日変換（Fliegel & Van Flandern のアルゴリズム）
function ymdToJDN(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
    - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

function jdnToYMD(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d2 = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d2) / 4);
  const m2 = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m2 + 2) / 5) + 1;
  const month = m2 + 3 - 12 * Math.floor(m2 / 10);
  const year = 100 * b + d2 - 4800 + Math.floor(m2 / 10);
  return { year, month, day };
}

function longitudesAt(idx) {
  const nBodies = meta.bodies.length;
  const off = idx * nBodies;
  const out = new Array(nBodies);
  for (let b = 0; b < nBodies; b++) out[b] = data[off + b] / 10;
  return out;
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      const metaResp = await fetch(msg.metaUrl);
      if (!metaResp.ok) throw new Error('meta.json の取得に失敗しました');
      meta = await metaResp.json();

      const binResp = await fetch(msg.binUrl);
      if (!binResp.ok) throw new Error('longitudes.bin の取得に失敗しました');
      const buf = await binResp.arrayBuffer();
      data = new Uint16Array(buf);

      startJDN = ymdToJDN(meta.startYear, meta.startMonth, meta.startDay);
      self.postMessage({ type: 'ready', meta });
    } catch (err) {
      self.postMessage({ type: 'error', message: String(err.message || err) });
    }
    return;
  }

  if (msg.type === 'search') {
    if (!data || !meta) {
      self.postMessage({ type: 'error', message: 'データ未読み込みです' });
      return;
    }
    const { year, month, day, minGapYears } = msg;
    const jdn = ymdToJDN(year, month, day);
    const idx = jdn - startJDN;

    if (idx < 0 || idx >= meta.dayCount) {
      self.postMessage({ type: 'error', message: `対応範囲外の日付です（西暦${meta.startYear}年〜${meta.endYear}年）` });
      return;
    }

    const nBodies = meta.bodies.length;
    const target = longitudesAt(idx);
    // 基準日の前後 minGapYears 年は、外惑星（特に木星〜海王星）がほとんど動かず
    // 自明に高い近似率が出てしまうため除外する。
    const excludeWindow = Math.round((minGapYears || 1) * 365.25);

    const top = new Array(10);
    let filled = 0;
    let worstIdx = -1;
    let worstVal = Infinity;

    const n = meta.dayCount;
    for (let i = 0; i < n; i++) {
      if (Math.abs(i - idx) <= excludeWindow) continue;

      let sum = 0;
      const off = i * nBodies;
      for (let b = 0; b < nBodies; b++) {
        let diff = Math.abs(data[off + b] / 10 - target[b]);
        if (diff > 180) diff = 360 - diff;
        sum += diff;
      }
      const avg = sum / nBodies;

      if (filled < 10) {
        top[filled] = { i, avg };
        filled++;
        if (filled === 10) {
          worstVal = -Infinity;
          for (let k = 0; k < 10; k++) {
            if (top[k].avg > worstVal) { worstVal = top[k].avg; worstIdx = k; }
          }
        }
      } else if (avg < worstVal) {
        top[worstIdx] = { i, avg };
        worstVal = -Infinity;
        for (let k = 0; k < 10; k++) {
          if (top[k].avg > worstVal) { worstVal = top[k].avg; worstIdx = k; }
        }
      }
    }

    const filledTop = top.slice(0, filled);
    filledTop.sort((a, b) => a.avg - b.avg);

    const results = filledTop.map(({ i, avg }) => ({
      date: jdnToYMD(startJDN + i),
      similarity: Math.max(0, 100 * (1 - avg / 180)),
      longitudes: longitudesAt(i),
    }));

    self.postMessage({
      type: 'result',
      target: { date: { year, month, day }, longitudes: target },
      results,
    });
  }
};
