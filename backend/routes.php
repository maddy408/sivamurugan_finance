<?php
/**
 * API route table. $router is provided by public/index.php.
 * Every protected handler calls Guard::authorize() internally, which enforces
 * authentication + session version + permission + assignment scope.
 *
 * @var \App\Core\Router $router
 */

use App\Controllers\AuthController;
use App\Controllers\AuditController;
use App\Controllers\CollectionController;
use App\Controllers\CustomerController;
use App\Controllers\DashboardController;
use App\Controllers\DistributionController;
use App\Controllers\EmployeeController;
use App\Controllers\ExpenseController;
use App\Controllers\ExportController;
use App\Controllers\IncomeController;
use App\Controllers\LoanController;
use App\Controllers\MetaController;
use App\Controllers\PendingController;
use App\Controllers\ReportController;
use App\Controllers\SettingsController;
use App\Core\Request;
use App\Core\Response;

$auth       = new AuthController();
$customers  = new CustomerController();
$loans      = new LoanController();
$collection = new CollectionController();
$employees  = new EmployeeController();
$audit      = new AuditController();
$meta       = new MetaController();
$expenses   = new ExpenseController();
$income     = new IncomeController();
$reports    = new ReportController();
$settings   = new SettingsController();
$dashboard  = new DashboardController();
$exports    = new ExportController();
$pending    = new PendingController();
$distributions = new DistributionController();

/* ---- health ---- */
$router->get('/api/health', fn(Request $r) => Response::ok(['status' => 'ok', 'time' => date('c')]));

/* ---- auth ---- */
$router->post('/api/auth/login',  [$auth, 'login']);
$router->post('/api/auth/logout', [$auth, 'logout']);
$router->get('/api/auth/me',      [$auth, 'me']);

/* ---- dashboard ---- */
$router->get('/api/dashboard', [$dashboard, 'index']);

/* ---- pending dues ---- */
$router->get('/api/pending-dues',        [$pending, 'index']);
$router->get('/api/pending-dues/export', [$pending, 'export']);

/* ---- xlsx exports ---- */
$router->get('/api/export/customers',   [$exports, 'customers']);
$router->get('/api/export/chits',       [$exports, 'chits']);
$router->get('/api/export/collections', [$exports, 'collections']);
$router->get('/api/export/employees',   [$exports, 'employees']);

/* ---- meta / lookups ---- */
$router->get('/api/meta/bootstrap',    [$meta, 'bootstrap']);
$router->get('/api/meta/translations', [$meta, 'translations']);

/* ---- customers ---- */
$router->get('/api/customers',        [$customers, 'index']);
$router->post('/api/customers',       [$customers, 'store']);
$router->get('/api/customers/{id}',   [$customers, 'show']);
$router->put('/api/customers/{id}',   [$customers, 'update']);
$router->delete('/api/customers/{id}',[$customers, 'destroy']);

/* ---- loans / chits ---- */
$router->get('/api/loans/next-code',             [$loans, 'nextCode']);
$router->post('/api/loans/preview',              [$loans, 'preview']);
$router->get('/api/loans',                       [$loans, 'index']);
$router->post('/api/loans',                      [$loans, 'store']);
$router->get('/api/loans/{id}',                  [$loans, 'show']);
$router->put('/api/loans/{id}',                  [$loans, 'update']);
$router->delete('/api/loans/{id}',               [$loans, 'destroy']);
$router->post('/api/loans/{id}/cancel',          [$loans, 'cancel']);
$router->post('/api/loans/{id}/generate-schedule',[$loans, 'generateSchedule']);

/* ---- distributions (actual money handed to the customer for a chit) ---- */
$router->get('/api/distributions',                [$distributions, 'index']);
$router->get('/api/loans/{id}/distributions',     [$distributions, 'forLoan']);
$router->post('/api/loans/{id}/distributions',    [$distributions, 'store']);
$router->put('/api/distributions/{id}',           [$distributions, 'update']);
$router->post('/api/distributions/{id}/cancel',   [$distributions, 'cancel']);

