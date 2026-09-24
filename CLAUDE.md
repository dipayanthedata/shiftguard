# ShiftGuard Hackathon Project — Constraints & Working Agreement

## Working Directory

`~/dev/shiftguard` (was `/private/tmp/shiftguard` in Session 1; macOS /tmp is ephemeral)

## Project Context

ShiftGuard: Heat-and-smoke exposure planner for outdoor work crews. Heat resilience / climate adaptation category. Deadline: Oct 2, 2026. Session 1 goal: Deploy empty app to public URL (pass/fail gate); features come later.

## AWS Environment

- **Account:** 298947080428
- **Region:** us-west-2 (exclusive)
- **Profile:** `shiftguard-agent` (assumed-role/zero-to-shipped-agent/shiftguard-agent-session)
- **CloudTrail:** Enabled, trails to s3://shiftguard-trail-298947080428
- **Bootstrap:** Already run in us-west-2

**Golden rule:** Always use `--profile shiftguard-agent`. If a command fails with AccessDenied, stop and show the exact API call and error. Do not fall back to personal profile, do not add wildcards, do not widen policy yourself.

## Tech Stack (No Negotiation)

- **CDK v2 in TypeScript.** Lambda handlers in TypeScript via NodejsFunction.
- **Toolchain:** One `npm install` covers everything; no separate frontend build step.
- **Serverless only:** S3 + CloudFront for static site, Lambda Function URL for /api/*, DynamoDB on-demand, no VPC/Fargate/RDS/NAT.

## Architecture

- S3 bucket: Static frontend (index.html, styles.css), private (OAC, no public access)
- CloudFront distribution, two behaviors:
  - Default: S3 origin, serving web/
  - /api/*: Lambda Function URL origin, caching disabled (CachePolicy.CACHING_DISABLED)
- Lambda: Single Function URL returning JSON response, TypeScript handler
- DynamoDB: Single table on-demand, pk/sk, TTL attribute
- Budget alarm: $20 USD, part of stack (must deploy in first CDK deploy)

## Stack & Naming

- **Stack name:** ShiftGuardStack
- **Bucket:** shiftguard-<ACCOUNT>-app (private, OAC, no website hosting)
- **Distribution:** CloudFront distribution with /api/* behavior
- **Lambda function:** health-handler (or similar, via NodejsFunction)
- **DynamoDB table:** shiftguard-data or similar (pk, sk, ttl attribute)

## Git & Identity

**Local git config (per repo, not global):**
```bash
git config user.name "Dipayan Das"
git config user.email "297210783+dipayanthedata@users.noreply.github.com"
```

**Rules:**
- No employer name, no employer email anywhere (commit metadata, code, docs, comments)
- Commit frequently with small, labeled increments
- Show `cdk synth` diff before deploy
- Do not rewrite git history without asking

## Session 1 Scope

1. ✓ Scaffold repo (done: bin/, lib/, lambda/health/, web/, docs/)
2. CDK stack: bucket, distribution, Lambda, DynamoDB, budget alarm
3. index.html: plain HTML/CSS, calls /api/health and renders response
4. Deploy to us-west-2
5. Test: both / and /api/health return 200 from CloudFront domain (public internet, not raw URLs)
6. docs/EVIDENCE.md: log setup phase and deployment

**Out of scope this session:** Weather APIs, air quality, exposure engine, Bedrock, Spanish, auth, CI/CD, custom domains, tests beyond smoke test.

## Before Any Deployment

- Run `cdk synth --profile shiftguard-agent` and show me the diff
- Show me S3 bucket policy before deploy (must use OAC, no public access)
- Confirm Lambda gets Function URL in template
- Confirm /api/* behavior in distribution is set to caching-disabled

## If Something Fails

- Show me the exact error message and the API call that produced it
- Do not retry, do not widen permissions, do not fall back to another profile
- Wait for approval before fixing

## Design Decisions (Ratified)

- No aws:RequestedRegion condition on IAM policy (CloudFront/global calls sign to us-east-1)
- No separate frontend build; plain HTML/CSS only
- Budget alarm at $20 (project cost gate)
- Single DynamoDB table (eventual schema expansion via new GSIs, not new tables)
- CloudFront distribution required even though Lambda has public Function URL (gate requires "live at public URL"; CloudFront domain is the public URL for session 1)
