import { useState } from 'react';

export default function CopyButton({ text, label = '复制' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <button type="button" className="btn btn-secondary btn-sm ui-copy-btn" onClick={handleCopy}>
      {copied ? '已复制' : label}
    </button>
  );
}
