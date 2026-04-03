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

/** 单个日志文件最大字节数，超过后轮转（重命名为 .1 并新建）。默认 50 MB */
const MAX_LOG_BYTES = parseInt(process.env.LOG_MAX_BYTES, 10) || 50 * 1024 * 1024;

let stream = null;
let streamBytesWritten = 0;

function createStream() {
  try {
    // 启动时若文件已超限，直接截断为空（保留最新一次运行）
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > MAX_LOG_BYTES) {
        fs.writeFileSync(logPath, `[Logger] 日志文件超过 ${Math.round(MAX_LOG_BYTES / 1024 / 1024)} MB，已自动清空\n`);
      }
    } catch (_) {}
    const s = fs.createWriteStream(logPath, { flags: 'a' });
    s.on('error', (err) => {
      if (err.code === 'EPIPE') return; // 管道断开，静默忽略，避免死循环
      process.stderr.write(`[Logger] 写日志文件失败: ${err.message}\n`);
    });
    streamBytesWritten = 0;
    return s;
  } catch (err) {
    process.stderr.write(`[Logger] 无法创建日志文件 ${logPath}: ${err.message}\n`);
    return null;
  }
}

stream = createStream();

function timestamp() {
  return new Date().toISOString();
}

function formatArgs(args) {
  if (args.length === 0) return '';
  // 处理 printf 风格占位符：%s %d %i %f %o %j
  if (typeof args[0] === 'string' && args.length > 1 && /%[sdifoj]/.test(args[0])) {
    let i = 1;
    const msg = args[0].replace(/%([sdifoj])/g, (_, t) => {
      if (i >= args.length) return `%${t}`;
      const v = args[i++];
      if (t === 'o' || t === 'j') return (v !== null && typeof v === 'object') ? JSON.stringify(v) : String(v);
      return String(v);
    });
    // 若还有多余参数，追加在后面
    const rest = args.slice(i).map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'object' ? JSON.stringify(a) : String(a)));
    const full = rest.length > 0 ? `${msg} ${rest.join(' ')}` : msg;
    return full.replace(/\n/g, ' ');
  }
  const s = args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) return JSON.stringify(a);
    return String(a);
  }).join(' ');
  return s.replace(/\n/g, ' ');
}

function writeToFile(level, args) {
  if (!stream || stream.destroyed) {
    stream = createStream(); // 流崩溃后自动重建
    if (!stream) return;
  }
  const line = `[${timestamp()}] [${level}] ${formatArgs(args)}\n`;
  try {
    stream.write(line);
    streamBytesWritten += line.length;
    // 超过大小限制时轮转
    if (streamBytesWritten > MAX_LOG_BYTES) {
      stream.end();
      stream = createStream();
    }
  } catch (_) {}
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
