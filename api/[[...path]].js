export const config = { runtime: 'edge' };

const NET_COFFEE = 'https://ip.net.coffee';
const CLAUDE_TRACE = 'https://claude.ai/cdn-cgi/trace';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // 路由分发
    if (path === '/' || path === '/api' || path === '/api/') {
      return docsResponse(req);
    }
    if (path === '/api/purity') {
      return await handlePurity();
    }
    if (path === '/api/claude-exit-ip') {
      return await handleClaudeExitIP();
    }
    if (path === '/api/status') {
      return await handleStatus();
    }
    if (path === '/api/batch') {
      return await handleBatch(url.searchParams.get('ips'));
    }

    // 动态路由
    const geoipMatch = path.match(/^\/api\/geoip\/(.+)$/);
    if (geoipMatch) return await handleGeoIP(geoipMatch[1]);

    const riskMatch = path.match(/^\/api\/iprisk\/(.+)$/);
    if (riskMatch) return await handleIPRisk(riskMatch[1]);

    return jsonResponse({ 
      error: 'Not found',
      endpoints: ['/api/purity', '/api/claude-exit-ip', '/api/geoip/{ip}', '/api/iprisk/{ip}', '/api/batch', '/api/status']
    }, 404);
  } catch (err) {
    return jsonResponse({ error: err.message || 'Internal error' }, 500);
  }
}

// ─────────── 处理器 ───────────

async function handleClaudeExitIP() {
  const trace = await fetch(CLAUDE_TRACE, { cf: { cacheTtl: 0 } }).then(r => r.text());
  const ip = trace.match(/ip=(.+)/)?.[1] || null;
  const loc = trace.match(/loc=(.+)/)?.[1] || null;
  const colo = trace.match(/colo=(.+)/)?.[1] || null;
  return jsonResponse({ ip, location: loc, datacenter: colo, raw: trace });
}

async function handleGeoIP(ip) {
  if (!isValidIP(ip)) return jsonResponse({ error: 'Invalid IP' }, 400);
  const data = await fetch(`${NET_COFFEE}/api/geoip/${ip}`).then(r => r.json());
  return jsonResponse(data);
}

async function handleIPRisk(ip) {
  if (!isValidIP(ip)) return jsonResponse({ error: 'Invalid IP' }, 400);
  const data = await fetch(`${NET_COFFEE}/api/iprisk/${ip}`).then(r => r.json());
  return jsonResponse(data);
}

async function handleBatch(ipsParam) {
  if (!ipsParam) return jsonResponse({ error: 'Missing ips param' }, 400);
  const data = await fetch(`${NET_COFFEE}/api/geoip-batch?ips=${encodeURIComponent(ipsParam)}`).then(r => r.json());
  return jsonResponse(data);
}

async function handleStatus() {
  const data = await fetch(`${NET_COFFEE}/claude/status.json`).then(r => r.json());
  return jsonResponse(data);
}

async function handlePurity() {
  const trace = await fetch(CLAUDE_TRACE, { cf: { cacheTtl: 0 } }).then(r => r.text());
  const ip = trace.match(/ip=(.+)/)?.[1];
  if (!ip) return jsonResponse({ error: 'Failed to get Claude exit IP' }, 502);

  const [geo, risk] = await Promise.all([
    fetch(`${NET_COFFEE}/api/geoip/${ip}`).then(r => r.json()),
    fetch(`${NET_COFFEE}/api/iprisk/${ip}`).then(r => r.json()),
  ]);

  const score = risk.trust_score || 0;
  const verdict = score >= 80 ? { level: 'excellent', text: '✅ 纯净度高，Claude 使用安全', color: '#22c55e' }
               : score >= 60 ? { level: 'good', text: '⚠️ 可用，但非最优', color: '#f59e0b' }
               : score >= 40 ? { level: 'risky', text: '⚠️ 有风险，建议更换出口', color: '#f97316' }
               : { level: 'danger', text: '❌ 高风险，极可能被封号', color: '#ef4444' };

  return jsonResponse({
    success: true,
    timestamp: new Date().toISOString(),
    claude: { exit_ip: ip, exit_location: trace.match(/loc=(.+)/)?.[1] || null, datacenter: trace.match(/colo=(.+)/)?.[1] || null },
    geo,
    purity: risk,
    verdict,
  });
}

// ─────────── 工具 ───────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: cors });
}

function isValidIP(ip) {
  const ipv4 = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

function docsResponse(req) {
  const base = new URL(req.url).origin;
  return jsonResponse({
    name: 'Claude IP 纯净度检测 API',
    version: '1.0.0',
    base_url: base,
    endpoints: {
      'GET /api/purity': '一键完整检测（推荐）',
      'GET /api/claude-exit-ip': '获取 Claude 出口 IP',
      'GET /api/geoip/{ip}': 'IP 地理信息',
      'GET /api/iprisk/{ip}': 'IP 风险评分（纯净度）',
      'GET /api/batch?ips=1.1.1.1,8.8.8.8': '批量地理查询',
      'GET /api/status': 'Claude 服务状态',
    },
    example: `${base}/api/purity`,
    note: 'Edge Function 部署，全球 CDN，无需认证',
  });
}
