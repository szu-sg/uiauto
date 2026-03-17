/**
 * 将 console 输出同时写入日志文件，便于在无终端环境下查看。
 * 日志文件：backend/data/uiauto.log（可通过环境变量 LOG_PATH 覆盖）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const defaultLogPath = path.join(DATA_DIR, 'uiauto.log');
const logPath = process.env.LOG_PATH || defaultLogPath;

// 确保 data 目录存在
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (_) {}

let stream = null;
try {
  stream = fs.createWriteStream(logPath, { flags: 'a' });
  stream.on('error', (err) => {
    // 避免写文件失败导致进程崩溃，只写到 stderr
    process.stderr.write(`[Logger] 写日志文件失败: ${err.message}\n`);
  });
} catch (err) {
  process.stderr.write(`[Logger] 无法创建日志文件 ${logPath}: ${err.message}\n`);
}

function timestamp() {
  return new Date().toISOString();
}

function formatArgs(args) {
  const s = args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object') return JSON.stringify(a);
    return String(a);
  }).join(' ');
  return s.replace(/\n/g, ' '); // 避免一行日志里换行把文件打乱
}

function writeToFile(level, args) {
  if (!stream || stream.destroyed) return;
  const line = `[${timestamp()}] [${level}] ${formatArgs(args)}\n`;
  stream.write(line);
}

const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

console.log = function (...args) {
  origLog.apply(console, args);
  writeToFile('LOG', args);
};

console.error = function (...args) {
  origError.apply(console, args);
  writeToFile('ERROR', args);
};

console.warn = function (...args) {
  origWarn.apply(console, args);
  writeToFile('WARN', args);
};

// 启动时写一行，便于确认日志文件生效
origLog(`[Logger] 日志已写入: ${logPath}`);
