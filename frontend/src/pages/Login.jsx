import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import AuthLayout from '../components/layout/AuthLayout';
import TextField from '../components/common/TextField';
import PasswordField from '../components/common/PasswordField';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import { useAuth } from '../hooks/useAuth';
import { useFormSubmission } from '../hooks/useFormSubmission';
import { ApiError } from '../services/api';
import { safeRedirectPath } from '../components/routing/GuestRoute';
import { formatServerFieldErrors, validateLoginForm } from '../utils/validation';

export default function Login() {
  const { login, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registeredEmail = location.state?.registeredEmail;

  const [values, setValues] = useState({ email: registeredEmail || '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const { submitting, run } = useFormSubmission();
  const formRef = useRef(null);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  }

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      setFormError('');
      clearNotice();
      const clientErrors = validateLoginForm(values);
      setErrors(clientErrors);
      if (Object.keys(clientErrors).length) {
        formRef.current?.elements.namedItem(clientErrors.email ? 'email' : 'password')?.focus();
        return;
      }

      try {
        await login({ email: values.email.trim(), password: values.password });
        navigate(safeRedirectPath(location.state?.from), { replace: true });
      } catch (err) {
        // 401 here means wrong email or password (the backend uses one message for both).
        if (err instanceof ApiError) setErrors(formatServerFieldErrors(err.fieldErrors));
        setFormError(err.message || 'Something went wrong. Please try again.');
        setValues((current) => ({ ...current, password: '' }));
      }
    });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue managing your applications."
      footer={
        <p>
          New here? <Link to="/register" className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40">Create an account</Link>
        </p>
      }
    >
      {registeredEmail && !formError && !notice && (
        <Alert type="success" className="mb-5">
          Account created. Log in to get started.
        </Alert>
      )}
      {notice && !formError && (
        <Alert type={notice.type} onDismiss={clearNotice} className="mb-5">
          {notice.text}
        </Alert>
      )}
      {formError && (
        <Alert type="error" className="mb-5">
          {formError}
        </Alert>
      )}

      <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          autoFocus={!registeredEmail}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          autoFocus={Boolean(registeredEmail)}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Logging in…" className="mt-1">
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}
