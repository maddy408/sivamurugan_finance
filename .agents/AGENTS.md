# Project Rules for Siva Murugan Finance

## Database Schema & Migration Rule
- Whenever any database schema change (INSERT, ALTER, UPDATE, DELETE) is performed, ALWAYS create a migration SQL file in `database/migrations/` with format: `YYYYMMDD_HHMMSS_relevant_name.sql`.
- Update `database/schema.sql` and `database/seed.sql` to maintain master schema consistency.
- Always commit and push the migration SQL file to Git.

## Deployment Rule
- To deploy to DEV: MUST be on `dev` branch and MUST run `git push origin dev` BEFORE running `python deploy.py --env dev`.
- To deploy to PRODUCTION: MUST be on `main` branch and MUST run `git push origin main` BEFORE running `python deploy.py --env prod`.
- `python deploy.py` auto-checks branch and enforces pushing to Git before uploading.
- Keep `deploy.py` in `.gitignore` or `scratch/` and NEVER delete or push deployment secret credentials to Git.
