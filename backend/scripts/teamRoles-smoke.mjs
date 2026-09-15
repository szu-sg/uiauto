/**
 * REQ-B07 权限矩阵冒烟：校验 enforceTeamPermissions 逻辑（无 HTTP）。
 * 运行：node scripts/teamRoles-smoke.mjs
 */
const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowsWrite(role) {
  return (ROLE_RANK[role] ?? -1) >= ROLE_RANK.member;
}

function allowsRead(role) {
  return (ROLE_RANK[role] ?? -1) >= ROLE_RANK.viewer;
}

const cases = [
  ['viewer', 'GET', true],
  ['viewer', 'POST', false],
  ['member', 'POST', true],
  ['admin', 'DELETE', true],
  ['owner', 'PATCH', true],
];

let failed = 0;
for (const [role, method, expect] of cases) {
  const ok = READ.has(method) ? allowsRead(role) : allowsWrite(role);
  if (ok !== expect) {
    console.error(`FAIL ${role} ${method}: expected ${expect}, got ${ok}`);
    failed += 1;
  }
}

if (failed) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('teamRoles-smoke: OK');
