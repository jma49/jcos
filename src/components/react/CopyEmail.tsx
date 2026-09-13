import { useEffect, useState } from 'react';

type Props = {
  email: string;
  copyLabel: string;
  copiedLabel: string;
};

function CopyEmail({ email, copyLabel, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  // Reset so the button can be used again.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
    } catch {
      // Clipboard unavailable (insecure context, denied permission) — the
      // mailto link next to this button still works.
      setCopied(false);
    }
  };

  return (
    <button
      type='button'
      onClick={copy}
      aria-live='polite'
      className='rounded-md border border-line px-2.5 py-1 font-mono text-[0.6875rem] text-faint transition-colors hover:border-accent/50 hover:text-accent-soft'
    >
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}

export default CopyEmail;
