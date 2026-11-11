function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    message: 'Job Application Platform API is running',
  });
}

module.exports = { getHealth };
