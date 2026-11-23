import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AuthLayout from '../components/layout/AuthLayout';
import TextField from '../components/common/TextField';
import PasswordField from '../components/common/PasswordField';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import { register } from '../services/authService';
import { ApiError } from '../services/api';
import { useFormSubmission } from '../hooks/useFormSubmission';
import { formatServerFieldErrors, PASSWORD_MIN_LENGTH, validateRegistrationForm } from '../utils/validation';

const FIELD_ORDER = ['name', 'email', 'password', 'confirmPassword'];
const EMPTY_FORM = { name: '', email: '', password: '', confirmPassword: '' };

export default function Register() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const { submitting, run } = useFormSubmission();
  const formRef = useRef(null);

  function focusFirstError(fieldErrors) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (first) formRef.current?.elements.namedItem(first)?.focus();
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  }

  function handleSubmit(event) {
    event.preventDefault();
    run(async () => {
      setFormError('');
      const clientErrors = validateRegistrationForm(values);
      setErrors(clientErrors);
      if (Object.keys(clientErrors).length) {
        focusFirstError(clientErrors);
        return;
      }

      try {
        await register({ name: values.name.trim(), email: values.email.trim(), password: values.password });
        navigate('/login', { state: { registeredEmail: values.email.trim().toLowerCase() } });
      } catch (err) {
        if (err instanceof ApiError) {
          const serverErrors = formatServerFieldErrors(err.fieldErrors);
          if (err.status === 409) serverErrors.email = err.message; // email already registered
          setErrors(serverErrors);
          setFormError(Object.keys(serverErrors).length ? 'Please fix the highlighted fields.' : err.message);
          focusFirstError(serverErrors);
        } else {
          setFormError(err.message || 'Something went wrong. Please try again.');
        }
      }
    });
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking your applications in minutes."
      footer={
        <p>
          Already have an account? <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40">Log in</Link>
        </p>
      }
    >
      {formError && (
        <Alert type="error" className="mb-5">
          {formError}
        </Alert>
      )}

      <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <TextField label="Full name" name="name" autoComplete="name" value={values.name} onChange={handleChange} error={errors.name} />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <PasswordField
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Creating account…" className="mt-1">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
