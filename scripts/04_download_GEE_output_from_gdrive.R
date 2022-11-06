# Martin Holdrege

# Script started Sept 25, 2022

# Purpose: download rasters that have been exported to google drive
# in the .js scripts(s)


# dependencies ------------------------------------------------------------

library(googledrive)
library(stringr)
library(tidyverse)
# for drive_download_from_df function
source("../SEI/src/general_functions.R")

# get file paths drive --------------------------------------------------------


files1 <- drive_ls(path = "newRR_metrics")
files1

# select most recent date -------------------------------------------------
# sometimes multiple files are loaded to gdrive over time,
# and the date is appended to the file names, I only want the
# one with the most recent date

files2 <- files1 %>% 
  # name no date removes the date and everything after the 
  # date (b/ multi tile tifs have coordinates after that
  # and they belong to the same original image)
  mutate(name_no_date = str_replace(name, "202\\d{5}.+", ""),
         date = str_extract(name, "202\\d{5}"),
         date = lubridate::ymd(date),
         modifiedTime = map_chr(drive_resource, function(x) x$modifiedTime)) %>% 
  # if multiple files with the same
  # name only download the newer one
  group_by(name) %>% 
  filter(modifiedTime == max(modifiedTime),
         # don't download files from test runs
         !str_detect(name, "testRun")) %>% 
  # if multiple files create with different date strings
  # only keep the recent one 
  group_by(name_no_date) %>% 
  filter(date == max(date))
files2

# area files --------------------------------------------------------------

area_files <- files2 %>%
  filter(str_detect(name, '^area.*\\.csv$')) 

drive_download_from_df(area_files, folder_path = "data_processed/area")


# RAP summary files -------------------------------------------------------

rap_files <- files2 %>%
  filter(str_detect(name, '^RAP.*\\.csv$')) 

drive_download_from_df(rap_files, folder_path = "data_processed/RAP")


# keys --------------------------------------------------------------------
# key matching the bin id and binSimple id

files2 %>%
  filter(str_detect(name, '^key.*\\.csv$')) %>% 
  drive_download_from_df(., folder_path = "data_processed/key")


# id rasters --------------------------------------------------------------

# raster of grouping ids

files2 %>% 
  filter(str_detect(name, "suidBinSimple_.*tif")) %>% 
  drive_download_from_df(folder_path = "data_processed/id_raster")
