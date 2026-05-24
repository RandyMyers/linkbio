const express = require('express');
const adminController = require('../controllers/adminController');
const adminUsersController = require('../controllers/adminUsersController');
const adminProfilesController = require('../controllers/adminProfilesController');
const adminPlansController = require('../controllers/adminPlansController');
const adminBillingController = require('../controllers/adminBillingController');
const adminGatewaysController = require('../controllers/adminGatewaysController');
const adminPaymentMethodsController = require('../controllers/adminPaymentMethodsController');
const adminSettingsController = require('../controllers/adminSettingsController');
const adminAnalyticsController = require('../controllers/adminAnalyticsController');
const adminSubscriptionsController = require('../controllers/adminSubscriptionsController');
const adminPromoCodesController = require('../controllers/adminPromoCodesController');
const adminMarketingController = require('../controllers/adminMarketingController');
const adminCryptoPaymentsController = require('../controllers/adminCryptoPaymentsController');
const { requireAuth } = require('../middleware/requireAuth');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/admin/auth/me', adminController.me);
router.get('/admin/overview', adminController.overview);
router.get('/admin/stats', adminController.stats);

router.get('/admin/analytics/timeseries', adminAnalyticsController.timeseries);
router.get('/admin/analytics/plans-distribution', adminAnalyticsController.plansDistribution);
router.get('/admin/analytics/geo', adminAnalyticsController.geo);
router.get('/admin/analytics/referrers', adminAnalyticsController.referrers);
router.get('/admin/analytics/revenue', adminAnalyticsController.revenue);
router.get('/admin/subscriptions/metrics', adminSubscriptionsController.getMetrics);
router.get('/admin/subscriptions/users', adminSubscriptionsController.listUsers);
router.get('/admin/subscriptions/export.csv', adminSubscriptionsController.exportCsv);
router.get('/admin/promo-codes', adminPromoCodesController.listPromoCodes);
router.post('/admin/promo-codes', adminPromoCodesController.createPromoCode);
router.patch('/admin/promo-codes/:id', adminPromoCodesController.patchPromoCode);

router.get('/admin/crypto-payments', adminCryptoPaymentsController.listCryptoPayments);
router.get('/admin/crypto-payments/:orderId', adminCryptoPaymentsController.getCryptoPayment);
router.post(
  '/admin/crypto-payments/:orderId/reconcile',
  adminCryptoPaymentsController.reconcileCryptoPayment,
);

router.get('/admin/users', adminUsersController.listUsers);
router.get('/admin/users/:id', adminUsersController.getUser);
router.patch('/admin/users/:id', adminUsersController.patchUser);
router.post('/admin/users/:id/suspend', adminUsersController.suspendUser);
router.post('/admin/users/:id/unsuspend', adminUsersController.unsuspendUser);

router.get('/admin/profiles', adminProfilesController.listProfiles);
router.get('/admin/profiles/:id', adminProfilesController.getProfile);
router.patch('/admin/profiles/:id', adminProfilesController.patchProfile);

router.get('/admin/plans', adminPlansController.listAll);
router.get('/admin/plans/:slug', adminPlansController.getBySlug);
router.post('/admin/plans', adminPlansController.create);
router.patch('/admin/plans/:slug', adminPlansController.patchBySlug);
router.delete('/admin/plans/:slug', adminPlansController.removeBySlug);
router.get('/admin/payment-requests', adminBillingController.listPaymentRequests);
router.post('/admin/payment-requests/:id/decide', adminBillingController.decidePaymentRequest);

router.get('/admin/gateways', adminGatewaysController.listGateways);
router.patch('/admin/gateways/runtime-mode', adminGatewaysController.patchRuntimeMode);
router.get('/admin/gateways/:provider', adminGatewaysController.getGateway);
router.put('/admin/gateways/:provider', adminGatewaysController.upsertGateway);
router.post('/admin/gateways/:provider/test', adminGatewaysController.testGateway);
router.delete('/admin/gateways/:provider', adminGatewaysController.deleteGateway);

router.get('/admin/payment-methods', adminPaymentMethodsController.listPaymentMethods);
router.post('/admin/payment-methods', adminPaymentMethodsController.createPaymentMethod);
router.patch('/admin/payment-methods/:slug', adminPaymentMethodsController.patchPaymentMethod);
router.delete('/admin/payment-methods/:slug', adminPaymentMethodsController.deletePaymentMethod);

