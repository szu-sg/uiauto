/**
 * 必须在 index.js 中作为第一个 import 加载。
 * Node ESM 会把所有 import 提前执行；若 dotenv 写在 index 里、router 在 dotenv 之前被加载，
 * 则 executor 等模块在读取 SKIP_PLAYWRIGHT_DEPS 时 .env 尚未加载，导致仍会跑 playwright install --with-deps 并索要 sudo。
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameRoot = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirnameRoot, '../.env') });
dotenv.config({ path: path.join(__dirnameRoot, '../data/.env') });