/* ---- collection ---- */
$router->get('/api/collection/workload',              [$collection, 'workload']);
$router->get('/api/collections',                      [$collection, 'index']);
$router->get('/api/collections/{id}',                 [$collection, 'show']);
$router->post('/api/collections',                     [$collection, 'store']);
$router->post('/api/collections/{id}/cancel',         [$collection, 'cancel']);
$router->post('/api/collections/{id}/reverse',        [$collection, 'reverse']);
$router->delete('/api/collections/{id}',              [$collection, 'destroy']);


/* ---- employees / permissions ---- */
$router->get('/api/employees',                       [$employees, 'index']);
$router->post('/api/employees',                      [$employees, 'store']);
$router->get('/api/employees/{id}',                  [$employees, 'show']);
$router->put('/api/employees/{id}',                  [$employees, 'update']);
$router->post('/api/employees/{id}/active',          [$employees, 'setActive']);
$router->post('/api/employees/{id}/reset-password',  [$employees, 'resetPassword']);
$router->get('/api/employees/{id}/permissions',      [$employees, 'getPermissions']);
$router->put('/api/employees/{id}/permissions',      [$employees, 'updatePermissions']);
$router->post('/api/employees/{id}/force-logout',    [$auth, 'forceLogout']);

/* ---- expenses ---- */
$router->get('/api/expenses',              [$expenses, 'index']);
$router->get('/api/expenses/export',       [$expenses, 'export']);
$router->get('/api/expenses/categories',   [$expenses, 'categories']);
$router->post('/api/expenses',             [$expenses, 'store']);
$router->put('/api/expenses/{id}',         [$expenses, 'update']);
$router->post('/api/expenses/{id}/cancel', [$expenses, 'cancel']);
$router->delete('/api/expenses/{id}',      [$expenses, 'destroy']);

/* ---- office income ---- */
$router->get('/api/income',              [$income, 'index']);
$router->get('/api/income/export',       [$income, 'export']);
$router->get('/api/income/categories',   [$income, 'categories']);
$router->post('/api/income',             [$income, 'store']);
$router->put('/api/income/{id}',         [$income, 'update']);
$router->post('/api/income/{id}/cancel', [$income, 'cancel']);
$router->delete('/api/income/{id}',      [$income, 'destroy']);

/* ---- reports ---- */
$router->get('/api/reports',                   [$reports, 'catalogue']);
$router->get('/api/reports/summary',           [$reports, 'summary']);
$router->get('/api/reports/full-export',       [$reports, 'fullExport']);
$router->get('/api/reports/templates/{type}',  [$reports, 'template']);
$router->get('/api/reports/{name}/export',     [$reports, 'export']);
$router->get('/api/reports/{name}',            [$reports, 'show']);

/* ---- settings ---- */
$router->get('/api/settings',                          [$settings, 'index']);
$router->put('/api/settings/organization',             [$settings, 'updateOrganization']);
$router->post('/api/settings/organization/logo',       [$settings, 'uploadLogo']);
$router->get('/api/settings/organization/logo',        [$settings, 'logo']);
$router->put('/api/settings/schedule',                 [$settings, 'updateSchedule']);
$router->put('/api/settings/locale',                   [$settings, 'updateLocale']);
$router->put('/api/settings/code-format',              [$settings, 'updateCodeFormat']);
$router->put('/api/settings/chit-prefix',              [$settings, 'updateChitPrefix']);
$router->post('/api/settings/fine',                    [$settings, 'createFineRule']);
$router->post('/api/settings/payment-modes',           [$settings, 'savePaymentMode']);
$router->put('/api/settings/payment-modes/{id}',       [$settings, 'savePaymentMode']);
$router->post('/api/settings/accounts',                [$settings, 'saveAccount']);
$router->put('/api/settings/accounts/{id}',            [$settings, 'saveAccount']);
$router->get('/api/settings/translations',             [$settings, 'translations']);
$router->put('/api/settings/translations',             [$settings, 'saveTranslation']);

/* ---- audit ---- */
$router->get('/api/audit-logs', [$audit, 'index']);
