# Martin Holdrege

# Date started: 12/13/2022

# Purpose--parse tables of feral horse estimates from the BLM
# pdfs downloaded from this site: https://www.blm.gov/programs/wild-horse-and-burro/about-the-program/program-data
# pdf file names were left alone except the year of the data was prepended.

# Note--this is a work in progress. Properly extracting this data
# will be challenging, especially with the pdftools package. 

# dependencies ------------------------------------------------------------

library(tidyverse)
library(pdftools)

# note Coates 2021 used tabulizer to parse the tables from these pdf's
# but that package is currently being rebuilt (doesn't work with curren version
# of JAVA?)

# PDE R package is another option but I could figure out how to get the 
# dependencies (command line tools) to work. 

# read in pdfs ------------------------------------------------------------

paths <- list.files("data_raw/blm_horse_pop_estimates/",
                    pattern = ".pdf$",
                    full.names = TRUE)

names(paths) <- paths %>% 
  basename() %>% 
  str_extract("^\\d{4}")

txt1 <- pdf_text(paths['2020'])


# examine -----------------------------------------------------------------

txt1[4]
cat(txt1[4])
remotes::install_github(c("ropensci/tabulizerjars", "ropensci/tabulizer"), INSTALL_opts = "--no-multiarch")
