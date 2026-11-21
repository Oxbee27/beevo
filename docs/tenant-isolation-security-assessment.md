# Beevo Tenant Isolation Security Assessment

**Assessment date:** 21 November 2026
**Project:** Beevo — Smart Customer Enquiry and Sales Follow-Up CRM
**Assessment area:** Multi-business tenant isolation
**Status:** Local integration tests passed; production checks completed with documented limitations.

## 1. Purpose

Beevo supports multiple businesses using the same application. Each business must only access its own customers, enquiries, follow-ups, products, product interests, conversations, messages, wallet records, transactions and staff.

This assessment evaluates whether business-level data boundaries are enforced and whether staff accounts remain restricted to their own business.

## 2. Security objectives

1. Business A cannot read Business B's customers, enquiries or follow-ups.
2. Business A cannot update or delete Business B's records.
3. Business A cannot access Business B's products or product interests.
4. Business A cannot access Business B's conversations or messages.
5. Business A cannot access Business B's wallet or transactions.
6. Staff from one business cannot access another business's records.

## 3. Local integration testing

Existing test file: backend/tests/tenant-isolation.integration.test.js

Tests were executed against the dedicated local test database, beevo_test, not the production database.

Command: BEEVO_RUN_DB_INTEGRATION_TESTS=true DB_HOST=localhost DB_PORT=5432 DB_NAME=beevo_test npm test -- tests/tenant-isolation.integration.test.js

### Result

**28 of 28 tests passed.**

Coverage included customer, enquiry, follow-up, product, product-interest, conversation, message, wallet, transaction, staff, role and dashboard isolation.

## 4. Production API verification

Production API: https://beevo.onrender.com

Two separately authenticated business-owner accounts with different business identifiers were used.

### Customers, enquiries and follow-ups

Both accounts retrieved their own lists. Cross-business direct-access checks for available customer, enquiry and follow-up records were denied with HTTP 403 or 404 responses. Some reverse-direction checks were inconclusive because the relevant business had no records of that type.

### Products and product interests

Both businesses received successful responses from the products endpoint, but neither had products available for meaningful direct cross-business testing. Production product-interest isolation remains inconclusive.

### Conversations and messages

Neither business had conversations available for direct cross-business testing. Production conversation and message isolation remains inconclusive.

### Staff

Neither business had staff records available for direct cross-business testing. Source inspection found business-scoped staff retrieval and update conditions, including ownership checks during staff creation and updates.

### Wallet and transactions

Both businesses retrieved wallet information whose ownership corresponded to the authenticated business. No transactions were available for direct cross-business transaction-ID testing. Source inspection found business-scoped wallet and transaction retrieval and ownership checks during funding and verification.

### Dashboard

Both businesses retrieved dashboard summaries with different business-level customer and enquiry totals, consistent with the records available to each account.

## 5. Source-code review

Targeted inspection covered customer, enquiry, follow-up, product, product-interest, conversation, messaging, staff and wallet services. The review found business ownership conditions in relevant queries and operations, including business_id filters, related-record ownership checks, scoped retrieval and updates, and business-scoped wallet and transaction queries.

This is supporting source-level evidence, not a formal line-by-line audit of every SQL statement.

## 6. Findings and limitations

- Local tenant-isolation integration tests: 28 passed.
- Production customer, enquiry and follow-up checks: available cross-business records were denied.
- Production wallet ownership and dashboard results: consistent with business-level separation.
- Production products, product interests, conversations, messages, staff and transactions: inconclusive because suitable records were unavailable.
- Production update and delete attempts were not performed because they could modify or destroy real business data.
- Local integration results do not independently prove every production deployment or database configuration.

## 7. Overall conclusion

The local tenant-isolation integration suite passed all 28 tests. Production checks did not reveal a confirmed cross-business data exposure in the records examined. Wallet ownership and dashboard results were consistent with business-level separation. Targeted source inspection also found business-scoped access conditions across the inspected services.

Some production checks remain inconclusive because the accounts did not contain suitable records for direct cross-business testing.

