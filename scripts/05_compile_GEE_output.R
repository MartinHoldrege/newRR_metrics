# Martin Holdrege

# script started 9/25/2022

# Purpose: compile output of GEE in a useable format for 
# JB. 

# This includes getting the area of each combination of fire years (denoted
# by a binomial code) and
# simulation units ( ie the suidBin)
# Additionally compile the data on mean cover for each year and suidBin



# dependencies ------------------------------------------------------------

library(tidyverse)
source('src/functions.R')


# constants ---------------------------------------------------------------

date_string <- "20221101" # for appending to files

# load data ---------------------------------------------------------------


# * area ------------------------------------------------------------------
# amount of area belong to each suidBinSimple

# keeping main portion of file name for naming of output files
area_name_base <- "area-by-suidBinSimple_1986_2020_30m_"
area1 <- read_csv(paste0("data_processed/area/", area_name_base, 
                         "20221031.csv"),
                  col_types = 'cccc')

# * keys ------------------------------------------------------------------

key1 <- read_csv("data_processed/key/key_binary-fire-code_simple_1986_2020_30m_20221031.csv",
                 col_types = 'cccc') %>% 
  select(-`system:index`, - .geo)


# * rap  --------------------------------------------------------------

# cover of annuals

yr_res <- "_1986_2020_30m_" # time period and resolution of underlying data 

afg1 <- read_csv(paste0("data_processed/RAP/RAP_AFG-by-suidBinSimple-year", 
                        yr_res, "20221031.csv"))

# process keys ------------------------------------------------------------

# key matching the bin id (a long integer) to the binSimple (a short integer)
# this key was created in 02_compile_fire_data.js

key2 <- key1 %>% 
  mutate(binSimple = as.integer(binSimple),
         # converting numeric b/ greater precision in floats 
         # thant 32bit integers
         bin = as.numeric(bin),
         years_burned = map(bin, bin_years_burned),
         years_burned_chr = map_chr(years_burned, paste, collapse = "_"),
         n_yrs_burned = map_dbl(years_burned, length))

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

afg2 <- afg1 %>% 
  select(-`system:index`, -.geo)

# assuming all mean values are from the same image layer
stopifnot(length(unique(afg1$bandName)) == 1)

afg3 <- afg2 %>% 
  rename(afgCov = meanValue) %>% 
  select(-bandName)


# save outputs ------------------------------------------------------------

# info on each cluster of pixels
write_csv(area3, paste0("data_processed/area/", area_name_base,  
                 "info-added_", date_string, ".csv"))

# RAP
# eventually this file should include all the rap cover
write_csv(afg3, paste0("data_processed/RAP/RAP_clean_by-suidBinSimple-year", 
                        yr_res, date_string, ".csv"))
afg3
