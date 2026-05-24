const express = require('express');
const plansController = require('../controllers/plansController');

const router = express.Router();

router.get('/plans', plansController.listPublic);

module.exports = router;
