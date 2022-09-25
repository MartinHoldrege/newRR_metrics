# Martin Holdrege


# Purpose convert json file to shapefile so that it can
# be ingested into GEE


# dependencies -----------------------------------------------------------
library(sf)

# read in file ------------------------------------------------------------

x1 <- read_sf("../cheatgrass_fire/data_raw/combined_wildland_fire_dataset/Fire_Feature_Data_ArcMap10x.gdb/Fire_Feature_Data_v10.gdb")


# convert and save --------------------------------------------------------
# the complete dataset
sf::write_sf(x1, 'data_processed/usgs_combined_wildland_fire/usgs_combined_wildland_fire_complete.shp')


