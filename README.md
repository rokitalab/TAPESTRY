# TAPESTRY

**T**umor **A**lternative **PE**diatric **S**plicing visualiza**T**ion and que**RY**

A React web application for exploring tumor-enriched and oncofetal splice junctions (TEJs) in pediatric CNS tumors, built on RNA-seq from the Kids First Pediatric Brain Tumor Atlas (PBTA).

A live deployment is available at **[tapestry.rokitalab.com](https://tapestry.rokitalab.com)**.

## What's here

- **Home** — quick search by gene, histology, or splice event type, plus summary stats across the cohort.
- **Explore** — filter, sort, and page through TEJs; visualize per-junction CPM across tumor histologies, normal-tissue controls, cell lines, and developmental (evo-devo) timepoints; view exon/transcript diagrams; export tables and plots.
- **Junction Expression** — heatmap of a gene's junction expression across tumor histologies and normal-tissue controls, shown above the gene model and its transcripts.
- **Docs** — how the data is built, glossary of terms, protein domains, use-case walkthroughs, raw data availability, the people behind the project, and how to cite TAPESTRY.
- **Release Notes** — what changed in each release.
- **Publication** — link to the TAPESTRY preprint ([arXiv:2610.31816](https://doi.org/10.48550/arXiv.2610.31816)).

This repo is the frontend only. It calls the [TAPESTRY-API](https://github.com/rokitalab/TAPESTRY-API) (Flask-RESTX), which reads from a PostgreSQL database populated by [TAPESTRY-data-preprocessing](https://github.com/rokitalab/TAPESTRY-data-preprocessing).

## Citation

If you use TAPESTRY in your work, please cite:

> Sullivan PJ, Corbett RJ, Di C, Sickler A, Babaei A, Goswami M, Rokita JL. TAPESTRY: an interactive resource for exploring tumor-enriched splice junctions in pediatric brain tumors. *arXiv*:2610.31816 [q-bio.GN], 2026. https://doi.org/10.48550/arXiv.2610.31816

```bibtex
@misc{sullivan2026tapestry,
  title         = {TAPESTRY: an interactive resource for exploring tumor-enriched splice junctions in pediatric brain tumors},
  author        = {Sullivan, Patricia J. and Corbett, Ryan J. and Di, Chao and Sickler, Alex and Babaei, Aylar and Goswami, Meghali and Rokita, Jo Lynne},
  year          = {2026},
  eprint        = {2610.31816},
  archivePrefix = {arXiv},
  primaryClass  = {q-bio.GN},
  doi           = {10.48550/arXiv.2610.31816},
  url           = {https://doi.org/10.48550/arXiv.2610.31816}
}
```

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
