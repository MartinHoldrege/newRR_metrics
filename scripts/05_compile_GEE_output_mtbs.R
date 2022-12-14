# Martin Holdrege

# script started 12/13/2022

# Purpose: compile output of GEE in a useable format for 
# JB. 

# This includes getting the area of each combination of fire years (denoted
# by a binomial code) and
# simulation units
# and the fire severity category (ie suidBinSevSimple)
# Additionally compile the data on mean cover for each year and suidBinSev
# this is data compiled based on MTBS


# dependencies ------------------------------------------------------------

library(tidyverse)
library(terra)
source('src/functions.R')

# constants ---------------------------------------------------------------

date_string <- "20221213" # for appending to files

# load data ---------------------------------------------------------------


# * area ------------------------------------------------------------------
# amount of area belong to each suidBinSevSimple

# keeping main portion of file name for naming of output files
area_name_base <- "area-by-suidBinSevSimple_mtbs_1986_2020_30m_"
area1 <- read_csv(paste0("data_processed/area/", area_name_base, 
                         "20221212.csv"),
                  col_types = 'cccc')

# * keys ------------------------------------------------------------------
# keys created in 02_compile_fire_data_mtbs.js

yr_res <- "_1986_2020_30m_" # time period and resolution of underlying data 
key_base <- paste0(yr_res, "20221212.csv")

# binary fire code (i.e. which years burned)
key_bin1 <- read_csv(paste0("data_processed/key/mtbs_key_binary-fire-code",
                            key_base),
                 col_types = 'cccc') %>% 
  select(-`system:index`, - .geo) 

# severity fire code (i.e. what the fire severity of those years was)
key_sev1 <- read_csv(paste0("data_processed/key/mtbs_key_severity-fire-code",
                            key_base),
                     col_types = 'cccc') %>% 
  select(-`system:index`, - .geo)

# simplified combined key of which years burned and their fire severity
key_binsev1 <- read_csv(paste0("data_processed/key/mtbs_key_binary-severity-fire-code",
                            key_base),
                     col_types = 'ccccc') %>% 
  select(-`system:index`, - .geo)

# * rap  --------------------------------------------------------------

# cover of annuals, perennials, shrubs, trees
rap_paths <- paste0("data_processed/RAP/RAP_", 
                    # different functional types data outputed for
                    #c("AFG", "PFG", "SHR", "TRE"),
                    "AFG",
                    "-by-suidBinSevSimple-year_mtbs", 
                    yr_res, "20221212.csv")

# suidBinSevSimple is a longer number, so safer to keep as character
rap1 <- map(rap_paths, read_csv, col_types = 'ccdcdc')


# * raster of ids ---------------------------------------------------------
# GEE outputs lare images as multiple tiles, here I'm combining them
# back into one

r_paths <- list.files("data_processed/id_raster/",
                      pattern = paste0("suidBinSevSimple_mtbs",
                                       yr_res,
                                       "20221212"),
                      full.names = TRUE)

r_id_l <- map(r_paths, rast)
# process keys ------------------------------------------------------------


key_bin2 <- key_bin1 %>% 
  # accidentally stored as decimals (e.g. 1.0), should be digits
  mutate(across(.fns = str_replace, pattern = "\\.0$", replacement = ""))

key_sev2 <- key_sev1 %>% 
  # accidentally stored as decimals (e.g. 1.0), should be digits
  mutate(across(.fns = str_replace, pattern = "\\.0$", replacement = ""))


# error checking. The different keys tables should
# have matching 'id' columns
same_elements(key_binsev1$binSimple, key_bin2$binSimple)
same_elements(key_binsev1$sevSimple, key_sev2$sevSimple)


# key matching the bin id (a long integer) to the binSimple (a short integer)
# this key was created in 02_compile_fire_data.js

key1 <- key_binsev1 %>% 
  left_join(key_bin2, by = "binSimple") %>% 
  left_join(key_sev2, by = "sevSimple") %>% 
  # calculating years that fires occured
  mutate(# converting numeric b/ greater precision in floats 
         # thant 32bit integers
         bin = as.numeric(bin),
         years_burned = map(bin, bin_years_burned),
         years_burned_chr = map_chr(years_burned, paste, collapse = "_"),
         n_yrs_burned = map_dbl(years_burned, length),
         binSevSimple = str_replace(binSevSimple, "\\.0$", ""))

# continue HERE

# only room in suidBinSimple for 5 digits, so if larger
# binSimple value it will get cut off
stopifnot(max(key2$binSimple) < 10^5)

# years that show up as burned in the dataset
years_burned <- key2$years_burned %>% unlist() 
#hist(years_burned, breaks = 30)

# checking that years are looking correct
test_diff <- years_burned %>% unique() %>% sort() %>% diff

stopifnot(max(years_burned) == 2020,
          min(years_burned) == 1986,
          # no years are missing (which would be suspicous given that
          # over this big an area I expect something to burn every yr)
          test_diff == 1)


# process area ------------------------------------------------------------

area2 <- area1 %>% 
  select(area_m2, suidBinSimple) %>% 
  mutate(suid = str_extract(suidBinSimple, "^\\d{6}"),
         # convert back to the original suid that daniel used
         suid = as.numeric(suid) - 10^5,
         # the remaining digits are the binomial identifier code
         # that denotes which years (from 1986-2020) actually burned. 
         binSimple = as.integer(str_replace(suidBinSimple, '^\\d{6}', "")),
         area_ha = as.numeric(area_m2)/10^4) %>% 
  select(-area_m2)


# check for errors
stopifnot(area2$binSimple %in% key2$binSimple)

# add in information about about each binSimple
area3 <- area2 %>% 
  left_join(select(key2, -years_burned), by = "binSimple") %>% 
  select(-binSimple, - bin)

area3


# process RAP -------------------------------------------------------------

rap2 <- map_dfr(rap1, .f = select, -`system:index`, -.geo)


rap3 <- rap2 %>% 
  mutate(bandName = str_to_lower(bandName),
         # for now all datasets are cover, so adding "Cov" to name
         bandName = paste0(bandName, "Cov")) %>% 
  pivot_wider(values_from = "meanValue", names_from = "bandName")

# shouldn't be any id's in the rap data that aren't in the
# area key
stopifnot(unique(rap3$suidBinSimple) %in% area3$suidBinSimple)


# process id rasters ------------------------------------------------------
# combine tiles of suidBinSimple image

r_id1 <- sprc(r_id_l)
r_id2 <- merge(r_id1) # merge into a single raster

# save outputs ------------------------------------------------------------

# info on each cluster of pixels
write_csv(area3, paste0("data_processed/area/", area_name_base,  
                        "info-added_", date_string, ".csv"))

# RAP
# eventually this file should include all the rap cover
write_csv(rap3, paste0("data_processed/RAP/RAP_clean_by-suidBinSimple-year", 
                       yr_res, date_string, ".csv"))

# raster of ids
writeRaster(r_id2, paste0("data_processed/id_raster/combined_suidBinSimple",
                          yr_res, date_string, ".tif"))
