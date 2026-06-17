# TAPESTRY

**T**umor **A**lternative **PE**diatric **S**plicing visualiza**T**ion and que**RY**

A React web application for exploring tumor-enriched and oncofetal splice junctions (TEJs) in pediatric CNS tumors, built on RNA-seq from the Kids First Pediatric Brain Tumor Atlas (PBTA).

A live deployment is available at **[tapestry.rokitalab.com](https://tapestry.rokitalab.com)**.

## What's here

- **Home** — quick search by gene, histology, or splice event type, plus summary stats across the cohort.
- **Explore** — filter, sort, and page through TEJs; visualize per-junction CPM across tumor histologies, normal-tissue controls, cell lines, and developmental (evo-devo) timepoints; view exon/transcript diagrams; export tables and plots.
- **Docs** — glossary of terms and use-case walkthroughs.
- **About** — data provenance and the people behind the project.

This repo is the frontend only. It calls the [TAPESTRY-API](https://github.com/rokitalab/TAPESTRY-API) (Flask-RESTX), which reads from a PostgreSQL database populated by [TAPESTRY-data-preprocessing](https://github.com/rokitalab/TAPESTRY-data-preprocessing).

## Running with Docker (recommended)

```bash
git clone git@github.com:rokitalab/TAPESTRY.git
cd TAPESTRY
docker compose up --build
```

Then open [http://localhost:5173](http://localhost:5173).

To stop: `docker compose down`

By default the app calls the API at `/tapestry-api` on the same origin. To point it at a separately running API instance, set `VITE_API_BASE` (e.g. `http://localhost:8080/tapestry-api`) before building — see [TAPESTRY-API](https://github.com/rokitalab/TAPESTRY-API) for instructions on running the API and its database locally.

## Running locally (for development)

Requires [Node.js](https://nodejs.org/) v24+.

```bash
npm install
npm run dev
```
