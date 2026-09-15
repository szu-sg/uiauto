import { executeRecordedRunJob } from '../services/recordedRunJob.js';

const runId = Number(process.argv[2]);
if (!runId) {
  console.error('[RecordedRunWorker] 用法: node recordedRunWorker.js <runId>');
  process.exit(1);
}

executeRecordedRunJob(runId)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[RecordedRunWorker] 未捕获异常:', err?.message || err);
    process.exit(1);
  });
