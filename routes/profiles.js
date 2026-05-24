const express = require('express');
const profilesController = require('../controllers/profilesController');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.get('/profiles/limits', requireAuth, profilesController.limits);
router.get('/profiles', requireAuth, profilesController.list);
router.post('/profiles', requireAuth, profilesController.create);
router.get('/templates', requireAuth, profilesController.listTemplates);
router.get('/profiles/:id', requireAuth, profilesController.getOne);
router.patch('/profiles/:id', requireAuth, profilesController.patchOne);
router.post('/profiles/:id/apply-template', requireAuth, profilesController.applyTemplate);
router.post('/profiles/:id/publish', requireAuth, profilesController.publishOne);
router.post('/profiles/:id/activate', requireAuth, profilesController.activate);
router.delete('/profiles/:id', requireAuth, profilesController.remove);

module.exports = router;
