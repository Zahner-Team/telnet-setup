## Installing deps

```bash
yarn install

cd into .\client\ yarn install
```

## Setting env vars

Required:

```bash
$env:USE_MOCK = "true"


## Running

```bash
npm run dev
```

## Deploying Cloud Functions

```bash
cd functions
export FIREBASE_PROJECT_ID=some-project-id
yarn run deploy --project $FIREBASE_PROJECT_ID
```
