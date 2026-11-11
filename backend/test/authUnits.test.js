// Pure unit tests: validation, JWT configuration and the User schema.
// No HTTP server and no database.

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { validateRegistration, validateLogin } = require('../src/validators/authValidators');
const { getJwtSecret } = require('../src/config/auth');
const User = require('../src/models/User');

describe('validateRegistration', () => {
  const valid = { name: '  Ada  ', email: ' Ada@Example.COM ', password: 'SecurePassword123!' };

  test('accepts valid input and normalizes name and email', () => {
    const { errors, value } = validateRegistration(valid);
    assert.deepEqual(errors, []);
    assert.deepEqual(value, { name: 'Ada', email: 'ada@example.com', password: 'SecurePassword123!' });
  });

  test('accepts a password of exactly 8 characters', () => {
    assert.deepEqual(validateRegistration({ ...valid, password: '12345678' }).errors, []);
  });

  test('rejects missing, blank or non-object input', () => {
    assert.equal(validateRegistration(undefined).errors.length, 3);
    assert.equal(validateRegistration({ name: '   ', email: '', password: '' }).errors.length, 3);
  });

  test('rejects names over 100 characters', () => {
    assert.match(validateRegistration({ ...valid, name: 'x'.repeat(101) }).errors[0], /at most 100/);
  });

  test('never includes the password in error messages', () => {
    const { errors } = validateRegistration({ ...valid, password: 'secret7' });
    assert.ok(errors.every((e) => !e.includes('secret7')));
  });
});

describe('validateLogin', () => {
  test('normalizes the email', () => {
    assert.equal(validateLogin({ email: ' A@B.COM ', password: 'x' }).value.email, 'a@b.com');
  });

  test('rejects missing or non-string fields', () => {
    assert.equal(validateLogin({}).errors.length, 2);
    assert.equal(validateLogin({ email: { $ne: null }, password: ['x'] }).errors.length, 2);
  });
});

describe('getJwtSecret', () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  });

  test('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    assert.throws(getJwtSecret, /JWT_SECRET is not set/);
  });

  test('throws when JWT_SECRET is shorter than 32 characters, without revealing it', () => {
    process.env.JWT_SECRET = 'too-short-secret';
    assert.throws(getJwtSecret, (err) => /at least 32/.test(err.message) && !err.message.includes('too-short-secret'));
  });

  test('returns a sufficiently long secret', () => {
    process.env.JWT_SECRET = 'x'.repeat(32);
    assert.equal(getJwtSecret(), 'x'.repeat(32));
  });
});

describe('User schema', () => {
  test('requires name, email and passwordHash', async () => {
    await assert.rejects(new User({}).validate(), (err) => {
      assert.deepEqual(Object.keys(err.errors).sort(), ['email', 'name', 'passwordHash']);
      return true;
    });
  });

  test('lowercases and trims email', () => {
    assert.equal(new User({ email: ' MiXeD@Example.com ' }).email, 'mixed@example.com');
  });

  test('declares a unique index on email and hides passwordHash by default', () => {
    const indexes = User.schema.indexes();
    assert.ok(indexes.some(([fields, options]) => fields.email === 1 && options.unique === true));
    assert.equal(User.schema.path('passwordHash').options.select, false);
  });

  test('has createdAt and updatedAt timestamps enabled', () => {
    assert.ok(User.schema.path('createdAt'));
    assert.ok(User.schema.path('updatedAt'));
  });
});
