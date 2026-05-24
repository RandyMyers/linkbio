const express = require('express');
const eventController = require('../controllers/eventController');

const router = express.Router();

router.post('/events', eventController.ingest);

module.exports = router;