router.get('/admin/settings', adminSettingsController.getSettings);
router.patch('/admin/settings', adminSettingsController.patchSettings);

router.get('/admin/marketing/settings', adminMarketingController.getMarketingSettings);
router.patch('/admin/marketing/settings', adminMarketingController.patchMarketingSettings);
router.post('/admin/marketing/settings/test', adminMarketingController.testMarketingConnection);
router.post('/admin/marketing/settings/provision-merge-fields', adminMarketingController.provisionMergeFields);
router.post('/admin/marketing/settings/register-webhook', adminMarketingController.registerWebhook);
router.get('/admin/marketing/settings/webhook-info', adminMarketingController.getWebhookInfo);
router.get('/admin/marketing/lead-fields', adminMarketingController.getLeadFieldDefinitions);
router.get('/admin/marketing/quota', adminMarketingController.getQuota);

router.get('/admin/marketing/leads/export.csv', adminMarketingController.exportLeadsCsv);
router.post('/admin/marketing/leads/bulk-update', adminMarketingController.bulkUpdateLeads);
router.post('/admin/marketing/leads', adminMarketingController.createLead);
router.get('/admin/marketing/leads/stats', adminMarketingController.getLeadStats);
router.get('/admin/marketing/leads', adminMarketingController.listLeads);
router.get('/admin/marketing/leads/:id', adminMarketingController.getLead);
router.patch('/admin/marketing/leads/:id', adminMarketingController.patchLead);
router.delete('/admin/marketing/leads/:id', adminMarketingController.deleteLead);
router.post('/admin/marketing/leads/:id/sync', adminMarketingController.syncLead);

router.get('/admin/marketing/analytics/conversions-by-country', adminMarketingController.getAnalyticsConversionsByCountry);
router.get('/admin/marketing/analytics/conversions-by-language', adminMarketingController.getAnalyticsConversionsByLanguage);
router.get('/admin/marketing/analytics/funnel', adminMarketingController.getAnalyticsFunnel);
router.get('/admin/marketing/analytics/campaigns/:id/geo', adminMarketingController.getCampaignGeoAnalytics);

router.get('/admin/marketing/health', adminMarketingController.getMarketingHealth);
router.post('/admin/marketing/sync-queue/run', adminMarketingController.runSyncQueue);

router.get('/admin/marketing/campaigns', adminMarketingController.listCampaigns);
router.post('/admin/marketing/campaigns', adminMarketingController.createCampaign);
router.get('/admin/marketing/campaigns/:id', adminMarketingController.getCampaign);
router.patch('/admin/marketing/campaigns/:id', adminMarketingController.patchCampaign);
router.delete('/admin/marketing/campaigns/:id', adminMarketingController.deleteCampaign);
router.post('/admin/marketing/campaigns/:id/preview-recipients', adminMarketingController.previewCampaignRecipients);
router.post('/admin/marketing/campaigns/:id/test', adminMarketingController.sendCampaignTest);
router.get('/admin/marketing/campaigns/:id/checklist', adminMarketingController.getCampaignChecklist);
router.post('/admin/marketing/campaigns/:id/send', adminMarketingController.sendCampaign);
router.post('/admin/marketing/campaigns/:id/schedule', adminMarketingController.scheduleCampaign);
router.post('/admin/marketing/campaigns/:id/unschedule', adminMarketingController.unscheduleCampaign);
router.get('/admin/marketing/campaigns/:id/report', adminMarketingController.getCampaignReport);

router.post('/admin/marketing/imports/upload', adminMarketingController.uploadImport);
router.post('/admin/marketing/imports/:batchId/preview', adminMarketingController.previewImport);
router.post('/admin/marketing/imports/:batchId/execute', adminMarketingController.executeImport);
router.get('/admin/marketing/imports/:batchId/errors.csv', adminMarketingController.exportImportErrorsCsv);
router.get('/admin/marketing/imports', adminMarketingController.listImports);
router.get('/admin/marketing/imports/:batchId', adminMarketingController.getImport);

router.get('/admin/marketing/import-templates', adminMarketingController.listImportTemplates);
router.post('/admin/marketing/import-templates', adminMarketingController.createImportTemplate);
router.patch('/admin/marketing/import-templates/:id', adminMarketingController.patchImportTemplate);
router.delete('/admin/marketing/import-templates/:id', adminMarketingController.deleteImportTemplate);

module.exports = router;
