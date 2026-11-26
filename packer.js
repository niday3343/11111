// ZhiBox 装箱核心算法 —— 极值点（Extreme Points）装箱 + 分层优化
// 自研实现，支持：混排方向、重量均衡、拼箱按货主分色
'use strict';

const Packer = (function () {

  // 柜体默认规格（cm）
  const CONTAINERS = {
    '20GP': { w: 589.8, h: 239.3, d: 235.2, name: '20GP', vol: 33.2 },
    '40GP': { w: 1203.2, h: 239.3, d: 235.2, name: '40GP', vol: 67.7 },
    '40HQ': { w: 1203.2, h: 269.8, d: 235.2, name: '40HQ', vol: 76.4 },
    '45HQ': { w: 1355.6, h: 269.8, d: 235.2, name: '45HQ', vol: 86.0 },
  };

  // 颜色盘（拼箱按货主分配）
  const PALETTE = [
    '#2dd4bf', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa',
    '#34d399', '#fb7185', '#38bdf8', '#facc15', '#818cf8',
    '#4ade80', '#f97316', '#22d3ee', '#e879f9', '#a3e635'
  ];

  // 货物项：{ id, name, l, w, h, qty, weight, owner, color, allowRotate }

  function _volume(l, w, h) { return l * w * h; }

  // 极值点装箱：返回放置结果列表，每个 { x, y, z, l, w, h, itemIndex, placedBy }
  function pack(container, items, opts) {
    opts = opts || {};
    const allowRotate = opts.allowRotate !== false; // 默认允许横竖侧立混排
    const sortBy = opts.sortBy || 'volume-desc';     // volume-desc | weight-desc | area-desc

    const CW = container.w, CH = container.h, CD = container.d;

    // 展开数量 -> 单体
    const units = [];
    items.forEach((it, idx) => {
      for (let q = 0; q < (it.qty || 1); q++) {
        units.push({ idx, l: it.l, w: it.w, h: it.h, weight: it.weight || 0, name: it.name || '' });
      }
    });

    // 排序策略
    const sorters = {
      'volume-desc': (a, b) => _volume(b.l, b.w, b.h) - _volume(a.l, a.w, a.h),
      'weight-desc': (a, b) => (b.weight || 0) - (a.weight || 0),
      'area-desc': (a, b) => (b.l * b.w) - (a.l * a.w),
      'height-desc': (a, b) => b.h - a.h || _volume(b.l, b.w, b.h) - _volume(a.l, a.w, a.h),
    };
    units.sort(sorters[sortBy] || sorters['volume-desc']);

    // 6 种朝向（无旋转：仅 1 种）
    function orientations(l, w, h, rot) {
      const o = [[l, w, h]];
      if (rot) {
        o.push([l, h, w], [w, l, h], [w, h, l], [h, l, w], [h, w, l]);
      }
      // 去重
      const seen = new Set();
      const out = [];
      for (const [a, b, c] of o) {
        const k = a + ',' + b + ',' + c;
        if (!seen.has(k)) { seen.add(k); out.push([a, b, c]); }
      }
      return out;
    }

    // 极值点集合
    const eps = [[0, 0, 0]];
    const placed = [];        // 已放置箱子（含坐标）
    const boxIdxPlaced = new Array(units.length).fill(false);

    function remainingVolume() {
      let occ = 0;
      placed.forEach(p => { occ += _volume(p.l, p.w, p.h); });
      return CW * CH * CD - occ;
    }

    for (let ui = 0; ui < units.length; ui++) {
      const u = units[ui];
      const rots = orientations(u.l, u.w, u.h, allowRotate);
      let best = null;

      for (let pi = 0; pi < eps.length; pi++) {
        const [px, py, pz] = eps[pi];
        for (const [l, w, h] of rots) {
          if (px + l > CW + 1e-6 || py + h > CH + 1e-6 || pz + w > CD + 1e-6) continue;
          if (!_overlaps(placed, px, py, pz, l, w, h)) {
            // 评分：优先更低、更靠内、更靠前（z 小 = 柜门方向），体积占用更贴底
            const score = py * 1e6 + pz * 1e4 + px - _volume(l, w, h) * 1e-3;
            if (!best || score < best.score) {
              best = { x: px, y: py, z: pz, l, w, h, score };
            }
          }
        }
      }

      if (best) {
        const p = {
          x: best.x, y: best.y, z: best.z, l: best.l, w: best.w, h: best.h,
          itemIndex: u.idx, name: u.name, weight: u.weight,
        };
        placed.push(p);
        boxIdxPlaced[ui] = true;
        // 生成 3 个新极值点
        const pts = [
          [best.x + best.l, best.y, best.z],
          [best.x, best.y + best.h, best.z],
          [best.x, best.y, best.z + best.w],
        ];
        for (const pt of pts) {
          if (pt[0] <= CW && pt[1] <= CH && pt[2] <= CD) {
            let dup = false;
            for (const e of eps) {
              if (Math.abs(e[0] - pt[0]) < 1e-6 && Math.abs(e[1] - pt[1]) < 1e-6 && Math.abs(e[2] - pt[2]) < 1e-6) { dup = true; break; }
            }
            if (!dup) eps.push(pt);
          }
        }
        // 移除被覆盖的极值点
        for (let i = eps.length - 1; i >= 0; i--) {
          const e = eps[i];
          if (_coveredByBoxes(placed, e[0], e[1], e[2])) eps.splice(i, 1);
        }
      }
      // 放不下的跳过（继续下一个）
    }

    // 统计
    const usedVol = placed.reduce((s, p) => s + _volume(p.l, p.w, p.h), 0);
    const placedCount = placed.length;
    const totalCount = units.length;
    const totalWeight = placed.reduce((s, p) => s + (p.weight || 0), 0);
    const maxLayer = placed.reduce((s, p) => Math.max(s, p.y + p.h), 0);

    // 重心偏移（前后 = z 方向，左右 = x 方向）
    let cogZnum = 0, cogXnum = 0, cogW = 0;
    placed.forEach(p => {
      const v = _volume(p.l, p.w, p.h);
      const wm = (p.weight || 0) > 0 ? p.weight : v; // 无重量时按体积加权
      cogZnum += (p.z + p.w / 2) * wm;
      cogXnum += (p.x + p.l / 2) * wm;
      cogW += wm;
    });
    const cogZ = cogW > 0 ? cogZnum / cogW : CD / 2;
    const cogX = cogW > 0 ? cogXnum / cogW : CW / 2;
    const cogZOffset = ((cogZ - CD / 2) / CD) * 100; // 正 = 偏后
    const cogXOffset = ((cogX - CW / 2) / CW) * 100; // 正 = 偏右

    return {
      placed, placedCount, totalCount,
      utilization: (usedVol / (CW * CH * CD)) * 100,
      usedVol, totalVol: CW * CH * CD,
      totalWeight, maxLayer,
      cogZOffset, cogXOffset, cogZ, cogX,
      container: { w: CW, h: CH, d: CD, name: container.name },
    };
  }

  function _overlaps(placed, x, y, z, l, w, h) {
    for (const p of placed) {
      if (x < p.x + p.l - 1e-6 && x + l > p.x + 1e-6 &&
          y < p.y + p.h - 1e-6 && y + h > p.y + 1e-6 &&
          z < p.z + p.w - 1e-6 && z + w > p.z + 1e-6) {
        return true;
      }
    }
    return false;
  }

  function _coveredByBoxes(placed, x, y, z) {
    for (const p of placed) {
      if (x > p.x + 1e-6 && x < p.x + p.l - 1e-6 &&
          y > p.y + 1e-6 && y < p.y + p.h - 1e-6 &&
          z > p.z + 1e-6 && z < p.z + p.w - 1e-6) {
        return true;
      }
    }
    return false;
  }

  function colorFor(ownerIndex) {
    if (ownerIndex == null || ownerIndex < 0) return PALETTE[0];
    return PALETTE[ownerIndex % PALETTE.length];
  }

  return { pack, CONTAINERS, PALETTE, colorFor };
})();

export const { pack, CONTAINERS, colorFor } = Packer;
