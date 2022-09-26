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
source('scripts/functions.R')

# load data ---------------------------------------------------------------


# * area ------------------------------------------------------------------

area1 <- read_csv("data_processed/area-by-suidBin_20220925.csv",
                  col_types = 'cccc')

# process area ------------------------------------------------------------

area2 <- area1 %>% 
  select(area_m2, suidBin) %>% 
  mutate(suid = str_extract(suidBin, "^\\d{6}"),
         # convert back to the original suid that daniel used
         suid = as.numeric(suid) - 10^5,
         # the remaining digits are the binomial identifier code
         # that denotes which years (from 1986-2020) actually burned. 
         bin = as.numeric(str_replace(suidBin, '^\\d{6}', "")),
         years_burned = map(bin, bin_years_burned),
         area_ha = as.numeric(area_m2)/10^4) %>% 
  
  select(-area_m2)

# problem: some bin id's are zero
area2$bin %>% summary()
area2

summary(area2$area_ha)

filter(area2, bin ==0)

#--no data for 1986--this suggest an issue with the data processing!
area2$years_burned %>% unlist() %>% unique() %>% sort()
area2$years_burned %>% unlist() %>% hist()

