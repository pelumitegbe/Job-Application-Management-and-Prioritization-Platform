// Authentication API calls. Response shapes follow the backend contract:
//   POST /api/auth/register -> 201 { user }
//   POST /api/auth/login    -> 200 { token, tokenType, expiresIn, expiresAt, user }
//   GET  /api/auth/me       -> 200 { user }

import { apiRequest } from './api';

export async function register({ name, email, password }) {
  const { user } = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { name, email, password },
    auth: false,
  });
  return user;
}

export async function login({ email, password }) {
  const { token, expiresAt, user } = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  return { token, expiresAt, user };
}

export async function getCurrentUser({ signal } = {}) {
  const { user } = await apiRequest('/api/auth/me', { signal });
  return user;
}
