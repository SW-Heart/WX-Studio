import { useEffect, useState, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// 从 pricing 推算单图最低积分（用于 UI 门槛判断）；MJ 的 by_mode 取最低档
export const priceFloor = (pricing) => {
  if (!pricing) return 1;
  const mode = pricing.mode || 'per_call';
  if (mode === 'by_mode') {
    const vs = Object.values(pricing.by_mode || {}).map(Number).filter(n => !isNaN(n) && n > 0);
    return vs.length ? Math.min(...vs) : 1;
  }
  if (mode === 'tiered_pixels') {
    const vs = (pricing.tiers || []).map(t => Number(t.cost)).filter(n => !isNaN(n) && n > 0);
    return vs.length ? Math.min(...vs) : 1;
  }
  if (mode === 'per_token') return 1; // 不适合作为单图门槛
  return Number(pricing.cost) || 1;
};

// 按 n 和 size 计算每次调用的总积分（简化版，和后端 resolve_model_cost 对齐）
export const computeCost = (pricing, { n = 1, size } = {}) => {
  if (!pricing) return 1;
  const mode = pricing.mode || 'per_call';
  if (mode === 'per_call') return Number(pricing.cost) || 1;
  if (mode === 'per_image') return (Number(pricing.cost) || 1) * Math.max(1, n);
  if (mode === 'by_mode') {
    // 无法仅凭 pricing 算，调用方应直接传 mode 级别的 cost
    const vs = Object.values(pricing.by_mode || {}).map(Number).filter(x => !isNaN(x));
    return vs.length ? Math.min(...vs) : 1;
  }
  if (mode === 'tiered_pixels') {
    const tiers = pricing.tiers || [];
    if (!tiers.length) return 1;
    let pixels = 0;
    if (typeof size === 'string' && size.includes('x')) {
      const [w, h] = size.toLowerCase().split('x').map(v => parseInt(v, 10));
      if (!isNaN(w) && !isNaN(h)) pixels = w * h;
    }
    // 找第一个 max_pixels >= pixels 的档；max_pixels=0 表示兜底档
    const matched = tiers.find(t => Number(t.max_pixels) >= pixels && Number(t.max_pixels) > 0) ||
                    tiers.find(t => Number(t.max_pixels) === 0) || tiers[tiers.length - 1];
    return (Number(matched.cost) || 1) * Math.max(1, n);
  }
  if (mode === 'per_token') return Number(pricing.cost) || 1;
  return Number(pricing.cost) || 1;
};

/**
 * 加载后端注册的可用模型（按渠道过滤）
 * @param {string} token
 * @param {'quick_create' | 'canvas' | 'plaza'} target
 */
export const useAvailableModels = (token, target) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE_URL}/api/models/public${target ? `?target=${target}` : ''}`;
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!r.ok) throw new Error('failed');
      const j = await r.json();
      setModels(j.models || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [token, target]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { models, loading, error, refetch: fetch_ };
};
