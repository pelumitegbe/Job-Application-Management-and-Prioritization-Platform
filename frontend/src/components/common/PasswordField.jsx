import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import TextField from './TextField';

/** TextField for passwords with a show/hide toggle button. */
export default function PasswordField({ label, ...props }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <TextField
      label={label}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="inline-flex size-8 items-center justify-center rounded-md text-subtle-foreground outline-none transition-colors hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      }
      {...props}
    />
  );
}
