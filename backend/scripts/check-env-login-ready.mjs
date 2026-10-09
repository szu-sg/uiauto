#!/usr/bin/env node
import '../src/loadEnv.js';
import { db } from '../src/db/schema.js';

const id = Number(process.argv[2] || 2);
const r = db
  .prepare(
    `SELECT id, name, test_username, wps_company_name,
     CASE WHEN test_password IS NOT NULL AND length(trim(test_password))>0 THEN 1 ELSE 0 END AS has_pw
     FROM execution_environments WHERE id=?`,
  )
  .get(id);
const hasRun = Boolean(
  process.env.UIAUTO_INTERNAL_LOGIN_PASSWORD?.trim() ||
    process.env.E2E_PASSWORD?.trim() ||
    process.env.WPS_AUTO_LOGIN_PASSWORD?.trim(),
);
const cookieUrl = Boolean(process.env.UIAUTO_COOKIE_LOGIN_URL?.trim());
console.log(JSON.stringify({ env: r, server_login_secret: hasRun, cookie_login_url: cookieUrl }, null, 2));
