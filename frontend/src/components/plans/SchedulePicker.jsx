import { useEffect, useMemo, useState } from 'react';
import {
  WEEKDAY_LABELS,
  buildCronFromForm,
  defaultScheduleForm,
  describeSchedule,
  parseCronToForm,
} from '../../utils/cronSchedule';

export default function SchedulePicker({
  enabled,
  cron,
  once,
  nextRun,
  saving,
  onSave,
  onClear,
  readOnly = false,
}) {
  if (readOnly) {
    return (
      <div className="schedule-picker schedule-picker--readonly">
        <p className="schedule-picker__hint">只读成员不可修改定时调度。</p>
        {enabled && cron ? (
          <p className="schedule-picker__status">
            当前已启用{once ? '（仅一次）' : '（周期）'}：{cron}
          </p>
        ) : (
          <p className="schedule-picker__status">未启用定时任务</p>
        )}
        {nextRun && (
          <p className="schedule-picker__preview">下次执行：{new Date(nextRun).toLocaleString('zh-CN')}</p>
        )}
      </div>
    );
  }
  const [form, setForm] = useState(defaultScheduleForm);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(parseCronToForm(cron, once, nextRun));
    setError('');
  }, [cron, once, nextRun]);

  const preview = useMemo(() => {
    if (form.useManual) return form.cronManual ? `Cron：${form.cronManual}` : '';
    return describeSchedule(form);
  }, [form]);

  const patch = (partial) => setForm((f) => ({ ...f, ...partial }));

  const toggleWeekday = (value) => {
    setForm((f) => {
      const set = new Set(f.weekdays || []);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      const weekdays = [...set];
      if (!weekdays.length) weekdays.push(value);
      return { ...f, weekdays };
    });
  };

  const submit = () => {
    try {
      const { cron: nextCron, once: nextOnce } = buildCronFromForm(form);
      setError('');
      onSave?.({ cron: nextCron, once: nextOnce });
    } catch (e) {
      setError(e.message || '配置无效');
    }
  };

  return (
    <div className="schedule-picker">
      <div className="schedule-picker__modes" role="tablist" aria-label="调度类型">
        <button
          type="button"
          role="tab"
          aria-selected={!form.useManual && form.mode === 'repeat'}
          className={`schedule-picker__mode${!form.useManual && form.mode === 'repeat' ? ' schedule-picker__mode--active' : ''}`}
          onClick={() => patch({ useManual: false, mode: 'repeat' })}
        >
          周期性执行
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!form.useManual && form.mode === 'once'}
          className={`schedule-picker__mode${!form.useManual && form.mode === 'once' ? ' schedule-picker__mode--active' : ''}`}
          onClick={() => patch({ useManual: false, mode: 'once' })}
        >
          仅执行一次
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={form.useManual}
          className={`schedule-picker__mode${form.useManual ? ' schedule-picker__mode--active' : ''}`}
          onClick={() => patch({ useManual: true, cronManual: cron || form.cronManual })}
        >
          高级 Cron
        </button>
      </div>

      {!form.useManual && form.mode === 'repeat' && (
        <div className="schedule-picker__body">
          <div className="schedule-picker__row">
            <label className="schedule-picker__label">执行频率</label>
            <div className="schedule-picker__freq">
              {[
                { id: 'daily', label: '每天' },
                { id: 'weekly', label: '每周' },
                { id: 'monthly', label: '每月' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`schedule-picker__freq-btn${form.repeatFreq === item.id ? ' schedule-picker__freq-btn--active' : ''}`}
                  onClick={() => patch({ repeatFreq: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {form.repeatFreq === 'weekly' && (
            <div className="schedule-picker__row">
              <label className="schedule-picker__label">星期</label>
              <div className="schedule-picker__weekdays">
                {WEEKDAY_LABELS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className={`schedule-picker__weekday${form.weekdays?.includes(d.value) ? ' schedule-picker__weekday--active' : ''}`}
                    onClick={() => toggleWeekday(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.repeatFreq === 'monthly' && (
            <div className="schedule-picker__row">
              <label className="schedule-picker__label" htmlFor="schedule-month-day">每月几号</label>
              <input
                id="schedule-month-day"
                type="number"
                min={1}
                max={31}
                className="plan-detail-field schedule-picker__number"
                value={form.monthDay}
                onChange={(e) => patch({ monthDay: parseInt(e.target.value, 10) || 1 })}
              />
            </div>
          )}

          <div className="schedule-picker__row">
            <label className="schedule-picker__label" htmlFor="schedule-repeat-time">执行时间</label>
            <input
              id="schedule-repeat-time"
              type="time"
              className="plan-detail-field schedule-picker__time"
              value={form.time}
              onChange={(e) => patch({ time: e.target.value })}
            />
          </div>
        </div>
      )}

      {!form.useManual && form.mode === 'once' && (
        <div className="schedule-picker__body">
          <div className="schedule-picker__row">
            <label className="schedule-picker__label" htmlFor="schedule-once-date">执行日期</label>
            <input
              id="schedule-once-date"
              type="date"
              className="plan-detail-field schedule-picker__date"
              value={form.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </div>
          <div className="schedule-picker__row">
            <label className="schedule-picker__label" htmlFor="schedule-once-time">执行时间</label>
            <input
              id="schedule-once-time"
              type="time"
              className="plan-detail-field schedule-picker__time"
              value={form.time}
              onChange={(e) => patch({ time: e.target.value })}
            />
          </div>
          <p className="schedule-picker__hint">到达指定时间后自动执行一次，执行完成后定时将自动关闭。</p>
        </div>
      )}

      {form.useManual && (
        <div className="schedule-picker__body">
          <div className="schedule-picker__row schedule-picker__row--stack">
            <label className="schedule-picker__label" htmlFor="schedule-cron-manual">Cron 表达式</label>
            <input
              id="schedule-cron-manual"
              className="plan-detail-field schedule-picker__cron"
              value={form.cronManual}
              onChange={(e) => patch({ cronManual: e.target.value })}
              placeholder="分 时 日 月 周，如 0 9 * * *"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {preview && <p className="schedule-picker__preview">{preview}</p>}
      {error && <p className="schedule-picker__error" role="alert">{error}</p>}
      {enabled && cron && (
        <p className="schedule-picker__status">
          当前已启用{once ? '（仅一次）' : '（周期）'}：{cron}
        </p>
      )}

      <div className="schedule-picker__actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={saving}>
          {saving ? '保存中…' : enabled ? '更新定时' : '启用定时'}
        </button>
        {enabled && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClear} disabled={saving}>
            关闭定时
          </button>
        )}
      </div>
    </div>
  );
}