**Assessment conclusion:** Beevo tenant-isolation controls passed the available local integration tests and have supporting production and source-code evidence. Further populated-data production or staging verification is recommended before describing every scenario as independently verified in production.

## 8. Evidence to retain

1. tenant-isolation.integration.test.js.
2. Terminal output showing all 28 tests passing.
3. Production API verification results, excluding credentials and session cookies.
4. Relevant business-scoped service queries.
5. This assessment document.

Never include passwords, authentication cookies, access tokens or database credentials in submitted evidence.

## 9. Recommended next security assessment

- Authentication and session security.
- Token expiration and revocation.
- Staff permission enforcement.
- CSRF and CORS protection.
- Login and password-reset rate limiting.
- Password-reset token security.
- Input validation and safe error handling.

## 10. Authentication and Session Security Assessment

### 10.1 Assessment objectives

This assessment evaluated authentication enforcement, JWT validation,
session expiration, and server-side session revocation.

### 10.2 Security controls verified

The following controls were reviewed and tested:

- JWT authentication uses HS256 algorithm verification.
- JWT tokens have a configured expiration, defaulting to one hour.
- Authentication middleware validates token claims and user identity.
- Inactive user accounts are rejected.
- Token versions are checked against the database.
- Password changes and password resets invalidate existing sessions
  through token-version increments.
- Protected business routes require authentication.
- Logout requires an authenticated session.
- Successful logout increments the user's token version.
- Previously issued tokens become invalid after successful logout.
- Authentication cookies are configured as HttpOnly.

### 10.3 Logout and session revocation

The logout implementation now performs server-side session revocation.

When a user logs out, Beevo increments the user's token version and
clears the authentication cookie. Previously issued tokens for that
user are consequently rejected by the authentication middleware.

This implementation invalidates all active sessions belonging to
the affected user, including sessions on other devices.

### 10.4 Automated test evidence

On 21 November 2026, the targeted authentication and application tests
passed:

- 15 tests passed across 2 test files.

The complete automated test suite also passed:

- 415 tests passed.
- 41 tests skipped.
- 51 test files passed.
- 4 test files skipped.
- No test failures.

The skipped tests include database integration tests that require
their dedicated test environment configuration.

### 10.5 Assessment conclusion

The authentication and session-management improvements passed the
automated tests executed during this assessment.

Server-side logout revocation closes the previous weakness where
clearing the browser cookie alone did not invalidate a copied JWT.

Further production verification and review of authentication
configuration remain recommended before considering the security
assessment complete.


### 10.6 Production environment configuration validation

Production startup validation now checks:

- JWT secret has at least 32 characters.
- JWT expiration uses a supported positive duration.
- Cookie lifetime is a positive integer when configured.
- Cookie lifetime does not exceed JWT lifetime.
- SameSite cookie configuration uses a supported value.
- PostgreSQL SSL and CA certificate requirements remain enforced.

Five additional automated tests cover these configuration checks.
The complete test suite passed after these changes on 21 November 2026.


## 11. Production HTTPS and HTTP Security Assessment

### 11.1 Production availability

On 21 November 2026, the Beevo production API was checked.

- Production URL: https://beevo.onrender.com
- GET /health returned HTTP 200.
- GET / returned HTTP 200.
- Both endpoints returned the expected Beevo API responses.
- Responses identified Render as the origin server.

### 11.2 HTTPS and transport security

- HTTPS connection succeeded.
- TLS certificate verification passed.
- Strict-Transport-Security was present with a one-year
  max-age and includeSubDomains.
- X-Content-Type-Options was set to nosniff.
- X-Frame-Options was set to SAMEORIGIN.
- Referrer-Policy was set to no-referrer.

### 11.3 Content and browser security

The production response included a Content Security Policy
restricting scripts, objects, framing, and resource loading.

CORS returned the expected frontend origin:
https://beevo-wheat.vercel.app

### 11.4 Deployment verification limitation

The public health and root endpoints did not expose a deployment
commit identifier or application version.

Consequently, these checks confirm the observed production HTTP
security configuration but do not establish whether the latest
local authentication and environment-validation changes have
been deployed.

### 11.5 Conclusion

The observed production HTTPS connection, TLS verification,
availability, and inspected security headers passed this check.

