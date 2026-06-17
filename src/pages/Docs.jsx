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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

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

function Section({ title, children, mt = 6 }) {
  return (
    <Box sx={{ mt }}>
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
    <Box sx={{ maxWidth: 900 }}>
      <Typography variant="h3" color="primary" sx={{ fontWeight: 800, mb: 1 }}>
        Documentation
      </Typography>
      <Typography color="text.secondary">
        What TAPESTRY does, the terms it uses, and how to work through common
        questions with it.
      </Typography>

      <Divider sx={{ my: 4 }} />

      <Section title="What is TAPESTRY?" mt={0}>
        <Typography sx={{ mb: 2 }}>
          <strong>TAPESTRY</strong> (Tumor Alternative PEdiatric Splicing
          visualizaTion and queRY) is a web application for exploring
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
          filter, visualize, and download them.
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
              against the matched junction&apos;s expression in every control
              cohort, yielding a <strong>fold-change</strong> and{" "}
              <strong>signal-to-noise ratio (SNR)</strong> for each junction.
            </Typography>
          </ListItem>
          <ListItem sx={{ display: "list-item", py: 0.5, pl: 0 }}>
            <Typography variant="body2">
              Junctions that clear enrichment thresholds against{" "}
              <em>all</em> control cohorts — including fetal/developmental
              tissue — are called <strong>Tumor-specific</strong>. Junctions
              that clear those thresholds only against <em>postnatal</em>{" "}
              controls (i.e., they&apos;re also present in fetal tissue) are
              called <strong>Oncofetal</strong>.
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
              "A TEJ that is enriched in tumor relative to postnatal normal tissue, but is also expressed in fetal/developmental tissue. Interpretation: the tumor has reactivated a splicing program that's normally only active during development.",
            ],
            [
              "Tumor-specific",
              "A TEJ that is enriched in tumor relative to all normal tissue, including fetal/developmental. Interpretation: this splice form isn't part of any known normal developmental program — it's more uniquely tumor-derived.",
            ],
            [
              <Code>junction_preference</Code>,
              <>
                A <em>per-sample</em> field with values <Code>Tumor-enriched</Code> (passes enrichment thresholds vs. all controls, including fetal) or <Code>Oncofetal</Code> (passes thresholds vs. postnatal controls only — i.e., this sample's copy of the junction looks fetal-like). Every sample carrying a given junction gets its own call.
              </>,
            ],
            [
              <Code>consensus_specificity</Code>,
              <>
                The <em>junction-level</em> rollup of <Code>junction_preference</Code> across every sample that carries the junction — and the rollup is asymmetric, not a majority vote: a junction is called <strong>Oncofetal</strong> if <em>any</em> sample shows the oncofetal pattern, even just 1 of 10. It's only called <strong>Tumor-specific</strong> if <em>every single sample</em> was independently called tumor-specific. "Oncofetal" beats "Tumor-specific" at the slightest hint of fetal-pattern expression, so the call is conservative about claiming a junction is cleanly tumor-specific.
              </>,
            ],
            [
              "Recurrence",
              "The fraction of samples within a histology that carry a given junction. Used to focus on junctions that are reproducible within a tumor type rather than one-off events.",
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
              "Neither boundary matches a known exon boundary — an entirely new splice junction.",
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
              "Gene/isoform-level expression metric, length-normalized. Used as a secondary filter (e.g., requiring the host gene have TPM > 10) rather than as the main junction metric.",
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
              <Code>_all</Code>,
              "Suffix meaning the metric (FC, SNR, max mean CPM) was computed against all control cohorts, including fetal/developmental tissue. Used to call Tumor-specific junctions.",
            ],
            [
              <Code>_postnatal</Code>,
              "Suffix meaning the metric was computed against postnatal control cohorts only (adult GTEx, postnatal evo-devo timepoints, pediatric normal brain). Used to call Oncofetal junctions, since fetal tissue is deliberately excluded from this comparison.",
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
              "Developmental stages spanned by the evo-devo control cohort, from prenatal (e.g., 4 weeks post-conception) through postnatal stages (neonate, infant, toddler, school-age, adolescent, young adult), split into Forebrain/Hindbrain. This cohort is what lets TAPESTRY distinguish \"present only in fetal development\" (oncofetal) from \"never normally present\" (tumor-specific).",
            ],
            [
              <Code>composition</Code>,
              <>
                Sample type flag; <Code>Derived Cell Line</Code> marks an immortalized cell line rather than a primary patient tumor or normal-tissue sample — relevant to the wet-lab validation walkthrough below.
              </>,
            ],
            [
              <Code>is_independent_primary</Code>,
              "Marks whether a tumor sample is an independent primary specimen (vs. a recurrence/metastasis/duplicate from the same patient), used so recurrence statistics aren't inflated by re-counting the same tumor.",
            ],
          ]}
        />
      </Section>

      <Section title="Use-case walkthroughs">
        <Walkthrough
          title="I have a gene of interest"
          goal="find out whether a specific gene has any tumor-enriched splicing in pediatric CNS tumors, and what it looks like."
          steps={[
            <>
              From the Home page, use the &ldquo;Search by gene&rdquo; box and enter the gene symbol (e.g. <Code>NRCAM</Code>). This takes you to Explore pre-filtered to that gene.
            </>,
            "The results table lists every TEJ found in that gene: junction coordinates, specificity (Oncofetal/Tumor-specific), status (Annotated/Novel/Novel splice site), event type, fold-change, SNR, max mean CPM, and number of samples carrying it.",
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
              From Home, use &ldquo;Search by histology&rdquo; (e.g. <Code>HGG</Code>, <Code>LGG</Code>, <Code>Medulloblastoma</Code>) — or set the Histology dropdown directly on the Explore page.
            </>,
            "The table now lists every TEJ recurrent in that histology. Use the Reference cohorts toggle (All vs. Postnatal) plus the min fold-change, min SNR, and max mean CPM sliders to tighten or loosen what counts as \"enriched.\"",
            "Sort by # samples to prioritize junctions that recur across many patients within the histology (more likely to generalize as a target), or by fold-change/SNR to prioritize the cleanest signal.",
            "Click through interesting rows to inspect their CPM distribution and confirm the signal is concentrated in your histology of interest, rather than showing up broadly across tumor types, which would make it a less histology-specific target.",
            "Export the histology-level table as a working candidate list.",
          ]}
        />

        <Walkthrough
          title="Distinguishing oncofetal from tumor-specific junctions"
          goal="for a junction (or set of junctions), determine whether it's reactivated fetal/developmental splicing (oncofetal) or splicing that has no normal-tissue counterpart at all (tumor-specific) — a distinction that matters for predicting on-target/off-tumor toxicity risk."
          steps={[
            <>
              On Explore, use the Specificity filter to restrict the table to <Code>Oncofetal</Code> or <Code>Tumor-specific</Code> directly — this reflects the <Code>consensus_specificity</Code> call already made by the pipeline.
            </>,
            <>
              To see why a junction was called one way or the other, toggle Reference cohorts between All and Postnatal: a junction called Oncofetal will show enrichment against the Postnatal reference (low/no signal in postnatal controls) but a weaker or absent fold-change/SNR against All controls, because fetal tissue does express it. A junction called Tumor-specific will show strong enrichment under both scopes — there's no control cohort, fetal or postnatal, where it shows up.
            </>,
            "Select the junction and open the Evo-devo tab in the plot panel. This is the most direct visual confirmation: an oncofetal junction's CPM trace will be elevated in the earliest (fetal) timepoints and drop to near-zero through postnatal development, while a tumor-specific junction's trace will stay flat/near-zero across all developmental timepoints.",
            "The Controls tab (faceted by cohort: GTEx, Evo-devo, Pediatric brain, etc.) gives a side-by-side view across all normal reference cohorts at once, useful for a final sanity check before treating a junction as a clean tumor-specific candidate.",
            <>
              <strong>Interpretation caveat:</strong> <Code>consensus_specificity</Code> is rolled up across every sample carrying the junction, and the rollup favors Oncofetal — a junction is only ever called Tumor-specific if every sample carrying it independently avoided the fetal-like pattern; it's called Oncofetal if even a single sample showed it. So a junction labeled Oncofetal isn't necessarily fetal-like in most of the patients who have it — it just needs one. If you need a junction that's consistently tumor-specific patient-to-patient (e.g., for a therapy where fetal off-target risk in even a subset of patients is unacceptable), don't stop at the table label — open the Primary Tumors tab and check sample-to-sample consistency directly.
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
    </Box>
  );
}
