const express = require('express');
const authenticate = require('../middleware/authenticate');
const { create, list, getOne, update, remove } = require('../controllers/applicationController');

const router = express.Router();

// Every application endpoint requires a valid JWT.
router.use(authenticate);

router.post('/', create);
router.get('/', list);
router.get('/:id', getOne);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