Further deployment-version verification is required before
claiming that the latest local authentication improvements are
active in production.


## 12. Production Dependency Vulnerability Assessment

### 12.1 Audit execution

On 21 November 2026, the backend production dependencies were audited using:

`npm audit --omit=dev`

The audit completed successfully and returned:

`found 0 vulnerabilities`

### 12.2 Assessment

The audit reported no known vulnerabilities in the installed production dependency tree at the time of assessment.

Development dependencies were excluded from this audit. Therefore, this result should not be interpreted as confirmation that development dependencies are vulnerability-free.

### 12.3 Security conclusion

Beevo's production dependency audit completed successfully with zero reported vulnerabilities. This provides additional evidence for the project's dependency security assessment.

Dependency audits should be repeated periodically, particularly after dependency updates and before production releases.


## 13. Consolidated Graduation Project Security Evaluation

### 13.1 Executive summary

This consolidated evaluation brings together the tenant-isolation,
authentication, session-management, production HTTPS, and dependency
audit findings recorded in this assessment.

Beevo implements a multi-business security model in which business
records are scoped to the authenticated business. The reviewed
application services contain business ownership conditions, and the
dedicated local tenant-isolation integration suite passed all 28 tests.

Authentication and session-management improvements also passed the
recorded automated tests. Production HTTPS, TLS certificate
verification, API availability, and inspected HTTP security headers
were successfully checked. The production dependency audit reported
zero vulnerabilities in the installed production dependency tree.

The available evidence supports a positive assessment of Beevo's
security implementation. However, some production scenarios remain
inconclusive, and the latest local authentication changes have not
been independently confirmed as deployed.

### 13.2 Consolidated security findings

| Security area | Available evidence | Evaluation |
|---|---|---|
| Tenant isolation | 28 of 28 dedicated local integration tests passed; available production cross-business checks were denied | Passed locally; partially verified in production |
| Business data ownership | Targeted source review found business-scoped queries and ownership checks | Supporting source-level evidence |
| Staff and role boundaries | Role, staff and permission controls were included in the local isolation assessment and source review | Further populated-data production verification recommended |
| Authentication | JWT validation, account status and token-version checks reviewed and tested | Passed recorded automated tests |
| Session revocation | Logout increments token version and invalidates previously issued tokens | Passed local tests; production deployment not confirmed |
| Environment configuration | Production startup validation covers JWT, cookie and database SSL configuration | Local validation evidence available |
| HTTPS and TLS | Production HTTPS connection and certificate verification succeeded | Passed observed production checks |
| HTTP security headers | HSTS, content-type protection, frame protection, referrer policy and CSP observed | Passed observed production checks |
| CORS | Production response returned the expected frontend origin | Configuration observed; not a complete CSRF assessment |
| Production dependencies | `npm audit --omit=dev` reported zero vulnerabilities | Passed for audited production dependencies |

### 13.3 Consolidated automated test evidence

The recorded test results are:

- Tenant-isolation integration tests: 28 passed.
- Targeted authentication and application tests: 15 passed.
- Complete automated test suite: 415 passed and 41 skipped.
- Test files in the complete suite: 51 passed and 4 skipped.
- No failures were reported in the complete suite.
- Five additional automated tests were added for production
  environment configuration validation.
- Production dependency audit: zero reported vulnerabilities.

The dedicated tenant-isolation test run used the local `beevo_test`
database. These results demonstrate the behaviour tested in that
environment and should not be represented as proof that every
production scenario was exercised.

### 13.4 Production verification boundaries

The production checks provide evidence for the API endpoints,
transport security, response headers, and the available business
records examined.

The following limitations remain:

1. Production products, product interests, conversations, messages,
   staff and transaction isolation could not all be tested directly
   because suitable records were unavailable.
2. Production update and delete operations were deliberately not
   attempted to avoid modifying or destroying real business data.
3. The production API did not expose a deployment version or commit
   identifier. The latest local authentication and environment
   validation improvements therefore cannot yet be confirmed as live.
4. A successful production dependency audit of the local installed
   dependency tree does not independently establish the dependency
   state of the deployed server.
