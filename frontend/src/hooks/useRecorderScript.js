import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateScript } from '../utils/playwrightCodegen';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export function useRecorderScript({ steps, metaName, language, device = DEFAULT_VIEWPORT }) {
  const [script, setScript] = useState('');
  const prevGeneratedRef = useRef('');

  const generatedScript = useMemo(
    () => generateScript(steps, {
      name: metaName || 'recorded test',
      device,
      language,
    }),
    [steps, metaName, language, device],
  );

  const scriptStale = useMemo(
    () => steps.length > 0 && script.trim() !== '' && script !== generatedScript,
    [script, generatedScript, steps.length],
  );

  useEffect(() => {
    setScript((prev) => {
      if (!prev.trim() && !generatedScript.trim()) return prev;
      if (!prev.trim()) return generatedScript;
      if (prev === prevGeneratedRef.current) return generatedScript;
      return prev;
    });
    prevGeneratedRef.current = generatedScript;
  }, [generatedScript]);

  const regenerateFromSteps = useCallback((onSuccess) => {
    const apply = () => {
      setScript(generatedScript);
      onSuccess?.();
    };
    if (script.trim() && script !== generatedScript) {
      if (!window.confirm('将从步骤重新生成脚本，当前脚本编辑内容将被覆盖，继续？')) return;
    }
    apply();
  }, [generatedScript, script]);

  return {
    script,
    setScript,
    generatedScript,
    scriptStale,
    regenerateFromSteps,
  };
}
