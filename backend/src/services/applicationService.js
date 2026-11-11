const JobApplication = require('../models/JobApplication');
const User = require('../models/User');
const { createHttpError } = require('../utils/httpError');

// Every query below includes `user: userId`, so ownership is enforced by the
// database query itself. A missing record and another user's record are
// indistinguishable to the client: both produce this 404.
function notFoundError() {
  return createHttpError(404, 'Application not found.');
}

function ownedBy(userId, applicationId) {
  return { _id: applicationId, user: userId };
}

async function createApplication(userId, data) {
  // A token can outlive its account; don't create records for deleted users.
  if (!(await User.exists({ _id: userId }))) {
    throw createHttpError(401, 'User account no longer exists.');
  }

  // `user` is set last so it can never be overridden by `data`.
  const application = await JobApplication.create({ ...data, user: userId });
  return application.toJSON();
}

async function listApplications(userId, { page, limit }) {
  const filter = { user: userId };

  const [applications, total] = await Promise.all([
    JobApplication.find(filter)
      .sort({ createdAt: -1, _id: -1 }) // _id breaks ties so pages are stable
      .skip((page - 1) * limit)
      .limit(limit),
    JobApplication.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);
  return {
    applications: applications.map((application) => application.toJSON()),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

async function getApplication(userId, applicationId) {
  const application = await JobApplication.findOne(ownedBy(userId, applicationId));
  if (!application) throw notFoundError();
  return application.toJSON();
}

async function updateApplication(userId, applicationId, { set, unset }) {
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (unset.length) update.$unset = Object.fromEntries(unset.map((field) => [field, 1]));

  const application = await JobApplication.findOneAndUpdate(ownedBy(userId, applicationId), update, {
    returnDocument: 'after',
    runValidators: true,
  });
  if (!application) throw notFoundError();
  return application.toJSON();
}

async function deleteApplication(userId, applicationId) {
  const { deletedCount } = await JobApplication.deleteOne(ownedBy(userId, applicationId));
  if (deletedCount === 0) throw notFoundError();
}

module.exports = {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  deleteApplication,
};