5. The 41 skipped automated tests were not counted as passed tests.

### 13.5 Residual risks and recommended improvements

The following items should remain in the security improvement plan:

- Confirm which application version is deployed before claiming that
  the latest authentication and logout changes are active in production.
- Perform controlled tenant-isolation verification in a staging
  environment containing representative records for every business
  resource.
- Review CSRF protections for cookie-authenticated state-changing
  requests. CORS and HttpOnly cookies alone should not be treated as
  complete CSRF protection.
- Verify login and password-reset rate limiting and password-reset
  token expiry, single-use behaviour and invalidation.
- Review authorization enforcement for owner, staff and custom-role
  permissions across sensitive operations.
- Continue reviewing input validation, safe error handling, audit
  logging, database access restrictions and backup security.
- Repeat dependency audits periodically, including a separate review
  of development dependencies where appropriate.

These are recommended verification and improvement activities;
they are not claims that a vulnerability has been confirmed.

### 13.6 Overall graduation-project security evaluation

Based on the evidence recorded in Sections 3–12, Beevo demonstrates
a meaningful security foundation for a multi-business customer
enquiry and sales follow-up CRM.

The strongest evidence is the successful dedicated tenant-isolation
integration suite, the tested authentication and session-revocation
implementation, the observed production HTTPS configuration, and
the clean production dependency audit.

The assessment also demonstrates a distinction between automated
local testing, source-code review and live production verification.
This distinction is important when interpreting the results and
presenting the project academically.

**Overall assessment: Positive, with outstanding production
verification items.**

The available evidence supports the conclusion that the tested
tenant-isolation and authentication controls behaved as expected
in the local test environment, and that the inspected production
endpoints demonstrated the recorded transport and HTTP security
controls. It does not establish that every security scenario has
been independently verified in production.

### 13.7 Evidence and academic reporting guidance

The following materials should be retained as supporting evidence:

1. This consolidated security assessment.
2. The existing tenant-isolation integration test file.
3. Terminal output for the 28 passing tenant-isolation tests.
4. Full-suite and targeted authentication test results.
5. Environment validation test results.
6. Production HTTPS, TLS and HTTP-header verification output.
7. The production dependency audit output.
8. Relevant source-code excerpts showing business-scoped access
   and session-revocation logic.

Credentials, passwords, access tokens, session cookies and database
connection secrets must not be included in submitted evidence.

For the graduation report, describe the results as a security
assessment of the implemented prototype, clearly identifying the
test environment, production checks, limitations and future work.

## 14. Google Sign-In Integration and Regression Verification

### 14.1 Google authentication implementation

On 21 November 2026, Google sign-in integration was added to Beevo using Google Identity Services and backend ID-token verification.

The implementation:
- Verifies Google ID tokens on the backend.
- Requires a verified Google email address.
- Matches the verified email to an existing Beevo account.
- Preserves the existing business association, role and permissions.
- Rejects unknown Google accounts rather than automatically creating accounts.
- Issues Beevo's existing authentication cookie and JWT after successful verification.
- Applies the existing login rate limiter to the Google authentication endpoint.

### 14.2 Automated Google authentication tests

Four Google authentication scenarios were added to the existing authentication test suite:
- Missing Google credential is rejected.
- Unconfigured Google authentication returns a service-unavailable response.
- A verified Google identity matching an existing Beevo account is accepted.
- An unverified Google email is rejected.

The targeted authentication, API and environment-validation suites passed 32 of 32 tests.

### 14.3 Full backend regression test

The complete backend test suite was executed on 21 November 2026.

| Result | Tests |
|---|---:|
| Passed | 419 |
| Skipped | 41 |
| Failed | 0 |
| Total | 460 |

A total of 51 test files passed, while 4 integration-test files were skipped because they require dedicated integration-test conditions.

### 14.4 Verification boundary

The automated Google authentication tests confirm the implemented backend behaviour under mocked Google identity verification. A real Google OAuth Client ID has not yet been configured, and an end-to-end sign-in using a real Google account has not yet been completed.

These results therefore demonstrate successful local implementation and regression testing, not completed production Google sign-in verification.
