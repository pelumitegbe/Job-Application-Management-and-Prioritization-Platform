import { Alert as UiAlert } from '@/components/ui/alert';

/** type: "error" | "success" | "info" (kept for compatibility with existing pages). */
export default function Alert({ type = 'info', ...props }) {
  return <UiAlert variant={type} {...props} />;
}
