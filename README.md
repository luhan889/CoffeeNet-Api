# Claude IP 纯净度检测 API

## 部署到 Vercel

1. 点击 Deploy 按钮，或手动上传
2. 部署完成后获得 `https://your-project.vercel.app`
3. 访问 `/api/purity` 即可检测

## 端点

| 端点 | 说明 |
|------|------|
| `GET /api/purity` | 一键完整检测 |
| `GET /api/claude-exit-ip` | Claude 出口 IP |
| `GET /api/geoip/{ip}` | 地理信息 |
| `GET /api/iprisk/{ip}` | 风险评分 |
| `GET /api/batch?ips=a,b` | 批量查询 |
| `GET /api/status` | 服务状态 |
