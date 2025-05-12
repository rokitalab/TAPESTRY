# shinySplice
#
# Interactively explore tumor-specific splice variants in ATRT, HGG, and DMG
#
# This app allows users to explore and filter tumor histology-specific splice
# variants, and plot average PSI across case and control cohorts and explore
# genic context of alternative splicing event
#
#

# Load libraries  
if(!require("shiny")) install.packages("shiny")
if(!require("shinymanager")) install.packages("shinymanager")
if(!require("sodium")) install.packages("sodium")
if(!require("rprojroot")) install.packages("rprojroot")
if(!require("tidyverse")) install.packages("tidyverse")
if(!require("DT")) install.packages("DT")
if(!require("ggpubr")) install.packages("ggpubr")

root_dir <- rprojroot::find_root(rprojroot::has_dir(".git"))

user_base <- readRDS(file.path(root_dir, "input",
                               "users.RDS"))

# Load data
display_df <- readRDS(file.path(root_dir, "input", 
                                "shiny_splice_input_plus_expression.RDS"))

ctrl_psi_df <- readRDS(file.path(root_dir, "input", 
                                 "tumor-specific-splice-event-ctrl-psis.RDS"))

ctrl_exon_ct_df <- readRDS(file.path(root_dir, "input",
                                 "tumor-specific-splice-event-ctrl-exon-cts.RDS"))

pbta_psi_df <- readRDS(file.path(root_dir, "input", 
                                      "pbta-tumor-specific-oncofetal-splice-event-psis.RDS"))

pbta_exon_ct_df <- readRDS(file.path(root_dir, "input", 
                                         "pbta-tumor-specific-oncofetal-normalized-exon-coverage.RDS"))

gtf_df <- read_tsv(file.path(root_dir, "input", 
                               "gencode.v39.primary_assembly.annotation.tsv.gz"))

plot_mapping <- read_tsv(file.path(root_dir, "input", 
                                   "plot-mapping.tsv"))


source(file.path(root_dir, "input",
                 "theme.R"))

# Define UI for application
ui <- fluidPage(
  
  # Application title
    titlePanel("Query tumor-specific splice variants"),
    
    shinyauthr::loginUI(id = "login"),
      
    shinyauthr::logoutUI(id = "logout"),
    
    # Dynamically show the app after login
    uiOutput("main_content")
    
)
   
