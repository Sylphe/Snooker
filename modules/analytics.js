export function avg(arr) {
  return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
}

export function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(x => Math.pow(x-m,2))));
}

export function correlation(xs, ys) {
  const pairs = xs.map((x,i)=>[Number(x), Number(ys[i])]).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y));
  if (pairs.length < 3) return null;
  const xvals = pairs.map(p=>p[0]), yvals = pairs.map(p=>p[1]);
  const mx = avg(xvals), my = avg(yvals);
  const num = pairs.reduce((a,[x,y]) => a + (x-mx)*(y-my), 0);
  const denX = Math.sqrt(pairs.reduce((a,[x]) => a + Math.pow(x-mx,2), 0));
  const denY = Math.sqrt(pairs.reduce((a,[,y]) => a + Math.pow(y-my,2), 0));
  if (!denX || !denY) return null;
  return num / (denX * denY);
}

export function corrText(r) {
  if (r === null) return "Not enough variation/data";
  const abs = Math.abs(r);
  const strength = abs >= .65 ? "strong" : abs >= .35 ? "moderate" : "weak";
  const direction = r >= 0 ? "positive" : "negative";
  return `${strength} ${direction} (${r.toFixed(2)})`;
}

export function rollingAverage(values, windowSize) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i-windowSize+1), i+1);
    return avg(slice);
  });
}

export function movingTrend(values, windowSize) {
  if (values.length < windowSize * 2) return "Not enough data";
  const recent = avg(values.slice(-windowSize));
  const prior = avg(values.slice(-(windowSize*2), -windowSize));
  if (!prior) return "Not enough baseline";
  const delta = ((recent - prior) / Math.abs(prior)) * 100;
  if (delta > 7.5) return `Improving (+${delta.toFixed(1)}% vs prior ${windowSize})`;
  if (delta < -7.5) return `Declining (${delta.toFixed(1)}% vs prior ${windowSize})`;
  return `Stable (${delta.toFixed(1)}% vs prior ${windowSize})`;
}

export function benchmarkText(values, windowSize) {
  if (!values.length) return "No data";
  const latest = values[values.length-1];
  const baseline = values.length > 1 ? avg(values.slice(Math.max(0, values.length-windowSize-1), -1)) : latest;
  if (!baseline) return "No baseline";
  const delta = ((latest - baseline) / Math.abs(baseline)) * 100;
  return `${latest.toFixed(2)} latest vs ${baseline.toFixed(2)} personal baseline (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`;
}

export function progressVelocity(logs, windowSize=10) {
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  if (vals.length < 3) return null;
  const use = vals.slice(-windowSize);
  const n = use.length;
  const xs = use.map((_,i)=>i+1);
  const mx = avg(xs), my = avg(use);
  const num = xs.reduce((a,x,i)=>a+(x-mx)*(use[i]-my),0);
  const den = xs.reduce((a,x)=>a+Math.pow(x-mx,2),0);
  if (den === 0) return {slope:0, n, label:"Flat"};
  const slope = num/den;
  return {slope, n, label: slope>0.5?"Improving":slope<-0.5?"Declining":"Flat"};
}


export function detectPlateauState(logs, options = {}) {
  const vals = (logs || []).map(l => Number(l.normalizedScore || l.score || 0)).filter(Number.isFinite);

  if (vals.length < 6) {
    return {
      state: "insufficient",
      label: "Insufficient sample",
      detail: "Not enough recent sessions to evaluate plateau state reliably."
    };
  }

  const recent = vals.slice(-8);
  const avg = recent.reduce((a,b)=>a+b,0) / recent.length;
  const variance = recent.reduce((a,v)=>a + Math.pow(v - avg, 2), 0) / recent.length;
  const std = Math.sqrt(variance);

  const n = recent.length;
  const meanX = (n - 1) / 2;
  let num = 0;
  let den = 0;

  recent.forEach((v, i) => {
    num += (i - meanX) * (v - avg);
    den += Math.pow(i - meanX, 2);
  });

  const slope = den === 0 ? 0 : num / den;
  const uncertainty = Number(options.uncertainty || 0);

  if (uncertainty > 0.22) {
    return {
      state: "uncertain",
      label: "High uncertainty",
      detail: "The current evidence is still too noisy for stable classification."
    };
  }

  if (Math.abs(slope) < 0.35 && std < Math.max(4, avg * 0.08)) {
    return {
      state: "plateau",
      label: "Stable plateau",
      detail: "Performance is stable but improvement momentum has slowed."
    };
  }

  if (slope < -0.6 && std > Math.max(5, avg * 0.1)) {
    return {
      state: "fatigue",
      label: "Fatigue / inconsistency",
      detail: "Recent sessions show declining trend and elevated variability."
    };
  }

  if (slope > 0.5) {
    return {
      state: "progressing",
      label: "Progressing",
      detail: "Recent performance trend still indicates measurable progression."
    };
  }

  return {
    state: "mixed",
    label: "Mixed signal",
    detail: "Performance variation does not yet indicate a stable state."
  };
}

export function plateauActionRecommendation(state) {
  switch(state) {
    case "plateau":
      return {
        title: "Constraint variation",
        instruction: "Keep the drill but vary one constraint: angle, distance, speed, or pressure."
      };
    case "fatigue":
      return {
        title: "Deload / rebuild",
        instruction: "Reduce intensity temporarily and rebuild consistency."
      };
    case "uncertain":
      return {
        title: "Collect evidence",
        instruction: "Repeat the same setup before changing targets or drill difficulty."
      };
    case "progressing":
      return {
        title: "Increase difficulty",
        instruction: "Increase difficulty gradually while preserving execution quality."
      };
    default:
      return {
        title: "Maintain target",
        instruction: "Keep the current setup and continue collecting data."
      };
  }
}
