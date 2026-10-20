import {
  Box,
  Typography,
  Divider,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  Link,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Link as RouterLink } from "react-router-dom";
import { RELEASES } from "../releases";

const CURRENT = RELEASES[0];

function Code({ children }) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: "monospace",
        fontSize: "0.85em",
        bgcolor: "action.hover",
        px: 0.6,
        py: 0.1,
        borderRadius: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

const TOC = [
  ["what-is-tapestry", "What is TAPESTRY?"],
  ["release-information", "Release information"],
  ["glossary", "Glossary"],
  ["protein-domains", "Protein domains"],
  ["use-case-walkthroughs", "Use-case walkthroughs"],
  ["raw-data-availability", "Raw data availability"],
  ["resources", "Resources"],
];

const slugify = (title) =>
  TOC.find(([, t]) => t === title)?.[0] ??
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function Section({ title, children, mt = 6 }) {
  return (
    <Box id={slugify(title)} sx={{ mt, scrollMarginTop: 80 }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function GlossaryGroup({ title, rows }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <Table size="small">
        <TableBody>
          {rows.map(([term, def], i) => (
            <TableRow key={i}>
              <TableCell
                sx={{
                  fontWeight: 600,
                  verticalAlign: "top",
                  width: 240,
                  whiteSpace: "normal",
                  borderColor: "divider",
                }}
              >
                {term}
              </TableCell>
              <TableCell
                sx={{ color: "text.secondary", borderColor: "divider" }}
              >
                {def}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function Walkthrough({ title, goal, steps }) {
  return (
    <Accordion variant="outlined" disableGutters sx={{ mb: 2 }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <strong>Goal:</strong> {goal}
        </Typography>
        <List sx={{ listStyleType: "decimal", pl: 4, py: 0 }}>
          {steps.map((step, i) => (
            <ListItem key={i} sx={{ display: "list-item", py: 0.5, pl: 0 }}>
              <Typography variant="body2">{step}</Typography>
            </ListItem>
          ))}
        </List>
      </AccordionDetails>
    </Accordion>
  );
}

export default function Docs() {
  return (
    <Box sx={{ maxWidth: 900, textAlign: "justify" }}>
      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, mb: 1 }}>
        Documentation
      </Typography>
      <Typography color="text.secondary">
        What TAPESTRY does, the terms it uses, and how to work through common
        questions with it.
      </Typography>

      <Divider sx={{ my: 4 }} />

      <Box component="nav" aria-label="Table of contents">
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          Contents
        </Typography>
        <List sx={{ listStyleType: "disc", pl: 4, py: 0 }}>
          {TOC.map(([id, title]) => (
            <ListItem key={id} sx={{ display: "list-item", py: 0.25, pl: 0 }}>
              <Typography variant="body2">
                <Link href={`#${id}`}>{title}</Link>
              </Typography>
            </ListItem>
          ))}
        </List>
      </Box>

      <Divider sx={{ my: 4 }} />

      <Section title="What is TAPESTRY?" mt={0}>
        <Typography sx={{ mb: 2 }}>
          <strong>TAPESTRY</strong> (Tumor Alternative PEdiatric Splicing
          visualizaTion and queRYing) is a web application for exploring
          alternative splicing events that are turned on specifically in
          pediatric CNS (central nervous system) tumors.
        </Typography>
        <Typography sx={{ mb: 2 }}>
          Pediatric brain tumors are notoriously hard to treat, and they
          don&apos;t carry many DNA mutations for the immune system — or
          immunotherapies — to latch onto. But the brain is also home to
          more alternative splicing than almost any other tissue, and tumor
          cells push that even further: skipping exons, keeping introns that
          should&apos;ve been removed, or sliding splice sites around to
          make RNA and protein versions that healthy cells basically never
          produce. TAPESTRY catalogs these events, called{" "}
          <strong>tumor-enriched junctions (TEJs)</strong>, across the
          Pediatric Brain Tumor Atlas (PBTA) cohort, and lets you search,
          filter, visualize, and download them. The code used to identify and
          characterize TEJs is available in the{" "}
          <Link
            href="https://github.com/rokitalab/pbta-tumor-enriched-junctions"
            target="_blank"
            rel="noopener noreferrer"
          >
            pbta-tumor-enriched-junctions
          </Link>{" "}
          repository.
        </Typography>
        <Typography sx={{ mb: 3 }}>
          Because TEJs are largely absent from normal tissue, they are
          candidate targets for tumor-selective therapies — CAR-T cells,
          antibody–drug conjugates (ADCs), and neoantigen-based approaches —
          where hitting a sequence that healthy cells don&apos;t display
          matters for safety as well as efficacy.
        </Typography>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          How the data is built
        </Typography>
        <List sx={{ listStyleType: "decimal", pl: 4, py: 0 }}>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              RNA-seq from PBTA tumor samples and several normal/control
              cohorts (adult GTEx brain, developmental &ldquo;evo-devo&rdquo;
              brain across fetal-to-adult timepoints, normal pediatric brain,
              pediatric brain cell types) is processed with{" "}
              <strong>rMATS</strong> to call splice junctions.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              Each tumor junction&apos;s expression (in CPM) is compared
              against the matched junction&apos;s expression in the normal
              brain reference cohorts (GTEx, postnatal evo-devo, and normal
              pediatric brain), yielding a <strong>fold-change</strong> and{" "}
              <strong>signal-to-noise ratio (SNR)</strong> for each junction.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              Junctions with fold-change &gt; 5 and SNR &gt; 5 against every{" "}
              <em>postnatal</em> control group (and no control group averaging
              10 CPM or more) are called <strong>Tumor-enriched</strong>.
              Tumor-enriched junctions that are also expressed in at least one{" "}
              <em>prenatal</em> evo-devo group (fold-change &gt; 2 and SNR &gt; 2
              against every postnatal group) are called{" "}
              <strong>Oncofetal</strong>.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
            To retain only junctions that are tumor-enriched due to __alternative splicing__ (and not just overall increases in gene expression), tumor and normal rMATS data is __re-queried__ to determine whether each junction identified above is part of a tumor-associated differential splicing event. This also allows for annotation of junctions to splice events (e.g., exon skipping or inclusion, alternative splice site usage, etc.)
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              Junctions are annotated against the reference genome (annotated
              vs. novel), against protein domains (Pfam/UniProt), and
              filtered down to those recurring across multiple samples within
              a tumor histology.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              The resulting table — one row per junction, with per-histology
              recurrence and per-sample CPM — is what TAPESTRY serves through
              its API and renders on the Explore page.
            </Typography>
          </ListItem>
        </List>
      </Section>

      <Section title="Release information">
        <Typography sx={{ mb: 2 }}>
          This is TAPESTRY <strong>{CURRENT.version}</strong>. Its data comes from the{" "}
          <Link
            href="https://github.com/rokitalab/pbta-tumor-enriched-junctions"
            target="_blank"
            rel="noopener noreferrer"
          >
            pbta-tumor-enriched-junctions
          </Link>{" "}
          repository. See the{" "}
          <Link component={RouterLink} to="/release-notes">
            release notes
          </Link>{" "}
          for what changed in each release.
        </Typography>
      </Section>

      <Section title="Glossary">
        <GlossaryGroup
          title="Core concepts"
          rows={[
            [
              <>TEJ (Tumor-Enriched Junction)</>,
              "A splice junction whose expression is significantly enriched in tumor samples relative to normal/control tissue. This is the unit of data TAPESTRY is built around.",
            ],
            [
              "Oncofetal",
              "A tumor-enriched TEJ that is also expressed in prenatal brain (at least one prenatal evo-devo group, fold-change > 2 and SNR > 2 against every postnatal group). Interpretation: the tumor has reactivated a splicing program that's normally only active during development.",
            ],
            [
              "Tumor-enriched",
              "A TEJ that is enriched in tumor relative to postnatal normal tissue and does not meet the oncofetal criteria (no prenatal evo-devo group exceeds every postnatal group with fold-change > 2 and SNR > 2). Interpretation: this splice form isn't part of the developmental programs captured by the reference cohorts — it's more uniquely tumor-derived.",
            ],
            [
              <Code>junction_preference</Code>,
              <>
                The junction-level call, <Code>Tumor-enriched</Code> or <Code>Oncofetal</Code>. Each junction has a single call shared by every sample that carries it.
              </>,
            ],
            [
              <Code>oncofetal_prenatal_group</Code>,
              <>
                For Oncofetal junctions, the prenatal evo-devo group(s) (brain region and stage, e.g. <Code>Forebrain-4-5pcw_early_embryonic</Code>) whose expression qualified the junction as oncofetal, separated by <Code>;</Code>. Empty for Tumor-enriched junctions.
              </>,
            ],
            [
              <Code>criteria</Code>,
              <>
                Why the junction counts as tumor-enriched: <Code>enriched expr vs. ctrls</Code> (passes the fold-change/SNR thresholds against controls that express it) or <Code>No ctrl expr, novel SS usage</Code> (no expression in the control cohorts; novel splice-site usage).
              </>,
            ],
            [
              "Recurrence",
              "The fraction of samples within a histology that exhibit enrichment of a given junction. Used to focus on junctions that are reproducible within a tumor type rather than one-off events.",
            ],
          ]}
        />

        <GlossaryGroup
          title="Junction annotation"
          rows={[
            [
              "Status: Annotated junction",
              "Both splice-site boundaries match a known exon boundary in the reference annotation (GENCODE). The junction itself is \"normal,\" but its usage pattern is enriched in tumor.",
            ],
            [
              "Status: Novel junction",
              "The exon-exon junction is not supported by any annotated transcripts (GENCODE v39)",
            ],
            [
              "Status: Novel splice site",
              "One boundary is known, the other is novel.",
            ],
            [
              <Code>preference_code</Code>,
              <>
                Short code for the splicing event type: <Code>EI</Code> = exon inclusion, <Code>ES</Code> = exon skipping, <Code>RI</Code> = retained intron, <Code>A3+</Code>/<Code>A3-</Code> = alternative 3′ splice site (longer/shorter), <Code>A5+</Code>/<Code>A5-</Code> = alternative 5′ splice site (longer/shorter).
              </>,
            ],
            [
              <Code>consensus_jc_event_type</Code>,
              "The rMATS event category assigned to the junction, reconciled across samples.",
            ],
            [
              "rMATS event types",
              <>
                <Code>SE</Code> (skipped exon), <Code>A3SS</Code> (alternative 3′ splice site), <Code>A5SS</Code> (alternative 5′ splice site), <Code>RI</Code> (retained intron), <Code>MXE</Code> (mutually exclusive exons) — the standard rMATS vocabulary for classifying splicing events.
              </>,
            ],
            [
              "Domain (Pfam / UniProt)",
              "Where a junction's affected exon overlaps a known protein domain. Pfam = curated functional domain families; UniProt = topological/structural annotations (e.g., extracellular, transmembrane, intracellular). A junction overlapping an extracellular domain is of particular interest for antibody/CAR-T targeting, since the altered region would be accessible on the cell surface.",
            ],
          ]}
        />

        <GlossaryGroup
          title="Expression metrics"
          rows={[
            [
              "CPM (Counts Per Million)",
              "Junction read counts normalized by total sequencing depth. The primary expression metric for junctions in TAPESTRY (as opposed to gene-level TPM).",
            ],
            [
              "TPM (Transcripts Per Million)",
              "Gene/isoform-level expression metric, length-normalized. Used as a secondary filter (e.g., requiring the host gene have TPM ≥ 10) rather than as the main junction metric.",
            ],
            [
              "Fold-change (FC)",
              "Tumor junction CPM divided by the maximum mean CPM observed for that junction across the relevant control cohort(s). Higher = more tumor-enriched.",
            ],
            [
              "Signal-to-noise ratio (SNR)",
              "(tumor CPM − control mean CPM) / control CPM standard deviation. Captures enrichment relative to the variability of the control measurement, not just its mean — guards against calling a junction \"enriched\" just because of a noisy low-coverage control estimate.",
            ],
            [
              <Code>_postnatal</Code>,
              "Suffix meaning the metric (FC, SNR, max mean CPM) was computed against postnatal control cohorts only (adult GTEx, postnatal evo-devo timepoints, pediatric normal brain). These are the metrics used to call a junction tumor-enriched.",
            ],
            [
              <><Code>max_prenatal_min_cpm_fc</Code> / <Code>max_prenatal_min_cpm_snr</Code></>,
              "For each prenatal evo-devo group, the minimum fold-change (or SNR) of that group's CPM over every postnatal group; the reported value is the largest of these across prenatal groups. Used to call Oncofetal junctions (both > 2).",
            ],
          ]}
        />

        <GlossaryGroup
          title="Samples & cohorts"
          rows={[
            [
              <>Histology / <Code>plot_group</Code></>,
              "The tumor type/diagnosis grouping used throughout TAPESTRY for grouping and coloring samples (e.g., DIPG/DMG, Ependymoma, Medulloblastoma, Low-grade glioma, ATRT).",
            ],
            [
              <Code>cancer_group</Code>,
              <>
                The finer-grained pathological diagnosis from the underlying OpenPedCan histologies file; <Code>plot_group</Code> is a curated rollup of this for visualization.
              </>,
            ],
            [
              "Cohort",
              "The source dataset a sample belongs to: PBTA tumors, GTEx (adult brain controls), Evo-devo (developmental brain across timepoints), Pediatric normal brain, or Pediatric brain cell types.",
            ],
            [
              "Evo-devo timepoints",
              "Developmental stages spanned by the evo-devo control cohort, from prenatal (e.g., 4 weeks post-conception) through postnatal stages (neonate, infant, toddler, school-age, adolescent, young adult), split into Forebrain/Hindbrain. This cohort is what lets TAPESTRY distinguish \"present in prenatal development\" (oncofetal) from \"not present in the developmental reference\" (tumor-enriched).",
            ],
            [
              <Code>composition</Code>,
              <>
                Sample type flag; <Code>Derived Cell Line</Code> marks an immortalized cell line rather than a patient solid tumor or normal-tissue sample — relevant to the wet-lab validation walkthrough below.
              </>,
            ],
            [
              <Code>is_independent_primary</Code>,
              "Marks whether a tumor sample is an independent primary specimen (vs. a recurrence/metastasis/duplicate from the same patient), used so recurrence statistics aren't inflated by re-counting the same tumor.",
            ],
          ]}
        />
      </Section>

      <Section title="Protein domains">
        <Typography sx={{ mb: 2 }}>
          When you select a junction on the Explore page, the top of the
          transcript panel below the plots shows two rows. The{" "}
          <strong>Reference</strong> row is the transcript that encodes
          UniProt&apos;s canonical protein isoform, the sequence UniProt&apos;s
          domain positions refer to, with a <strong>Domains</strong> track
          directly underneath. The <strong>Junction</strong> row is the
          transcript the junction is annotated to (matched by its Ensembl
          transcript ID, e.g. <Code>UBE3A-201</Code>, <Code>ENST00000566215</Code>) with the
          junction drawn on it in red. When the junction is annotated to the
          reference transcript, one row carries both tags. Comparing the rows
          shows whether a splicing event lands in, or removes part of, a known
          domain.
        </Typography>
        <List sx={{ listStyleType: "disc", pl: 4, py: 0, mb: 2 }}>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <strong>Source.</strong> Domains are fetched live from{" "}
              <Link
                href="https://www.uniprot.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                UniProt
              </Link>
              : the reviewed (Swiss-Prot) human entry for the gene, using its
              features of type &ldquo;Domain&rdquo;. Each domain is a colored
              block; hover over it to see the domain name and its amino-acid
              range.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <strong>Placement.</strong> UniProt gives domain positions in
              amino acids. TAPESTRY converts them to genomic coordinates by
              walking the reference transcript&apos;s coding exons (from Ensembl) from the
              start codon, three nucleotides per residue. A domain that spans
              several exons is drawn as one block from its first to its last
              coding base, including the introns in between.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <strong>Isoform check.</strong> The reference row is the Ensembl
              transcript that UniProt maps to its canonical isoform. If that
              transcript&apos;s protein length differs from UniProt&apos;s, the
              track is labeled{" "}
              <strong>Domains *</strong> (hover the label for a note) and
              domain positions may not line up exactly.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <strong>When there is no track.</strong> The reference row is
              shown whenever UniProt maps its canonical isoform to one of the
              gene&apos;s current Ensembl transcripts; the Domains track under
              it is hidden when UniProt has no annotated domains for the gene.
              Without a reviewed UniProt entry, without a mapped transcript, or
              when UniProt or Ensembl can&apos;t be reached, there is no
              reference row and the junction row is shown alone. Domains are
              not drawn on the junction row, because UniProt&apos;s positions
              only apply to the canonical isoform.
            </Typography>
          </ListItem>
        </List>
        <Typography sx={{ mb: 2 }}>
          The track follows the panel&apos;s zoom, so &ldquo;Zoom to area of
          interest&rdquo; shows the domains around the junction in more detail.
          It shows only UniProt &ldquo;Domain&rdquo; features. Topological
          regions such as extracellular or transmembrane segments are not
          drawn, so check UniProt directly when cell-surface accessibility
          matters (e.g., for CAR-T or antibody targets).
        </Typography>
      </Section>

      <Section title="Use-case walkthroughs">
        <Walkthrough
          title="I have a gene of interest"
          goal="find out whether a specific gene has any tumor-enriched splicing in pediatric CNS tumors, and what it looks like."
          steps={[
            <>
              From the Home page, use the &ldquo;Search by gene&rdquo; box and enter the gene symbol (e.g. <Code>NRCAM</Code>). This takes you to Explore pre-filtered to that gene.
            </>,
            "The results table lists every TEJ found in that gene: junction name, specificity (Oncofetal/Tumor-enriched), status (Annotated/Novel/Novel splice site), event type, fold-change, SNR, max mean CPM, and number of samples carrying it.",
            "Sort by fold-change, SNR, or # samples to find the most enriched or most recurrent junction in the gene.",
            "Click a row to load it into the plot panel below: the Primary Tumors tab shows CPM for that junction across every histology, so you can see whether the signal is broad or confined to one tumor type. The exon diagram underneath shows where in the gene's structure the junction sits, and highlights the specific splicing event (e.g., a skipped exon) on the canonical transcript.",
            "Download the filtered table (TSV/Excel) or the plot (PNG/PDF/TIFF/SVG) for further analysis or a figure.",
          ]}
        />

        <Walkthrough
          title="I have a histology (tumor type) of interest"
          goal="survey all tumor-enriched splicing in a given tumor type to find candidate genes/junctions worth pursuing."
          steps={[
            <>
              From Home or the Explore page, set the Histology dropdown to your histology of interest (e.g., <Code>Medulloblastoma</Code>, <Code>Low-grade glioma</Code>.
            </>,
            "The table now lists every TEJ recurrent in that histology. Use the min fold-change, min SNR, and max mean CPM sliders (computed against postnatal controls) to tighten or loosen what counts as \"enriched.\"",
            "Turn off \"Include no control expression\" to hide junctions with zero expression in every prenatal and postnatal control cohort. These are the most tumor-specific, but most use a novel splice site and some may be technical artifacts.",
            "Sort by # samples to prioritize junctions that recur across many patients within the histology (more likely to generalize as a target), or by fold-change/SNR to prioritize the cleanest signal.",
            "Click through interesting rows to inspect their CPM distribution and confirm the signal is concentrated in your histology of interest, rather than showing up broadly across tumor types, which would make it a less histology-specific target.",
            "Export the histology-level table as a working candidate list.",
          ]}
        />

        <Walkthrough
          title="Distinguishing oncofetal from tumor-enriched junctions"
          goal="for a junction (or set of junctions), determine whether it's reactivated fetal/developmental splicing (oncofetal) or splicing with no counterpart in the normal reference cohorts (tumor-enriched) — a distinction that matters for predicting on-target/off-tumor toxicity risk."
          steps={[
            <>
              On Explore, use the Specificity filter to restrict the table to <Code>Oncofetal</Code> or <Code>Tumor-enriched</Code> directly — this reflects the <Code>junction_preference</Code> call already made by the pipeline.
            </>,
            <>
              To see why a junction was called Oncofetal, download the table: <Code>oncofetal_prenatal_group</Code> lists the prenatal group(s) that express it, and <Code>max_prenatal_min_cpm_fc</Code> / <Code>max_prenatal_min_cpm_snr</Code> show how strongly the best prenatal group exceeds every postnatal group.
            </>,
            "Select the junction and open the Evo-devo tab in the plot panel. This is the most direct visual confirmation: an oncofetal junction's CPM trace will be elevated in one or more fetal timepoints and drop to near-zero through postnatal development, while a tumor-enriched junction's trace will stay flat/near-zero across all developmental timepoints.",
            "The Controls tab (faceted by cohort: GTEx, Evo-devo, Pediatric brain, etc.) gives a side-by-side view across all normal reference cohorts at once, useful for a final sanity check before treating a junction as a clean tumor-enriched candidate.",
            <>
              <strong>Interpretation caveat:</strong> the Oncofetal / Tumor-enriched call is only as complete as the prenatal reference — a Tumor-enriched junction may still be expressed at developmental stages or in brain regions the evo-devo cohort doesn't cover. If fetal off-target risk is a concern, check the Evo-devo and Controls tabs directly rather than relying on the table label alone.
            </>,
          ]}
        />

        <Walkthrough
          title="Wet-lab validation via cell lines"
          goal="before committing bench time (PCR, antibody work, CAR-T construct design, etc.), check whether a candidate junction is also detectable in an available patient-derived or commercial cell line, so the cell line can be used as a validation model."
          steps={[
            "Identify your candidate junction via one of the walkthroughs above and select it in the Explore table.",
            <>
              In the plot panel, open the Cell Lines tab. This restricts the comparison to samples flagged with <Code>composition = Derived Cell Line</Code> alongside the primary tumor samples for context.
            </>,
            "Look for cell lines with CPM for the junction comparable to the primary tumor samples that originally defined it as a TEJ — these are your best candidates for downstream wet-lab confirmation (e.g., RT-PCR across the junction, targeted sequencing, or functional assays).",
            "Cross-check the cell line's histology/cancer group against your tumor of interest (visible in the sample tooltip) to make sure the model is biologically relevant, not just incidentally expressing the junction.",
            "Use Configure Samples to narrow the view to just the cell lines you're considering, and export the plot for inclusion in a validation proposal or grant figure.",
          ]}
        />
      </Section>

      <Section title="Raw data availability">
        <Typography sx={{ mb: 2 }}>
          The underlying sequencing data behind TAPESTRY is deposited across
          the following studies/projects:
        </Typography>
        <List sx={{ listStyleType: "disc", pl: 4, py: 0 }}>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id=phs002517.v5.p3"
                target="_blank"
                rel="noopener noreferrer"
              >
                PBTA
              </Link>{" "}
              (Pediatric Brain Tumor Atlas tumor cohort)
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="https://www.ncbi.nlm.nih.gov/projects/gap/cgi-bin/study.cgi?study_id=phs000424.v11.p2"
                target="_blank"
                rel="noopener noreferrer"
              >
                GTEx
              </Link>{" "}
              (adult brain control cohort)
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="https://www.ebi.ac.uk/biostudies/arrayexpress/studies/E-MTAB-6814"
                target="_blank"
                rel="noopener noreferrer"
              >
                Evo-devo
              </Link>{" "}
              (developmental brain control cohort)
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="https://www.ncbi.nlm.nih.gov/bioproject/PRJNA1019377"
                target="_blank"
                rel="noopener noreferrer"
              >
                Pediatric brain
              </Link>{" "}
              (normal pediatric brain control cohort)
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="https://www.ncbi.nlm.nih.gov/bioproject/PRJNA297760"
                target="_blank"
                rel="noopener noreferrer"
              >
                Cell of origin
              </Link>{" "}
              (pediatric brain cell types control cohort)
            </Typography>
          </ListItem>
        </List>
      </Section>

      <Section title="Resources">
        <List sx={{ listStyleType: "disc", pl: 4, py: 0 }}>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="/tapestry-api/doc/"
                target="_blank"
                rel="noopener noreferrer"
              >
                API documentation
              </Link>{" "}
              for programmatic access to TAPESTRY&apos;s data.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              <Link
                href="https://github.com/rokitalab/TAPESTRY/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source code on GitHub
              </Link>
              .
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              Found a bug or have a feature request?{" "}
              <Link
                href="https://github.com/rokitalab/TAPESTRY/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                Submit an issue
              </Link>
              .
            </Typography>
          </ListItem>
        </List>
      </Section>
    </Box>
  );
}