# Define server logic
server <- function(input, output, session) {
  
  # Authentication module
  credentials <- shinyauthr::loginServer(
    id = "login",
    data = user_base,
    user_col = user,
    pwd_col = password,
    log_out = reactive(logout_init()),
    sodium_hashed = TRUE
  )

  # Logout button
  logout_init <- shinyauthr::logoutServer(
    id = "logout",
    active = reactive(credentials()$user_auth)
  )
  
  # render ui content after successful login
  output$main_content <- renderUI({
    req(credentials()$user_auth)
    
    tagList(
    # Create a fluid layout
    fluidRow(
      # Sidebar with inputs for filtering, placed in one column
      column(12, 
             sidebarPanel(
               
               # Checkbox to enable/disable preference filtering
               checkboxInput("filter_histology", "Filter by Histology?", value = FALSE),
               
               # Dropdown for histology, only visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_histology == true",
                 selectInput("histology", 
                             "Select Histology:", 
                             choices = sort(unique(selectedData()$histology)))  # Will update based on selected table
               ),
               
               # Checkbox to enable/disable preference filtering
               checkboxInput("filter_preference", "Filter by Preference?", value = FALSE),
               
               # Dropdown for preference, only visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_preference == true",
                 selectInput("preference", 
                             "Select Preference:", 
                             choices = sort(unique(selectedData()$preference)))  # Will update based on selected table
               ),
               
               # Checkbox to enable/disable specificity filtering
               checkboxInput("filter_specificity", "Filter by Specificity?", value = FALSE),
               
               # Dropdown for specificity, only visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_specificity == true",
                 selectInput("specificity", 
                             "Select Specificity:", 
                             choices = sort(unique(selectedData()$specificity)))  # Will update based on selected table
               ),
               
               # Checkbox to enable/disable consequence filtering
               checkboxInput("filter_consequence", "Filter by Consequence?", value = FALSE),
               
               # Dropdown for consequence, only visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_consequence == true",
                 selectInput("consequence", 
                             "Select Consequence:", 
                             choices = sort(unique(selectedData()$consequence)))  # Will update based on selected table
               ),
               
               # Checkbox to enable/disable sample PSI filtering
               checkboxInput("filter_psi", "Filter by Sample PSI?", value = FALSE),
               
               # Slider input for PSI range, visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_psi == true",
                 sliderInput("psi_range", 
                             "PSI Range:", 
                             min = 0, 
                             max = 1,  # Will update based on selected table
                             value = c(0, 1), 
                             step = 0.01)
               ),
               
               checkboxInput("filter_coverage", "Filter by Sample Junction Coverage?", value = FALSE),
               
               # Text input for Gene Symbol, visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_coverage == true",
                 textInput("coverage", "Enter Minimum Coverage:")
               ),
               
               # Checkbox to enable/disable consequence filtering
               checkboxInput("filter_exon_preference", "Filter by Exon Differential Expression?", value = FALSE),
               
               # Dropdown for consequence, only visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_exon_preference == true",
                 selectInput("exon_preference", 
                             "Select Category:", 
                             choices = sort(unique(selectedData()$exon_preference)))  # Will update based on selected table
               ),
               
               # Checkbox to enable/disable consequence filtering
               checkboxInput("filter_exon_specificity", "Filter by Exon Specificity?", value = FALSE),
               
               # Dropdown for consequence, only visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_exon_specificity == true",
                 selectInput("exon_specificity", 
                             "Select Specificity:", 
                             choices = sort(unique(selectedData()$exon_specificity)))  # Will update based on selected table
               ),
               
               # Checkbox to enable/disable Gene Symbol filtering
               checkboxInput("filter_gene", "Filter by Gene Symbol?", value = FALSE),
               
               # Text input for Gene Symbol, visible if checkbox is selected
               conditionalPanel(
                 condition = "input.filter_gene == true",
                 textInput("gene_symbol", "Enter Gene Symbol:")
               )
             )
      )
    ),
    
    # Show the filtered table and plots in another fluid row
    fluidRow(
      column(12, 
             mainPanel(
               DTOutput("filteredTable"),  # Use DT to render an interactive table
               
               # Display the selected splice_id and psi below the table
               htmlOutput("selected_splice_id"),  # For bold splice_id
               fluidRow(
                 column(12, plotOutput("combined_plot"))  # Display the combined plot
               ),
               fluidRow(
                 column(12, plotOutput("combined_expr_plot"))  # Display the combined plot
               ),
               fluidRow(
                 column(12, plotOutput("histology_psi_plot"))  # Display the combined plot
               ),
               fluidRow(
                 column(12, plotOutput("histology_expr_plot"))  # Display the combined plot
               )
               #   plotOutput("gene_model_plot", height = "800px") # Add plotOutput for the gene model
             )
      )
    ),
    
    downloadButton("download_psi_plot", "Download PSI Plot")  # Add a download button for PSI plot
    # downloadButton("download_gene_plot", "Download Gene Plot")
    
    )
    
  })
  
  selectedData <- reactive({
    display_df
  })
  
  # Update the preference choices based on the selected table
  observe({
    req(selectedData())

    # Update the slider range based on psi values in the selected table
    updateSliderInput(session, "psi_range", 
                      min = min(selectedData()$psi, na.rm = TRUE), 
                      max = max(selectedData()$psi, na.rm = TRUE), 
                      value = c(min(selectedData()$psi, na.rm = TRUE), max(selectedData()$psi, na.rm = TRUE)))
  })
  
  # Reactive expression to filter data based on input$preference, input$psi_range, and input$dpsi_range
  filteredData <- reactive({
    filtered <- selectedData()
    
    # Apply histology filter if checkbox is selected
    if (input$filter_histology) {
      filtered <- filtered[filtered$histology == input$histology, ]
    }
    
    # Apply preference filter if checkbox is selected
    if (input$filter_preference) {
      filtered <- filtered[filtered$preference == input$preference, ]
    }
    
    # Apply specificity filter if checkbox is selected
    if (input$filter_specificity) {
      filtered <- filtered[filtered$specificity == input$specificity, ]
    }
    
    # Apply consequence filter if checkbox is selected
    if (input$filter_consequence) {
      filtered <- filtered[filtered$consequence == input$consequence, ]
    }

    # Apply PSI range filter if checkbox is selected
    if (input$filter_psi) {
      filtered <- filtered[filtered$psi >= input$psi_range[1] & filtered$psi <= input$psi_range[2], ]
    }
    
    # Apply coverage filter if checkbox is selected
    if (input$filter_coverage && input$coverage != "") {
      min_coverage <- as.numeric(input$coverage)
      # Filter rows where gene_symbol is found within the splice_id column
      filtered <- filtered[filtered$IJ_coverage + filtered$SJ_coverage >= min_coverage, ]
    }
    
    # Apply exon preference filter if checkbox is selected
    if (input$filter_exon_preference) {
      filtered <- filtered[filtered$exon_preference == input$exon_preference, ]
    }
    
    # Apply exon specificity filter if checkbox is selected
    if (input$filter_exon_specificity) {
      filtered <- filtered[filtered$exon_specificity == input$exon_specificity, ]
    }

    # Apply gene symbol filter if checkbox is selected
    if (input$filter_gene && input$gene_symbol != "") {
      # Filter rows where gene_symbol is found within the splice_id column
      filtered <- filtered[grepl(glue::glue(":{input$gene_symbol}_"), filtered$splice_id, ignore.case = TRUE), ]
    }
    
    # Return the filtered data
    filtered
  })
  
  # Render the filtered table as an interactive DT table
  output$filteredTable <- renderDT({
    datatable(filteredData() %>% dplyr::select(sample_id, histology,
                                               gene_symbol, exon_start,
                                               exon_end, 
                                               psi, IJ_coverage, SJ_coverage,
                                               preference,
                                               specificity, consequence,
                                               exon_uniprot_domain,
                                               upstream_exon_uniprot_domain,
                                               downstream_exon_uniprot_domain,
                                               pfam_name, pfam_description
                                               ), selection = "single")  # Enable single row selection
  })
  
  # Display the selected splice_id in bold below the table
  output$selected_splice_id <- renderUI({
    selected_row <- input$filteredTable_rows_selected  # Get the selected row index
    if (length(selected_row) > 0) {
      selected_data <- filteredData()[selected_row, ]
      HTML(paste("<b style='font-size: 24px;'>Selected splice_id:</b> ",
                 "<span style='font-size: 24px;'>", selected_data$splice_id, "</span>"))
    } else {
      HTML("No splice_id selected")
    }
  })
  
  # Reactive expression to generate combined_plot
  combined_plot <- reactive({
    selected_row <- input$filteredTable_rows_selected  # Get the selected row index
    if (length(selected_row) > 0) {
      selected_data <- filteredData()[selected_row, ]
      selected_splice_id <- selected_data$splice_id
      
      # Filter data for psi plot
      all_rows_with_splice_id <- filteredData()[filteredData()$splice_id == selected_splice_id, ] %>%
        dplyr::mutate(histology_label = case_when(
          selected_data$histology == "Atypical Teratoid Rhabdoid Tumor" ~ "ATRT",
          TRUE ~ selected_data$histology))
      
      # Create the psi box plot
      psi_plot <- ggplot(all_rows_with_splice_id, aes(x = histology_label, y = psi)) +
        geom_boxplot(fill = "lightblue", alpha = 0.5, outlier.shape = NA) +  # Transparent box plot
        geom_jitter(width = 0.2, height = 0, color = "darkblue", alpha = 0.7) +  # Jittered individual points
        labs(title = NULL,
             x = NULL,
             y = "PSI") +
        coord_cartesian(ylim = c(0, 1)) +
        theme_Publication() +
        theme(axis.text.x = element_text(angle = 45, hjust = 1, size = 12))
      
      # Create the avg values bar plot
     # avg_data <- filteredData()[filteredData()$splice_id == selected_splice_id, ]
      avg_data <- ctrl_psi_df[ctrl_psi_df$splice_id == selected_splice_id, ]
     # avg_data_first_row <- avg_data[1, ]
      
      avg_columns <- avg_data %>% dplyr::select(ends_with("_avg"), contains("SRR"))
      stdev_columns <- avg_data %>% dplyr::select(ends_with("_stdev"))
      
      avg_long <- pivot_longer(avg_columns, cols = everything(), names_to = "Avg_Variable", values_to = "Value")
      stdev_long <- pivot_longer(stdev_columns, cols = everything(), names_to = "Stdev_Variable", values_to = "Stdev")
      
      avg_long$Avg_Variable <- gsub("_avg", "", avg_long$Avg_Variable)
      stdev_long$Stdev_Variable <- gsub("_stdev", "", stdev_long$Stdev_Variable)
      
      combined_data <- left_join(avg_long, stdev_long, by = c("Avg_Variable" = "Stdev_Variable"))
      combined_data$cohort <- ifelse(grepl("Brain", combined_data$Avg_Variable), "GTEx", 
                                     ifelse(grepl("Forebrain|Hindbrain", combined_data$Avg_Variable), 
                                            "Evo-Devo", 
                                            ifelse(grepl("GSE|SRR", combined_data$Avg_Variable), 
                                                   "PedBrain", "Cell type")))
      
      combined_data <- combined_data %>%
        dplyr::arrange(cohort)
      
      combined_data$Avg_Variable <- gsub("Brain - ", "", combined_data$Avg_Variable)
      combined_data$Avg_Variable <- factor(combined_data$Avg_Variable, levels = combined_data$Avg_Variable)
      
      
      ctrl_psi_plot <- ggplot(combined_data, aes(x = Avg_Variable, y = Value, fill = cohort)) +
        geom_bar(stat = "identity") +
        geom_errorbar(aes(ymin = Value - Stdev, ymax = Value + Stdev), width = 0.2, color = "black") +
        labs(title = NULL, x = NULL, y = "PSI") +
        theme_minimal() +
        coord_cartesian(ylim = c(0, 1)) +
        theme_Publication() +
        theme(axis.text.x = element_text(angle = 45, hjust = 1, size = 10))
      
      # Use ggarrange to align the two plots side by side
      combined_plot <- ggpubr::ggarrange(psi_plot + theme(plot.margin = unit(c(0.5, 0.1, 0.1, 0.1), "cm")),   # Adjust margins
                                             ctrl_psi_plot + theme(plot.margin = unit(c(0.5, 0.1, 0.1, 0.1), "cm")), # Adjust margins
                                         ncol = 2, align = "h",
                                         widths = c(0.15, 0.85))
      annotate_figure(combined_plot, top = text_grob(selected_splice_id, 
                                            color = "black", face = "bold", 
                                            size = 14, hjust = 0, x = 0))
    } else {
      NULL  # If no splice_id is selected, don't plot anything
    }
  })
  
  # Plot output
  output$combined_plot <- renderPlot({
    combined_plot()  # Call the reactive expression
  })
  
  
  # Reactive expression to generate combined_plot
  combined_expr_plot <- reactive({
    selected_row <- input$filteredTable_rows_selected  # Get the selected row index
    if (length(selected_row) > 0) {
      selected_data <- filteredData()[selected_row, ]
      selected_exon_start <- selected_data$exon_start
      selected_exon_end <- selected_data$exon_end
      selected_splice_id <- selected_data$splice_id
      selected_gene <- selected_data$gene_symbol

      # Filter data for psi plot
      all_rows_with_splice_id <- filteredData()[filteredData()$splice_id == selected_splice_id, ]
      
      # Filter exon ct data
      tumor_cts <- all_rows_with_splice_id %>%
        dplyr::filter(exon_start == selected_exon_start,
                      exon_end == selected_exon_end,
                      sample_id %in% all_rows_with_splice_id$sample_id) %>%
        dplyr::mutate(histology_label = case_when(
          selected_data$histology == "Atypical Teratoid Rhabdoid Tumor" ~ "ATRT",
          TRUE ~ selected_data$histology))  
      
      ctrl_cts <- ctrl_exon_ct_df %>%
        dplyr::filter(geneSymbol == selected_gene,
                      exonStart_0base == selected_exon_start,
                      exonEnd == selected_exon_end)
      
      avg_columns <- ctrl_cts %>% dplyr::select(ends_with("_avg"), contains("SRR"))
      stdev_columns <- ctrl_cts %>% dplyr::select(ends_with("_stdev"))
      
      avg_long <- pivot_longer(avg_columns, cols = everything(), names_to = "Avg_Variable", values_to = "Value")
      stdev_long <- pivot_longer(stdev_columns, cols = everything(), names_to = "Stdev_Variable", values_to = "Stdev")
      
      avg_long$Avg_Variable <- gsub("_avg", "", avg_long$Avg_Variable)
      stdev_long$Stdev_Variable <- gsub("_stdev", "", stdev_long$Stdev_Variable)
      
      combined_data <- left_join(avg_long, stdev_long, by = c("Avg_Variable" = "Stdev_Variable"))
      combined_data$cohort <- ifelse(grepl("Brain", combined_data$Avg_Variable), "GTEx", 
                                     ifelse(grepl("Forebrain|Hindbrain", combined_data$Avg_Variable), 
                                            "Evo-Devo", 
                                            ifelse(grepl("GSE|SRR", combined_data$Avg_Variable), 
                                                   "PedBrain", "Cell type")))
      
      combined_data <- combined_data %>%
        dplyr::arrange(cohort)
      
      combined_data$Avg_Variable <- gsub("Brain - ", "", combined_data$Avg_Variable)
      combined_data$Avg_Variable <- factor(combined_data$Avg_Variable, levels = combined_data$Avg_Variable)
      
      max_y <- max(c(tumor_cts$norm_exon_coverage,
                     combined_data$Value),
                   na.rm = TRUE) * 1.25
      
      # Create the psi box plot
      expr_plot <- ggplot(tumor_cts, aes(x = histology_label, 
                                            y = norm_exon_coverage)) +
        geom_boxplot(fill = "lightblue", alpha = 0.5, outlier.shape = NA) +  # Transparent box plot
        geom_jitter(width = 0.2, height = 0, color = "darkblue", alpha = 0.7) +  # Jittered individual points
        labs(title = NULL,
             x = NULL,
             y = "Normalized Exon Expr.") +
        coord_cartesian(ylim = c(0, max_y)) +
        theme_Publication() +
        theme(axis.text.x = element_text(angle = 45, hjust = 1, size = 12))
      
      
      ctrl_expr_plot <- ggplot(combined_data, aes(x = Avg_Variable, y = Value, fill = cohort)) +
        geom_bar(stat = "identity") +
        geom_errorbar(aes(ymin = Value - Stdev, ymax = Value + Stdev), width = 0.2, color = "black") +
        labs(title = NULL, x = NULL, y = "Normalized Exon Expr.") +
        coord_cartesian(ylim = c(0, max_y)) +
        theme_Publication() +
        theme(axis.text.x = element_text(angle = 45, hjust = 1, size = 10))
      
      # Use ggarrange to align the two plots side by side
      combined_expr_plot <- ggpubr::ggarrange(expr_plot + theme(plot.margin = unit(c(0.5, 0.1, 0.1, 0.1), "cm")),   # Adjust margins
                                              ctrl_expr_plot + theme(plot.margin = unit(c(0.5, 0.1, 0.1, 0.1), "cm")), # Adjust margins
                                         ncol = 2, align = "h",
                                         widths = c(0.15, 0.85))
      combined_expr_plot

    } else {
      NULL  # If no splice_id is selected, don't plot anything
    }
  })
  
  # Plot output
  output$combined_expr_plot <- renderPlot({
    combined_expr_plot()  # Call the reactive expression
  })
  
  
  # Reactive expression to generate combined_plot
  histology_psi_plot <- reactive({
    selected_row <- input$filteredTable_rows_selected  # Get the selected row index
    if (length(selected_row) > 0) {
      selected_data <- filteredData()[selected_row, ]
      selected_splice_id <- selected_data$splice_id
      
      # Filter data for psi plot
      all_rows_with_splice_id <- filteredData()[filteredData()$splice_id == selected_splice_id, ]
      
      # Filter exon ct data
      filtered_psi <- pbta_psi_df %>%
        dplyr::select(sample_id, histology, selected_splice_id) %>%
        dplyr::rename(psi = selected_splice_id) %>%
        dplyr::mutate(histology = case_when(
          histology == "Atypical Teratoid Rhabdoid Tumor" ~ "ATRT",
          TRUE ~ histology
        ))
      
      plot_group_palette <- unique(plot_mapping$plot_group_hex)
      names(plot_group_palette) <- unique(plot_mapping$plot_group)
      
      plot_group_palette["Non-neoplastic tumor"] <- "black"
      names(plot_group_palette) <- ifelse(names(plot_group_palette) == "Atypical Teratoid Rhabdoid Tumor",
                                          "ATRT", names(plot_group_palette))
      
      # Create the psi box plot
      histology_psi_plot <- ggplot(filtered_psi, aes(x = histology, 
                                            y = psi,
                                            fill = histology, 
                                            color = histology)) +
        geom_boxplot(alpha = 0.5, outlier.shape = NA,
                     show.legend = FALSE) +  # Transparent box plot
        geom_jitter(width = 0.2, height = 0, alpha = 0.7,
                    show.legend = FALSE) +  # Jittered individual points
        labs(title = NULL,
             x = NULL,
             y = "PSI") +
        scale_fill_manual(values = plot_group_palette, 
                          breaks = sort(names(plot_group_palette))) +
        scale_color_manual(values = plot_group_palette, 
                          breaks = sort(names(plot_group_palette))) +
        coord_cartesian(ylim = c(0, 1)) +
        theme_Publication() +
        theme(axis.text.x = element_text(angle = 45, hjust = 1, size = 12))

      
      histology_psi_plot

    } else {
      NULL  # If no splice_id is selected, don't plot anything
    }
  })
  
  # Plot output
  output$histology_psi_plot <- renderPlot({
    histology_psi_plot()  # Call the reactive expression
  })
  
  
  # Reactive expression to generate combined_plot
  histology_expr_plot <- reactive({
    selected_row <- input$filteredTable_rows_selected  # Get the selected row index
    if (length(selected_row) > 0) {
      selected_data <- filteredData()[selected_row, ]
      selected_exon_id <- selected_data$exon_id

      # Filter exon ct data
      filtered_cts <- pbta_exon_ct_df %>%
        dplyr::select(sample_id, histology, selected_exon_id) %>%
        dplyr::rename(norm_exon_coverage = selected_exon_id) %>%
        dplyr::mutate(histology = case_when(
          histology == "Atypical Teratoid Rhabdoid Tumor" ~ "ATRT",
          TRUE ~ histology
        ))
      
      plot_group_palette <- unique(plot_mapping$plot_group_hex)
      names(plot_group_palette) <- unique(plot_mapping$plot_group)
      
      plot_group_palette["Non-neoplastic tumor"] <- "black"
      names(plot_group_palette) <- ifelse(names(plot_group_palette) == "Atypical Teratoid Rhabdoid Tumor",
                                          "ATRT", names(plot_group_palette))
      
      max_y <- max(filtered_cts$norm_exon_coverage,
                   na.rm = TRUE) * 1.25
      
      # Create the psi box plot
      histology_expr_plot <- ggplot(filtered_cts, aes(x = histology, 
                                            y = norm_exon_coverage,
                                            fill = histology,
                                            color = histology)) +
        geom_boxplot(alpha = 0.5, outlier.shape = NA,
                     show.legend = FALSE) +  # Transparent box plot
        geom_jitter(width = 0.2, height = 0, alpha = 0.7,
                    show.legend = FALSE) +  # Jittered individual points
        labs(title = NULL,
             x = NULL,
             y = "Normalized Exon Expr.") +
        scale_fill_manual(values = plot_group_palette, 
                          breaks = sort(names(plot_group_palette))) +
        scale_color_manual(values = plot_group_palette, 
                           breaks = sort(names(plot_group_palette))) +
        coord_cartesian(ylim = c(0, max_y)) +
        theme_Publication() +
        theme(axis.text.x = element_text(angle = 45, hjust = 1, size = 12))
      
      histology_expr_plot
      
    } else {
      NULL  # If no splice_id is selected, don't plot anything
    }
  })
  
  # Plot output
  output$histology_expr_plot <- renderPlot({
    histology_expr_plot()  # Call the reactive expression
  })
  
  # Download handler for the plot
  output$download_psi_plot <- downloadHandler(
    filename = function() {
      paste("plot_", Sys.Date(), ".pdf", sep = "")
    },
    content = function(file) {
      ggsave(file, plot = combined_plot(), device = "pdf", width = 13, height = 5)
    }
  )
  
