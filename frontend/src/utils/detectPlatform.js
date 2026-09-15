/** @returns {'windows' | 'mac' | 'linux' | 'other'} */
export function detectPlatform() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const hay = `${platform} ${ua}`;
  if (/Win/i.test(hay)) return 'windows';
  if (/Mac|iPhone|iPad/i.test(hay)) return 'mac';
  if (/Linux/i.test(hay)) return 'linux';
  return 'other';
}

export function localRunnerStartHint(platform = detectPlatform()) {
  if (platform === 'windows') {
    return {
      title: 'Windows',
      steps: [
        '解压下载的 ZIP 到任意目录',
        '双击 start.bat（后台启动，无黑窗口；首次会自动安装依赖）',
        '回到平台点「重新检测连接」；关机后需再点一次，或运行 setup-autostart.bat 开机自启',
      ],
      command: 'start.bat',
    };
  }
  if (platform === 'mac' || platform === 'linux') {
    return {
      title: platform === 'mac' ? 'macOS' : 'Linux',
      steps: [
        '解压下载的 ZIP 到任意目录',
        '在终端进入该目录，执行：chmod +x start.sh && ./start.sh',
        '看到 listening on http://127.0.0.1:9321 后保持终端开启',
      ],
      command: 'chmod +x start.sh && ./start.sh',
    };
  }
  return {
    title: '本机',
    steps: [
      '解压 ZIP 后进入目录',
      '执行 npm install && npm start',
    ],
    command: 'npm install && npm start',
  };
}
