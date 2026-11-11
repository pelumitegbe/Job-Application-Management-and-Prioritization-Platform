const {
  validateCreateApplication,
  validateUpdateApplication,
  validateObjectId,
  validatePagination,
} = require('../validators/applicationValidators');
const applicationService = require('../services/applicationService');
const { createValidationError } = require('../utils/httpError');

// All handlers run after the `authenticate` middleware, so req.auth.userId is
// the verified owner. The owner is never read from the body, query or params.

function validated(result) {
  if (result.errors.length) throw createValidationError(result);
  return result.value;
}

async function create(req, res) {
  const data = validated(validateCreateApplication(req.body));
  const application = await applicationService.createApplication(req.auth.userId, data);
  res.status(201).json({ application });
}

async function list(req, res) {
  const pagination = validated(validatePagination(req.query));
  const result = await applicationService.listApplications(req.auth.userId, pagination);
  res.status(200).json(result);
}

async function getOne(req, res) {
  const id = validated(validateObjectId(req.params.id));
  const application = await applicationService.getApplication(req.auth.userId, id);
  res.status(200).json({ application });
}

async function update(req, res) {
  const id = validated(validateObjectId(req.params.id));
  const changes = validated(validateUpdateApplication(req.body));
  const application = await applicationService.updateApplication(req.auth.userId, id, changes);
  res.status(200).json({ application });
}

async function remove(req, res) {
  const id = validated(validateObjectId(req.params.id));
  await applicationService.deleteApplication(req.auth.userId, id);
  res.status(204).end();
}

module.exports = { create, list, getOne, update, remove };
