const express = require('express');
const authenticate = require('../middleware/authenticate');
const { create, list, priorities, getOne, update, remove } = require('../controllers/applicationController');

const router = express.Router();

// Every application endpoint requires a valid JWT.
router.use(authenticate);

router.post('/', create);
router.get('/', list);
// Static path registered before '/:id' so "priorities" is never treated as an id.
router.get('/priorities', priorities);
router.get('/:id', getOne);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
