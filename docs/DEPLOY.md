# Deploying to Google Cloud Run

The organisers require the submission to run on Google Cloud. One Cloud Run service serves both
`/api/*` (FastAPI) and the built frontend, from the `Dockerfile` at the repository root.

## One-time setup

```sh
gcloud auth login                       # use the hackathon (Qwiklabs student) account
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## Deploy

From the repository root:

```sh
gcloud run deploy nebulax \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --set-env-vars "LTA_DATAMALL_ACCOUNT_KEY=$LTA_DATAMALL_ACCOUNT_KEY,ONEMAP_TOKEN=$ONEMAP_TOKEN,ONEMAP_EMAIL=$ONEMAP_EMAIL,ONEMAP_PASSWORD=$ONEMAP_PASSWORD"
```

Notes:

- Export the variables from `backend/.env` into your shell first (`set -a; source backend/.env; set +a`).
  On a durable project, prefer Secret Manager (`--set-secrets`); the Qwiklabs student account may
  lack the IAM permissions for it, which is why plain env vars are shown here.
- The frontend build needs the MapTiler key at build time. Cloud Build does not read local env
  files, so pass it as a substitution by uncommenting `ARG VITE_MAPTILER_KEY` usage — or simplest:
  deploy with `--source` after writing `frontend/.env` is NOT enough; instead run
  `gcloud builds submit --tag ... --build-arg` or keep the key in `cloudbuild.yaml`. For the
  hackathon we bake it via `cloudbuild.yaml` (see below).
- First deploy asks to create an Artifact Registry repository — answer yes.
- After the first deploy, add the printed `https://….run.app` URL to the MapTiler key's allowed
  origins, and test `https://….run.app/api/health`.

## cloudbuild.yaml route (used because of the build-arg)

```sh
set -a; source backend/.env; source frontend/.env; set +a
gcloud builds submit --config cloudbuild.yaml \
  --substitutions _MAPTILER_KEY="$VITE_MAPTILER_KEY"
gcloud run deploy nebulax \
  --image asia-southeast1-docker.pkg.dev/$(gcloud config get-value project)/nebulax/app \
  --region asia-southeast1 --allow-unauthenticated \
  --set-env-vars "LTA_DATAMALL_ACCOUNT_KEY=$LTA_DATAMALL_ACCOUNT_KEY,ONEMAP_TOKEN=$ONEMAP_TOKEN,ONEMAP_EMAIL=$ONEMAP_EMAIL,ONEMAP_PASSWORD=$ONEMAP_PASSWORD"
```

## Qwiklabs caveat

The hackathon project (`qwiklabs-gcp-01-…`) is a temporary lab environment. If it expires before
judging, redeploy with the same two commands on a fresh project — nothing else is stored there.
