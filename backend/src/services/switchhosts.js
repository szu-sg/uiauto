/**
 * 将 SwitchHosts / 系统 hosts 风格的文本转为 Chromium --host-resolver-rules 参数值。
 * 每行：IP  hostname [hostname2 ...]，# 开头为注释；仅支持 IPv4。
 * @see https://www.chromium.org/developers/design-documents/network-stack/socks-proxy/
 */
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

export function hostsTextToChromiumHostResolverRules(text) {
  if (text == null || !String(text).trim()) return '';
  const maps = [];
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const hash = t.indexOf('#');
    const core = (hash >= 0 ? t.slice(0, hash) : t).trim();
    if (!core) continue;
    const parts = core.split(/\s+/).filter(Boolean);
    if (parts.length < 2) continue;
    const ip = parts[0];
    if (!IPV4.test(ip)) continue;
    for (let i = 1; i < parts.length; i++) {
      const host = parts[i].trim();
      if (!host || host.startsWith('#')) continue;
      maps.push(`MAP ${host} ${ip}`);
    }
  }
  return maps.join(', ');
}
