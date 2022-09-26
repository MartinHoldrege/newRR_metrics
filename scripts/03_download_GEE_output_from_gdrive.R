# Martin Holdrege

# Script started Sept 25, 2022

# Purpose: download rasters that have been exported to google drive
# in the .js scripts(s)


# dependencies ------------------------------------------------------------

library(googledrive)
library(stringr)
library(tidyverse)

# get file paths drive --------------------------------------------------------


files1 <- drive_ls(path = "newRR_metrics",
                        pattern = "(^area)|(^RAP_)")
files1

# download  ---------------------------------------------------------------

files2 <- files1 %>% 
  mutate(modifiedTime = map_chr(drive_resource, function(x) x$modifiedTime)) %>% 
  # if multiple files with the same
  # name only download the newer one
  group_by(name) %>% 
  filter(modifiedTime == max(modifiedTime))


# area files --------------------------------------------------------------


area_files <- files2 %>%
  filter(str_detect(name, '^area')) 

for (i in 1:nrow(area_files)) {
  drive_download(file = area_files$id[i], 
                 path = file.path("data_processed/", area_files$name[i]),
                 overwrite = TRUE)
}
                 