#  reactive expression to plot gene model
  gene_model_plot <- reactive({
    selected_row <- input$filteredTable_rows_selected
    if (length(selected_row) > 0) {
      selected_data <- filteredData()[selected_row, ]
      gene <- selected_data$gene_symbol  # Extract gene_symbol
      selected_splice_id <- selected_data$splice_id

      gene_gtf <- gtf_df %>%
        dplyr::filter(gene_name == gene, type == "exon") %>%
        dplyr::rename(exon_start = start, exon_end = end) %>%
        arrange(desc(exon_start)) %>%
        distinct(exon_start, exon_end, transcript_name, .keep_all = TRUE)

      exon_coords <- as.numeric(unlist(str_extract_all(sub("^[^_]*_", "", selected_splice_id), "\\d+")))

      # First, third, and fifth are exon starts; second, fourth, and sixth are exon ends
      exon_starts <- c(exon_coords[1], as.character(as.numeric(exon_coords[c(3, 5)]) + 1))
      exon_ends <- exon_coords[c(2, 4, 6)]
      
      exon_coords <- c(glue::glue("{exon_starts[1]}:{exon_ends[1]}"),
                       glue::glue("{exon_starts[2]}:{exon_ends[2]}"),
                       glue::glue("{exon_starts[3]}:{exon_ends[3]}"))

      # Add a 'highlight' column to gene_gtf for plotting
      gene_gtf <- gene_gtf %>%
        mutate(highlight = ifelse(glue::glue("{exon_start}:{exon_end}") %in% exon_coords, TRUE, FALSE))
      
      chr <- unique(gene_gtf$seqnames)

      transcript_lines <- gene_gtf %>%
        group_by(transcript_name) %>%
        summarize(leftmost = min(exon_start), rightmost = max(exon_end))

      gene_model_plot <- ggplot(gene_gtf) +
        # Existing exon rectangles
        geom_rect(aes(xmin = exon_start, xmax = exon_end, ymin = 0, ymax = 1),
                  color = "black", fill = "black") +

        # Add arrows above the selected exons
        geom_segment(data = gene_gtf %>% filter(highlight == TRUE),
                     aes(x = (exon_start+exon_end)/2, xend = (exon_start+exon_end)/2, y = 1.25, yend = 1.05),  # Place the arrows slightly above y=1
                     arrow = arrow(length = unit(0.2, "cm")),  # Customize arrow size
                     color = "red", size = 1) +  # Customize arrow color and size

        labs(x = NULL, y = NULL, title = NULL) +
        xlim(c(min(gene_gtf$exon_start) - 100, max(gene_gtf$exon_end) + 100)) +
        ylim(0, 1.25) +  # Increase y limit to make space for arrows
        facet_wrap(~gene_name, strip.position = "left") +
        theme_classic() +
        theme(axis.text.y = element_blank(),
              axis.ticks.y = element_blank(),
              axis.text.x = element_blank(),
              axis.ticks.x = element_blank(),
              strip.text.y.left = element_text(angle = 0))

      transcript_plot <- ggplot(gene_gtf) +
        geom_segment(data = transcript_lines,
                     aes(x = leftmost, xend = rightmost, y = 0.5, yend = 0.5),
                     color = "black", size = 0.5) +
        geom_rect(aes(xmin = exon_start, xmax = exon_end,
                      ymin = 0, ymax = 1,
                      color = transcript_type,
                      fill = transcript_type)) +
        scale_fill_manual(values = c("protein_coding" = "goldenrod", "nonsense_mediated_decay" = "blue3",
                                     "retained_intron" = "gray", "processed_transcript" = "green3")) +
        scale_color_manual(values = c("protein_coding" = "goldenrod", "nonsense_mediated_decay" = "blue3",
                                     "retained_intron" = "gray", "processed_transcript" = "green3")) +
        labs(x = glue::glue("{chr} position"), y = NULL, title = NULL,
             fill = "Transcript type", color = "Transcript type") +
        facet_wrap(~transcript_name, ncol = 1, strip.position = "left") +
        xlim(c(min(gene_gtf$exon_start) - 100, max(gene_gtf$exon_end) + 100)) +
        ylim(0,1) +
        theme_classic() +
        theme(axis.text.y = element_blank(),
              axis.ticks.y = element_blank(),
              strip.text.y.left = element_text(angle = 0))

      ggarrange(gene_model_plot, transcript_plot, ncol = 1, common.legend = TRUE,
                legend = "bottom", heights = c(0.1, 0.9), align = "v")
    }
  })

  # Plot gene model
  output$gene_model_plot <- renderPlot({
    gene_model_plot()  # Call the reactive expression
  })

  # Download handler for the gene model plot
  output$download_gene_plot <- downloadHandler(
    filename = function() {
      paste("plot_", Sys.Date(), ".pdf", sep = "")
    },
    content = function(file) {
      ggsave(file, plot = gene_model_plot(), device = "pdf", width = 12, height = 10)
    }
  )
  
}

# Run the application 
shinyApp(ui = ui, server = server)
